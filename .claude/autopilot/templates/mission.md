# Autopilot Mission

**Created**: <!-- ISO timestamp, set on first save -->
**Mode**: active <!-- active | paused | done | aborted -->
**Cycle count**: 0

## Q1. Mission
<!-- 한 줄: 자율주행이 추구할 목표 -->

## Q2. Operating mode
<!-- continuous | bounded:N | monitor -->

## Q3. Allow paths
<!-- 글로브 패턴, 명시적으로 추가 안 한 path는 read-only -->
- packages/
- apps/
- docs/
- settings/
- scripts/
- README.md
- CONTRIBUTING.md

## Q4. Forbidden (절대)
- main, master, release/* 브랜치 직접 push
- .env, *credentials*, secrets/*, *.pem, *.key
- infra/, terraform/, .github/workflows/
- --force, --no-verify, git reset --hard, rm -rf
- 외부 API 쓰기 (gh CLI / npm registry 외)

## Q5. Risk tier
<!-- L1 | L2 | L3 | L4 -->

### Diff cap (tier에 따라)
- L1: 0 lines (read-only)
- L2: ≤ 300 lines, ≤ 10 files
- L3: ≤ 500 lines, ≤ 15 files
- L4: 사용자 승인 받은 한도

## Q6. Cadence
<!-- immediate | 270s | 20m | 1h | event -->

## Q7. Escalation triggers
- consecutive_failures: 3
- on_idle_no_candidate: end <!-- end | ask -->
- diff_cap_exceeded: split_or_escalate
- irreversible_action: always_escalate
- mission_external_signals: extend_proposal

## Tools (auto-discover commands — 사용자 도메인별 추가/제거)
- `npm run lint`
- `npx ts-prune -p packages/server/tsconfig.json`
- `npx knip --no-progress`
- `npx tsc --noEmit -p packages/server/tsconfig.json`
- `git log --oneline -20 origin/main..HEAD`
- `grep -rn "TODO\|FIXME" <Q3 paths>`

## Verify commands
- `npm run build`
- `npm test`
- `npm run lint`

## NOT-OK patterns (auto-grow — learn phase에서 갱신)
<!-- 처음엔 비어있음. 실패한 후보의 패턴이 누적됨. -->

## Branch / PR convention
- Working branch: `autopilot/<slug>`
- Commit format: `auto(<id>): <title>`
- PR base: <user-defined>
- PR body link: `.claude/autopilot/journal/`
