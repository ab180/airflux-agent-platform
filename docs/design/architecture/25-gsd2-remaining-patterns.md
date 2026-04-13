# GSD-2 미구현 패턴 설계 (병렬 실행 + Git 워크트리)

> 현재 8/10 GSD-2 패턴 구현 완료. 나머지 2개는 인프라/코딩 에이전트 기능 필요.

## 패턴 9: 병렬 실행 (Parallel Dispatch)

### GSD-2 구현
- 마일스톤별 독립 워커 프로세스 생성
- `GSD_MILESTONE_LOCK=M002` 환경변수로 스코프 제한
- 파일 기반 IPC (signal/status JSON 파일)
- 의존성 그래프 기반 충돌 감지

### Airflux 적용 방안
```
[Orchestrator]
├── Worker 1 (agent-a: "DAU 분석")  → 독립 세션
├── Worker 2 (agent-b: "리텐션 분석") → 독립 세션
└── Worker 3 (agent-c: "매출 요약")  → 독립 세션
```

**구현 순서:**
1. `AgentRegistry.executeParallel(tasks[])` — Promise.allSettled로 병렬 실행
2. 각 태스크에 독립 세션ID 부여 (컨텍스트 오염 방지)
3. 비용 추적은 기존 `recordCost()`로 개별 기록
4. 실행 상태는 기존 `execution_state` 테이블로 추적
5. 결과 집계 후 단일 응답 반환

**필요 조건:** 에이전트가 동시에 LLM 호출 가능해야 함 (현재 가능)

**예상 소요:** 2-3일

## 패턴 10: Git 워크트리 격리 (Worktree Isolation)

### GSD-2 구현
- 마일스톤별 `.gsd/worktrees/<MID>/` 디렉토리
- `milestone/<MID>` 브랜치에서 작업
- 완료 시 squash merge → 클린 히스토리
- 상태 파일 forward/back sync

### Airflux 적용 방안
코딩 에이전트가 추가될 때 필요:
```
[code-agent] → worktree 생성 → 코드 수정 → 테스트 → PR 생성
```

**현재 Airflux는 코딩 에이전트가 아닌 데이터/분석 에이전트 플랫폼이므로 당장 불필요.**

향후 코딩 에이전트 추가 시:
1. `AgentConfig.isolation: 'worktree' | 'branch' | 'none'` 필드 추가
2. 에이전트 실행 전 워크트리 생성
3. 완료 후 자동 squash merge
4. Claude Code의 EnterWorktree/ExitWorktree 패턴 참고

**예상 소요:** 1주 (코딩 에이전트 전체 구현 포함)

## 현재 구현 현황

| # | 패턴 | 파일 | 상태 |
|---|------|------|------|
| 1 | 비용 추적 | `cost-tracker.ts` | ✅ |
| 2 | 검증 자동화 | `verification.ts` | ✅ |
| 3 | 예산 한도 | `query.ts` | ✅ |
| 4 | 컨텍스트 인젝션 | `assistant-agent.ts` | ✅ |
| 5 | Slack 연동 | `slack.ts` | ✅ |
| 6 | 스킬 디스커버리 | `skill-tracker.ts` | ✅ |
| 7 | 상태머신 | `execution-state.ts` | ✅ |
| 8 | 크래시 복구 | `bootstrap.ts` | ✅ |
| 9 | 병렬 실행 | — | ⬜ 설계 완료 |
| 10 | Git 워크트리 | — | ⬜ 설계 완료 |
