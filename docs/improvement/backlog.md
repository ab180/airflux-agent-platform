# Improvement Backlog

> ralph-loop이 한 iteration마다 priority가 가장 높은 status=open 항목 1개를 처리한다.
> 처리 후 status를 `in-pr`로 바꾸고 `pr` 칸에 URL 기록한다.
> 사용자가 PR 머지/close 후 status를 `done`/`closed`로 갱신.

## 룰

- 항목당 `attempts` ≤ 3. 초과 시 status를 `stuck`으로 바꾸고 skip.
- 새 PR이 만들어지면 같은 PR에 `improve(<id>): <title>` 커밋 1개 + backlog 갱신은 lyon-v1에 직접 commit.
- diff cap: 한 PR diff ≤ 500 lines, files ≤ 15. 초과 시 항목을 sub-task로 쪼개고 첫 sub-task만 처리.

### 백로그 항목 추가 권한

- **사용자**: 모든 우선순위 (P0/P1/P2) 추가 가능. 자유 텍스트 acceptance 허용.
- **`improve-curator` skill (manager)**: P1, P2만 추가 가능. **P0는 사용자 전용.**
  자동 분석 도구 출력만 근거로 인용. 모델의 임의 의견은 거부.
- **`improve-airops` skill (worker)**: 직접 추가 금지. backlog가 비면 curator를 호출하고, curator도 추가 안 하면 `BACKLOG_EMPTY` 종료.

### Curator 가드레일 (산만함 방지)

- 한 호출에 추가 **최대 1건**.
- backlog의 `status=open` 누적 **≤ 3건**. 3건 이상이면 추가 금지하고 종료.
- 후보 근거는 **자동 분석 도구 출력만** 허용:
  `ts-prune`, `eslint`, `knip`, `tsc --noEmit`, `npm test --coverage`, vitest 빌드 경고, `git log` 패턴.
- 새 항목 acceptance에 **근거 명령 + 출력 일부**를 인용해야 함 (예: `ts-prune found "X" at path:line`).
- 기존 open / in-pr / 최근 done 항목과 **중복/유사 시 reject** + 사유 1줄 명시 후 종료.
- 우선순위 기준:
  - **P1**: 빌드 경고, 보안 lint, 명백한 dead code 5건+, 미사용 dependency, 깨진 baseline 테스트.
  - **P2**: 문서 톤 일관성, 사소한 dead export, 내부 명명 일관성.
  - **그 외 (의견/리팩터/스타일)**: 추가 금지 — 사용자가 직접 추가해야 함.

## Open

| id | priority | title | acceptance | status | attempts | pr |
|---|---|---|---|---|---|---|
| BL-001 | P0 | 첫 5분 경험 매끄럽게 다듬기 | `airops start --local` (`packages/cli`) 한 명령으로 첫 agent 호출까지 안내가 명확. README 또는 docs에 절차 + 트러블슈팅 1쪽 추가. | in-pr | 0 | https://github.com/ab180/airflux-agent-platform/pull/13 |
| BL-002 | P1 | FROZEN 항목 1건 검토 | `docs/FROZEN.md`에서 항목 1개 골라 현재 상태 검토 + 해제 가능 여부 판단 + 결과 문서화 (해제든 보류든). 코드 변경 최소. | in-pr | 0 | https://github.com/ab180/airflux-agent-platform/pull/13 |
| BL-003 | P1 | 커버리지 부족 모듈 1개 보강 | `packages/server` 또는 `packages/core`에서 vitest 커버리지가 낮은 모듈 1개 선정해 단위 테스트 추가. 새 테스트 모두 green. | in-pr | 0 | https://github.com/ab180/airflux-agent-platform/pull/13 |
| BL-004 | P2 | OSS split 경계 문서 일관성 | `README.md`, `CONTRIBUTING.md` (없으면 생성), `packages/server/src/ab180-extensions/AGENTS.md`가 ab180-extensions 경계를 같은 톤으로 설명. | in-pr | 0 | https://github.com/ab180/airflux-agent-platform/pull/13 |
| BL-005 | P2 | dead code / unused export 정리 | knip 또는 ts-prune 1회 통과. 명백히 unused 한 export 5건 이상 제거. 빌드/테스트 green. | in-pr | 0 | https://github.com/ab180/airflux-agent-platform/pull/13 |
| BL-006 | P2 | shadcn 미사용 UI 컴포넌트 제거 | `npx knip --include files` 출력에서 `apps/dashboard/src/components/ui/card.tsx`, `apps/dashboard/src/components/ui/scroll-area.tsx` 두 파일이 외부 importer 0개로 보고됨 (`grep -rn "ui/card\|ScrollArea" apps/dashboard/src` 로 교차 확인 — StatCard는 별도 파일). 두 파일 삭제, 빌드/테스트 green. | in-pr | 0 | https://github.com/ab180/airflux-agent-platform/pull/13 |
| BL-007 | P1 | dashboard baseline lint 에러 11건 해소 | `npm run lint` 가 lyon-v1 baseline에서 11 errors + 1 warning으로 fail 중. 카테고리: (1) react/no-unescaped-entities 6건 (`"` → `&quot;`), (2) react-hooks/purity 3건 (Date.now in render — `llm-health-banner.tsx:88,93,274`), (3) @typescript-eslint/no-require-imports 1건 (`sidebar.tsx:109`), (4) react-hooks/set-state-in-effect 1건 (`theme-toggle.tsx:15`). 11건 모두 수정해 `npm run lint` 가 0 error로 통과. | in-pr | 0 | https://github.com/ab180/airflux-agent-platform/pull/13 |

## In-Progress / Done / Stuck

(loop이 채운다)
