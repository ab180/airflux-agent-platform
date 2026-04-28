# Autopilot — Self-driving mission runner

`.claude/commands/autopilot.md` 의 `/autopilot` skill 이 사용하는 작업 디렉터리.

## Layout

```
.claude/autopilot/
├── README.md              # 이 파일
├── mission.md             # 미션 정의 (인터뷰 결과, 첫 호출 시 생성)
├── state.json             # cycle counter, 통계
├── templates/             # 신규 생성 시 참고할 템플릿
│   ├── mission.md
│   ├── state.json
│   ├── proposal.md
│   └── journal-entry.md
├── proposals/             # Phase 3 ANALYZE 결과 (id별 파일)
│   └── <id>.md
└── journal/               # 매 cycle 결과 (일자별 append)
    └── YYYY-MM-DD.md
```

## 사용법

```
/autopilot
```

처음 호출 → 부트업 인터뷰 (Q1~Q7) → mission.md 생성 → confirm → cycle 시작.
이후 호출 → mission.md 기준 1 cycle 실행 → 다음 cycle ScheduleWakeup 자동 예약.

## 다른 프로젝트에서 사용

전역 등록:

```bash
cp .claude/commands/autopilot.md ~/.claude/commands/autopilot.md
```

이후 어떤 세션에서든 `/autopilot` 으로 시동. 작업 디렉터리 (`.claude/autopilot/`)는 각 프로젝트별로 별도 생성됩니다.

## 멈추는 법

- 메시지 입력만 하면 인터럽트.
- "stop autopilot" / "멈춰" / "pause" → mission.md `Mode` 가 `paused` 로 변경, 다음 wake 안 함.
- 영구 종료: mission.md `Mode` 를 `done` 또는 `aborted` 로 수동 변경, 또는 `.claude/autopilot/` 디렉터리 삭제.
