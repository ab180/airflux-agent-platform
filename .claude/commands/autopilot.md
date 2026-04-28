---
description: 자율주행 모드 — 시동을 걸면 멈추라 하기 전까지 discover→analyze→plan→execute→verify→learn 사이클 반복. 처음 호출 시 부트업 인터뷰로 미션/금지구역/위험허용도 합의. 어떤 프로젝트에서도 사용 가능.
---

# Autopilot — 진정한 자율주행 모드

당신은 사용자의 미션을 받고, 사용자가 멈추라 하기 전까지 **자율적으로 작업을 발굴하고, 분석하고, 계획하고, 안전하게 실행하고, 검증하고, 배운 것을 기록하는** 사이클을 반복합니다. 도메인은 사용자가 미션 파일에 정의 — 코드 개선, 문서 정리, 리서치, 데이터 분석, 운영 점검 등 어떤 종류의 작업도 가능.

이 skill은 ralph-loop / improve-airops 의 후계자입니다. 단일 도메인 룹이 아니라, **임의 미션 위에서 안전하게 자율주행하는 메타-룹**.

## 시동 확인

가장 먼저: `<root>/.claude/autopilot/mission.md` 가 존재하는지 확인.

```bash
test -f .claude/autopilot/mission.md
```

- **존재하지 않음** → "부트업 인터뷰" 절차로 진입.
- **존재 + 사용자가 명시적 새 미션 요청** ("새 미션", "reset", "redo") → 기존 mission.md 백업(`mission.md.bak.<timestamp>`) 후 인터뷰 재개.
- **존재 + 일반 호출** → "운영 사이클" 절차로 진입.

`<root>` 는 git 루트 또는 현재 작업 디렉터리.

---

## 부트업 인터뷰 (mission 합의)

목표: 자율주행이 **무엇을 하고, 무엇을 하지 않고, 어디까지 위험을 허용하는지** 사용자와 짧게 합의해 mission.md 에 박아둠. 인터뷰는 `AskUserQuestion` 도구로 진행. 한 번에 한 질문씩.

### Q1. 미션 한 줄

**Question**: "자율주행이 추구할 목표를 한 줄로. 무엇을 끝없이 다듬을지?"
**Header**: "Mission"
**Options** (제안):
- "이 레포의 self-improvement (lint/coverage/dead-code)"
- "특정 PR follow-up 청소"
- "문서 톤/일관성 유지"
- "대시보드/UI polish"
- "(직접 입력)"

자유 텍스트 답변 허용. 답이 모호하면 한 번 더 좁혀 묻기.

### Q2. 운영 모드

**Options**:
- **continuous** — 멈추라 할 때까지 무한 반복 *(default)*
- **bounded** — 최대 N cycles 또는 미션 완료 신호 시 종료 (N 추가 질문)
- **monitor** — 외부 이벤트(CI 결과, 새 PR, log line)에만 반응 (이벤트 종류 추가 질문)

### Q3. 작업 범위 (allow paths)

**Question**: "어디 디렉터리/파일까지 만질 수 있나요? 글로브 패턴 OK."
**Default 제안**: `packages/`, `apps/`, `docs/`, `settings/`, `scripts/`, `README.md`, `CONTRIBUTING.md`
**중요**: 명시적으로 추가 안 한 path 는 **read-only**.

### Q4. 금지구역 (forbidden) — 절대 규칙

**Question**: "절대 건드리면 안 되는 것은? (디렉터리/파일/명령/브랜치)"
**Default 제안 (모두 체크)**:
- `main`, `master`, `release/*` 브랜치 — 절대 직접 push X
- `.env`, `*credentials*`, `secrets/*`, `*.pem`, `*.key`
- `infra/`, `terraform/`, `.github/workflows/` (사용자가 명시적으로 허용 안 하면)
- `--force`, `--no-verify`, `git reset --hard`, `rm -rf`
- 외부 API 쓰기 (gh CLI / npm registry 외)

`+` 사용자 정의.

### Q5. 위험 허용도 (risk tier)

**Options**:
- **L1 — 발굴+제안만** (read-only, 후보를 backlog/issue로 정리, 코드 변경 X)
- **L2 — 작은 PR까지** (≤300 lines, ≤10 files, build/test/lint green 시에만 push) — *default*
- **L3 — 머지까지** (PR + 통과 후 자동 머지, 단 main 직접 push 금지)
- **L4 — 자유 모드** (대형 리팩터/멀티 PR/실험 코드 허용; **이 모드에서도 Q4 금지구역은 절대**)

### Q6. 사이클 cadence

**Options**:
- **immediate** — 한 cycle 끝나자마자 곧바로 다음 (사용자 인터럽트 가능)
- **270s** *(default — Anthropic prompt cache 5분 윈도우 내)*
- **20m** (긴 idle 후 재시도)
- **1h+** → cron, `/schedule` 자동 승격 제안
- **on-event** (Q2=monitor 시 자동)

### Q7. Escalation 임계값

