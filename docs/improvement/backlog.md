# Improvement Backlog

> ralph-loop이 한 iteration마다 priority가 가장 높은 status=open 항목 1개를 처리한다.
> 처리 후 status를 `in-pr`로 바꾸고 `pr` 칸에 URL 기록한다.
> 사용자가 PR 머지/close 후 status를 `done`/`closed`로 갱신.

## 룰

- 항목당 `attempts` ≤ 3. 초과 시 status를 `stuck`으로 바꾸고 skip.
- 새 PR이 만들어지면 같은 PR에 `improve(<id>): <title>` 커밋 1개 + backlog 갱신은 lyon-v1에 직접 commit.
- diff cap: 한 PR diff ≤ 500 lines, files ≤ 15. 초과 시 항목을 sub-task로 쪼개고 첫 sub-task만 처리.
- 새 백로그 추가는 사용자 권한 (loop이 임의로 추가 금지).

## Open

| id | priority | title | acceptance | status | attempts | pr |
|---|---|---|---|---|---|---|
| BL-001 | P0 | 첫 5분 경험 매끄럽게 다듬기 | `airops start --local` (`packages/cli`) 한 명령으로 첫 agent 호출까지 안내가 명확. README 또는 docs에 절차 + 트러블슈팅 1쪽 추가. | open | 0 | - |
| BL-002 | P1 | FROZEN 항목 1건 검토 | `docs/FROZEN.md`에서 항목 1개 골라 현재 상태 검토 + 해제 가능 여부 판단 + 결과 문서화 (해제든 보류든). 코드 변경 최소. | open | 0 | - |
| BL-003 | P1 | 커버리지 부족 모듈 1개 보강 | `packages/server` 또는 `packages/core`에서 vitest 커버리지가 낮은 모듈 1개 선정해 단위 테스트 추가. 새 테스트 모두 green. | open | 0 | - |
| BL-004 | P2 | OSS split 경계 문서 일관성 | `README.md`, `CONTRIBUTING.md` (없으면 생성), `packages/server/src/ab180-extensions/AGENTS.md`가 ab180-extensions 경계를 같은 톤으로 설명. | open | 0 | - |
| BL-005 | P2 | dead code / unused export 정리 | knip 또는 ts-prune 1회 통과. 명백히 unused 한 export 5건 이상 제거. 빌드/테스트 green. | open | 0 | - |

## In-Progress / Done / Stuck

(loop이 채운다)
