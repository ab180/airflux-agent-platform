# Autopilot — Inference / Cadence / Compaction / Storage Design

**Created**: 2026-04-28
**Status**: design (pending user review)
**Owner**: Hyeonjae

## Context

`.claude/commands/autopilot.md` 의 첫 버전이 머지된 직후 ([commit 105df1d](https://github.com/ab180/airflux-agent-platform/commit/105df1d)). 사용자는 다음을 요청:

1. 인터뷰 마찰 줄이기 — invocation args 에서 미션 일부 추론
2. cadence 옵션 명시 (15분 default, immediate~수동 spectrum)
3. 장기 자율주행 시 prompt-too-long 방지 — auto-compaction
4. 결과 저장 위치 정리 (일반 log vs milestone, 수정 가능 범위 분리)

이 문서는 위 4건을 단일 spec으로 묶어 정의한다. 첫 버전 SKILL 자체 구조는 유지하고 행동만 보강.

---

## 1. Inference policy (정정)

### 결정

**Skill invocation args 에서만 추론.** 현재 대화 컨텍스트, 프로젝트 아티팩트, 이전 mission.md.bak 모두 스캔하지 않는다. 인자가 없으면 cold start (전체 7문항 처음부터).

### 입력 예

```
/autopilot mission="lint cleanup" risk=L2 cadence=15m allow=packages/,apps/
```

파싱된 key=value 쌍을 Q1~Q8 에 매핑:

| key | 매핑 | 예 |
|---|---|---|
| `mission` | Q1 | "lint cleanup" |
| `mode` | Q2 | continuous \| bounded:N \| monitor |
| `allow` | Q3 | comma-separated globs |
| `forbidden` | Q4 | (defaults에 추가만, 제거 X) |
| `risk` | Q5 | L1 \| L2 \| L3 \| L4 |
| `cadence` | Q6 | immediate \| 2m \| 5m \| 15m \| 30m \| 1h \| manual |
| `escalate_idle` | Q7 partial | end \| ask |
| `compact` | Q8 | 60 \| 70 \| 80 \| 90 |

### 인터뷰 흐름 (Mode C — 추론 + 한 번 확인)

1. invocation args 파싱 → 매핑된 Q는 pre-fill, 나머지는 default 또는 unset.
2. 한 번의 AskUserQuestion 으로 draft mission 전체를 보여주고 옵션:
   - **전부 OK, 시작**
   - **일부만 수정** → cascade 로 수정 대상 Q 만 묻기
   - **처음부터 다시** → cold start
3. unset 항목은 cascade 단계에서 무조건 개별 질문.

### Provenance

mission.md 에 새 섹션:

```markdown
## Inference provenance
- Q1 (mission): args | default | user
- Q2 (mode): args | default | user
- ...
```

세 값:
- `args` — invocation args 에서 가져옴
- `default` — skill 의 default 사용
- `user` — cascade 단계에서 사용자가 입력

### 명세 외

- 대화/git 스캔 fallback 없음.
- 자동 추론 신뢰도 (HIGH/MEDIUM/LOW) 없음. args 면 args, 아니면 default.

---

## 2. Q6 Cadence menu

### 결정

7-tier 메뉴, 기본값 **15분**.

| 옵션 | 값 (s) | 의미 | 비용 메모 |
|---|---|---|---|
| `immediate` | 0 | cycle 끝나자마자 즉시 다음 | 가장 공격적, 토큰 max |
| `2m` | 120 | cache hit 권역 | 효율적 |
| `5m` | 300 | moderate | 캐시 윈도우 살짝 초과 |
| `15m` | 900 | **default** | 일반 |
| `30m` | 1800 | relaxed | idle 친화 |
| `1h+` | 3600+ | `/schedule` cron 변환 제안 | 장기, cloud |
| `manual` | — | ScheduleWakeup 호출 안 함 | 사용자 명시적 재호출까지 pause |

### 동작

- `immediate` 선택 시 `delaySeconds: 60` (ScheduleWakeup 의 floor 가 60s) 로 고정. 사용자에게 "60s가 사실상 immediate" 안내.
- `1h+` 선택 시 `/loop` 의 cloud 승격 제안 그대로 따름 (`/schedule` 호출).
- `manual` 선택 시 cycle 끝에 ScheduleWakeup X. mission.md `Mode` 는 `active-manual` 로 표시.
- Idle auto-throttle 은 그대로 유지 (3 cycles 연속 후보 0 → cadence 1단계 증가).

---

## 3. Q8 Auto-compaction (신규)

### 결정

**기본 80% 임계값. 매 cycle 끝에 컴팩션. 사용자가 mission.md 에서 조정 가능.**

### 메커니즘

- Phase 8 (NEXT) 직전에:
  1. 현재 conversation token 사용률 추정 (모델이 self-report 또는 길이 heuristic).
  2. ≥ Q8 threshold 이면 빌트인 `/compact` 호출.
  3. compact 후 ScheduleWakeup 예약.
- threshold 미달이어도 매 cycle 끝에 compact 한 번 호출 (사용자 요구: "1회 루프 끝나면 compaction 해두는 방식"). 이때는 light compaction 으로 동작 (most of context preserved).

### Mission.md 필드

```markdown
## Q8. Auto-compaction
- threshold: 80
- frequency: every-cycle  # every-cycle | threshold-only | off
```

`every-cycle` (default): 매 cycle 끝에 compact, threshold 무관.
`threshold-only`: 사용률 ≥ threshold 일 때만.
`off`: compaction 비활성. 사용자 책임.

### 명세 외

- compact 결과를 별도 백업하지 않음 (Claude Code 내장 행동에 의존).
- Mid-cycle compaction 없음 (사이클 중간에는 안 함). 한 사이클 토큰 70% 초과 시는 split-cycle 로 처리 (이미 SKILL 본문에 있음).

---

## 4. Storage layout

### 결정

**일반 journal: 변경 가능. Milestone: 고정 불변.**

```
<repo>/
├── .autopilot.log/                    # default, mission.md 에서 변경 가능
│   ├── mission.md
│   ├── state.json
│   ├── proposals/
│   │   └── <id>.md
│   └── journal/
│       └── YYYY-MM-DD.md
└── .autopilot.milestones/             # FIXED, 변경 불가
    └── YYYY-MM-DD-<slug>.md
```

### 변경 정책

- **`.autopilot.log/`**: mission.md 의 `## Storage` 섹션에서 `journal_root` 키로 변경 가능. 부트업 인터뷰 마지막 단계에서 default 경로 안내 + "다른 경로 원하면 지정" 옵션 제공. 예시: `docs/improvement/`, `.claude/autopilot/` 등.
- **`.autopilot.milestones/`**: skill code 에 hardcode. 사용자가 mission.md 에서 변경 시도해도 무시 + warning 로그.

### Mission.md 추가

```markdown
## Storage
- journal_root: .autopilot.log/    # mutable, default
- milestones_root: .autopilot.milestones/    # FIXED, immutable
```

### Migration

- 첫 cycle 시 `journal_root` 가 존재하지 않으면 자동 생성. `milestones_root` 도 자동 생성.
- 기존 `.claude/autopilot/` 사용자: 첫 호출 시 "기존 경로 발견 — 마이그레이션 할까요?" 1회 묻기. 거부 시 그대로 유지 (호환성).

---

## 5. Milestone auto-promotion (Mode A)

### 결정

**자동 승격만. 수동 플래그 없음.**

### 트리거 (4종)

매 cycle 끝의 LEARN phase 에서 다음 조건 매칭 시 journal entry 를 milestone 으로도 복제:

1. **PR merged** — `gh pr view <num> --json state` 가 `MERGED` 로 전환된 cycle.
2. **Bounded mission completion** — Q2=bounded 의 N cycles 모두 끝나거나 사용자 정의 완료 신호 도달.
3. **First zero-defect achievement** — 같은 검증 카테고리에서 처음으로 0 결과 달성. 예:
   - lint 11 errors → 0 errors (첫 회만)
   - test failures 5 → 0 (첫 회만)
   - coverage 0% module → ≥ 80% (특정 모듈에 대해 첫 회)
   - 추적 메타: `state.json` 의 `defect_baselines` 에 카테고리별 첫 zero 도달 여부 기록.
4. **Novel NOT-OK pattern** — `mission.md NOT-OK patterns` 에 새 패턴 추가된 cycle. 재발 방지 가치 있는 학습.

### Milestone 파일 형식

```markdown
# Milestone — <type>: <one-line>

**Date**: <ISO>
**Cycle**: <count>
**Trigger**: pr-merged | bounded-complete | first-zero-defect | novel-not-ok
**Source journal**: <journal/YYYY-MM-DD.md#anchor>

## What happened
<5-10줄 요약>

## Why it matters
<왜 milestone 인지 1-2줄>

## Artifacts
- PR: <url>
- Commit: <hash>
- Files: <list>
```

### 명세 외

- 사용자 수동 flag 없음. 잘못 승격된 milestone 발견 시 사용자가 수동으로 파일 삭제 (skill 이 다시 만들지 않음 — 같은 트리거가 재발하지 않는 한).
- Milestone 갯수 cap 없음. 폭주 우려 시 추후 가드 추가.

---

## 6. Mission.md 최종 schema

기존 schema 에서 변경/추가:

```markdown
# Autopilot Mission

**Created**: <ISO>
**Mode**: active | active-manual | paused | done | aborted
**Cycle count**: <int>

## Q1. Mission
<...>

## Q2. Operating mode
continuous | bounded:N | monitor

## Q3. Allow paths
- ...

## Q4. Forbidden
- ...

## Q5. Risk tier
L1 | L2 | L3 | L4
### Diff cap
- ...

## Q6. Cadence
immediate | 2m | 5m | 15m | 30m | 1h | manual    # default: 15m

## Q7. Escalation triggers
- ...

## Q8. Auto-compaction                            # NEW
- threshold: 60 | 70 | 80 | 90                    # default: 80
- frequency: every-cycle | threshold-only | off   # default: every-cycle

## Storage                                        # NEW
- journal_root: .autopilot.log/                   # mutable
- milestones_root: .autopilot.milestones/         # FIXED, do not edit

## Inference provenance                           # NEW
- Q1: args | default | user
- Q2: ...

## Tools
- ...

## Verify commands
- ...

## NOT-OK patterns (auto-grow)
<...>
```

---

## 7. State.json 추가 필드

```json
{
  "cycle_count": 0,
  "last_run_at": null,
  "last_tool_used": null,
  "consecutive_failures": 0,
  "consecutive_idle": 0,
  "current_proposal_id": null,
  "next_wakeup_at": null,
  "status": "fresh",

  "defect_baselines": {                  // NEW — first-zero-defect 추적
    "lint": { "ever_zero": false, "first_zero_at": null },
    "test": { "ever_zero": false, "first_zero_at": null },
    "coverage": { "modules_first_80": [] }
  },
  "compaction_history": []               // NEW — 매 cycle 끝 compact 시각
}
```

---

## 8. 변경 파일

| 파일 | 변경 |
|---|---|
| `.claude/commands/autopilot.md` | Q6 메뉴 갱신 (default 15m, immediate 추가), Q8 신규 섹션, Mode C 추론 절차 (args only) 보강, Cold start 명시, Storage 변경 정책, Milestone 트리거 정의 |
| `.claude/autopilot/templates/mission.md` | Q8, Storage, Inference provenance 섹션 추가, Q6 default 15m |
| `.claude/autopilot/templates/state.json` | `defect_baselines`, `compaction_history` 필드 |
| `.claude/autopilot/templates/milestone.md` (신규) | Milestone 파일 형식 템플릿 |
| `.autopilot.log/.gitignore` | 일반 journal 은 git 추적 권장 (PR review 가능). `.autopilot.milestones/` 는 항상 git 추적. |

---

## 9. 명세 외 (out of scope)

- 다중 미션 동시 운영 (한 레포에 미션 여러 개)
- Milestone 의 cross-repo 공유
- 외부 시스템 (Linear, Jira) 으로 milestone 자동 미러링
- Compaction 시 conversation 백업 → 별도 파일 저장
- 사용자 수동 milestone flag (Mode B/C 의 manual 부분)

추후 별도 spec 으로 다룰 가치 있는 항목들. 현재 spec 에는 포함하지 않음.

---

## 10. 검증 (이 spec 기반 implementation 시 확인 사항)

- [ ] `/autopilot mission=X risk=L2 cadence=15m` 호출 시 7문항 중 3개 pre-fill, 4개만 cascade 질문.
- [ ] `/autopilot` (인자 없음) 호출 시 7문항 cold start.
- [ ] mission.md 의 `journal_root` 변경 시 다음 cycle 부터 새 경로에 journal append.
- [ ] mission.md 의 `milestones_root` 수정 시도 무시 + warning.
- [ ] Phase 8 NEXT 직전 매번 `/compact` 호출 (every-cycle frequency 일 때).
- [ ] threshold-only frequency 일 때 사용률 < threshold 면 compact 안 함.
- [ ] PR 머지 감지 시 `.autopilot.milestones/<date>-pr-merged-<num>.md` 생성.
- [ ] lint 11 errors → 0 errors 달성 cycle 에서 milestone 생성. 이후 다시 0 errors 유지 cycle 에서는 milestone 생성 X (`ever_zero` flag).
- [ ] Q2=bounded:5, 5번째 cycle 끝나면 milestone + Mode=done.
- [ ] 새 NOT-OK 패턴 추가된 cycle 에서 milestone 생성. 같은 패턴 재추가는 X.