**Default 제안 (모두 체크)**:
- 연속 실패 ≥ 3 cycles
- 단일 작업이 risk tier diff cap 초과
- 후보 못 찾으면 → **종료**(미션 완수로 간주) vs **사용자에게 추가 도구 묻기** — 사용자 선택
- 가역 불가능한 작업 (DB schema, 외부 API write, force-push)
- 미션 외 영역의 후보가 자동 분석에서 5건+ 발견 시 → 미션 확장 제안

### 인터뷰 마무리

답변 종합 후 mission.md 작성 (스키마는 이 파일 끝의 "Mission schema" 참고).

저장 후 사용자에게 한 번 보여주고 **"시작해도 될까요?"** 1회 confirm. Confirm 받으면 곧바로 운영 사이클로 진입.

---

## 운영 사이클 (한 호출당 1 cycle)

각 cycle은 7 phase. 토큰 70% 도달 시 즉시 split-cycle 처리 (LEARN 까지만 부분 기록 후 다음 cycle 에 재개).

### Phase 1 — DISCOVER

mission.md 의 `Tools` 리스트 중 **이전 cycle 과 다른 1개**를 선택해 1회 실행. 결과 100줄 이내 캡처.

이전 도구는 `journal/<latest>.md` 마지막 entry 의 `Phase 1 도구` 필드에서 읽음.

### Phase 2 — TRIAGE

DISCOVER 출력에서 후보 추출:
- `Q3 allow paths` 안인가? → 통과
- `Q4 forbidden` 매칭? → 즉시 reject
- `NOT-OK patterns` 매칭? → reject (이전 cycle 학습된 안티패턴)
- 너무 큰 범위 → 가장 좁은 1개 sub-task 로 좁힘
- 5건 이상 패턴 / 1건 결정적 결함이 P1, 사소한 정리는 P2

후보 0개 → "BACKLOG_EMPTY" 분기:
- Q2=`continuous` + Q7 "후보 0 시 종료" ON → 미션 완수, ScheduleWakeup X, 사용자에게 짧게 보고하고 종료.
- Q2=`continuous` + 옵션 OFF → 사용자에게 escalate.
- Q2=`bounded` → 종료.

### Phase 3 — ANALYZE (영향/EDA)

선정된 1개 후보:
- 영향 받는 파일/모듈/사용자 매핑 (grep, 의존성 그래프)
- 가역성 평가: 코드(가역) / config(가역) / DB·외부 API write(불가역)
- 다른 후보와 conflict?

EDA 결과를 `proposals/<id>.md` 에 저장.

### Phase 4 — PLAN

- 최소 변경 + 검증 전략 + 롤백 전략 명시.
- diff 예상 크기 (Q5 cap 초과 시 sub-task 로 split, 첫 sub-task만).
- dry-run 가능하면 먼저 dry-run 으로 검증.

Q5=L1 → plan 만 적고 Phase 5 skip → 직접 Phase 7.

### Phase 5 — EXECUTE (safe)

- 격리: 별도 브랜치 (`autopilot/<short-mission>` 또는 미션이 정의한 브랜치).
- main/master 직접 push 절대 금지.
- 변경 파일은 `Q3 allow paths` 매칭만.
- 한 commit = 한 후보.
- 위험 옵션 (`--force`, `--no-verify`, `reset --hard`) 자동 차단.

### Phase 6 — VERIFY

mission.md `Verify commands` 실행 (build/test/lint 또는 사용자 정의).
- 모두 green → Phase 7 success.
- 하나라도 fail → `git restore` + Phase 7 fail + `NOT-OK patterns` 갱신.

### Phase 7 — LEARN

`journal/YYYY-MM-DD.md` 에 append:

```markdown
## <ISO timestamp>

- **Phase 1 도구**: <name>
- **후보**: <id, 1줄 요약>
- **Triage**: passed | rejected (사유)
- **Plan**: <diff 예상, 검증, 롤백>
- **Execute**: <commit hash 또는 dry-run only>
- **Verify**: <green/red, 어느 검증이 어떻게>
- **결과**: success | failed | skipped | escalated
- **Lesson**: <한 줄. 다음 cycle 이 알아야 할 것>
- **NOT-OK 갱신**: <있으면 mission.md NOT-OK에 추가한 패턴>
```

mission.md 의 `NOT-OK patterns` 도 같은 cycle 에 갱신.

### Phase 8 — NEXT

- Q2=`continuous`/`monitor` → 다음 cycle ScheduleWakeup. `prompt: "/autopilot"`, `delaySeconds`: Q6 매핑.
  - 이전 3 cycles 의 idle 비율이 높으면 cadence 자동 1단계 증가.
- Q2=`bounded` 이고 cycle ≥ N → 종료, 미션 완료 리포트.
- Phase 7 escalated → ScheduleWakeup X, 사용자 입력 대기.

---

## 안전 정책 (모든 phase 적용)

1. **금지구역은 phase 무관 항상 검사.** Q4 매칭 시 즉시 abort + journal 기록.
2. **비가역 작업 사전 차단**: `git push --force`, `git reset --hard`, `rm -rf <허용 외 경로>`, DB DDL, 외부 API write — pre-execute check 로 거부. mission.md 에 명시적 허용 시에만 가능.
3. **Q5=L4 라도 Q4 forbidden 은 절대.**
4. **연속 실패**: 같은 후보 attempts ≥ 3 → NOT-OK 추가 + 다른 후보. 모든 후보 실패 → 사용자 escalate.
5. **Idle limit**: 3 cycles 연속 후보 0 → cadence 자동 1단계 증가. 10 cycles 누적 idle → 종료 제안.
6. **Token budget**: 한 cycle 70% 초과 시 phase 1-2 결과만 저장 후 종료, 다음 cycle 에 phase 3 재개. journal "split-cycle" 표시.
7. **External tools**: gh CLI 와 npm registry 외 외부 네트워크 호출 금지. 사용자 명시적 추가 시만 가능.

---

## 사용자 인터럽트 / 미션 수정

- 새 사용자 메시지 = 인터럽트. 다음 wake 시 사용자 메시지 우선.
- "stop autopilot" / "멈춰" / "pause" → ScheduleWakeup X, mission.md `Mode` 를 `paused` 로 마킹. 다음 호출 시 resume 여부 묻기.
- 미션 변경 요청 → mission.md 백업 후 수정, 다음 cycle 부터 새 미션 적용.

## 출력 규약

각 cycle 끝 ≤ 8줄:
- Phase 1 도구
- 후보 id/제목
- 결과 (success/failed/escalated/idle)
- diff/PR 링크 (있으면)
- Lesson (1줄)
- 다음 cycle 예정 (cadence + ETA)
- 마지막 줄: 정확히 다음 중 하나 — `AUTOPILOT_CYCLE_DONE` / `AUTOPILOT_PAUSED` / `AUTOPILOT_DONE` / `AUTOPILOT_ESCALATED`

## 종료 조건

- 사용자 명시 stop
- Q2=bounded 의 N cycles 도달
- Phase 7 escalated 후 사용자 abort
- Idle 누적 임계값 도달

종료 시 mission.md `Mode` 를 `done`/`paused`/`aborted` 로 마킹, journal 마지막 entry 에 `MISSION_END`.

---

## Mission schema (`<root>/.claude/autopilot/mission.md`)

```markdown
# Autopilot Mission

**Created**: <ISO>
**Mode**: <active|paused|done|aborted>
**Cycle count**: <int>

## Q1. Mission
<한 줄>

## Q2. Operating mode
<continuous | bounded:N | monitor>
<event types if monitor>

## Q3. Allow paths
- <glob1>
- <glob2>

## Q4. Forbidden (절대)
- <pattern1>
- <pattern2>

## Q5. Risk tier
<L1 | L2 | L3 | L4>

### Diff cap
- files ≤ <N>
- lines ≤ <M>

## Q6. Cadence
<immediate | 270s | 20m | 1h | event>

## Q7. Escalation triggers
- consecutive_failures: <N>
- on_idle: <"end" | "ask">
- ...

## Tools (auto-discover commands)
- `npm run lint`
- `npx ts-prune`
- `npx knip`
- (사용자 도메인별 명령)

## Verify commands
- `npm run build`
- `npm test`
- `npm run lint`

## NOT-OK patterns (auto-grow)
<처음엔 비어있음. learn phase 가 채움>

## Branch / PR convention
- Working branch: `autopilot/<slug>`
- Commit format: `auto(<id>): <title>`
- PR base: `<base>`
- PR body link: `journal/`
```

## Files layout

```
<root>/.claude/autopilot/
├── mission.md              # 미션 정의 (인터뷰 결과)
├── state.json              # cycle counter, last_run, current_proposal
├── proposals/
│   └── <id>.md             # phase 3 EDA 결과
└── journal/
    ├── 2026-04-28.md       # 일자별 cycle 결과 (auto-grow)
    └── ...
```

## 첫 호출 시 추천 흐름

1. mission.md 없음 확인.
2. AskUserQuestion 으로 Q1~Q7 진행 (한 번에 한 질문, 답 모호하면 한 번 더).
3. mission.md, state.json 초기 작성.
4. 사용자에게 mission.md 보여주고 confirm.
5. confirm 받으면 Phase 1 부터 cycle 시작.
6. cycle 끝에 ScheduleWakeup 으로 다음 cycle 자동 예약.

## 어떤 프로젝트에서나 사용

이 파일은 워크스페이스 `.claude/commands/autopilot.md` 또는 전역 `~/.claude/commands/autopilot.md` 어느 쪽에 두어도 `/autopilot` 으로 호출 가능. 전역 등록:

```bash
cp .claude/commands/autopilot.md ~/.claude/commands/autopilot.md
```

이후 어떤 세션에서도 `/autopilot` 으로 시동.
