---
description: One iteration of airops self-improvement (ralph-loop driven)
---

# Improve Airops — One Iteration

당신은 airops 레포 self-improvement loop의 **한 iteration**을 실행합니다.
이 prompt는 ralph-loop이 매 iteration 자동 주입합니다.

## 자율주행 원칙

- 모든 명령은 `.claude/settings.local.json` allow에 사전 등록되어 사용자 confirmation 없이 실행됩니다.
- destructive 명령은 deny + `.claude/hooks/pre-bash.sh`로 차단됩니다.
- main / master / 다른 사용자 브랜치 작업 금지. 작업 브랜치는 항상 `improve/<id>-<short-slug>`.
- PR base 브랜치는 `lyon-v1`. 절대 main 아님.

## 컨텍스트 관리 (필수)

- **Read 제한**: `docs/improvement/backlog.md` 외 200줄 초과 파일은 직접 Read 금지. Agent(Explore) subagent에 위임하고 200단어 이하 요약만 받기. 200줄 이하 파일은 Read 허용.
- **iteration 토큰 70% 초과 시 즉시 `/compact` 호출.** 이후 절차 계속.
- **conversation 메모리에 의존 X.** 모든 state는 git history + `docs/improvement/backlog.md`에서 다시 읽기.
- **최종 출력은 ≤ 10줄.** 다음 iteration prompt 재주입 시 부담 줄이기.

## 절차

### 1. 백로그 점검

- `docs/improvement/backlog.md`를 Read.
- "## Open" 표에서 `status=open` 그리고 `attempts<3`인 항목 중 **priority가 가장 높은 1개** 선택 (P0 > P1 > P2).
- 그런 항목이 0개라면 **마지막 줄에 정확히 `BACKLOG_EMPTY` 출력 후 즉시 종료**. (이 토큰이 ralph-loop completion-promise.)

### 2. 브랜치 생성

- 현재 브랜치가 `lyon-v1`인지 확인 (`git status`). 아니면 `git checkout lyon-v1`.
- `git pull --ff-only origin lyon-v1` (실패 시 다음 iteration로 양보, BACKLOG_EMPTY 출력 X, 그냥 종료).
- slug = id 소문자 + title의 첫 단어 2-3개 kebab-case (예: `bl-001-first-five-min`).
- `git checkout -b improve/<slug>`.

### 3. 작업 수행

- 항목의 acceptance criteria를 만족시키는 **최소 변경**.
- 큰 탐색은 Agent(Explore)에 위임. 결과 요약만 받아 작업.
- 변경 파일은 `packages/`, `apps/`, `docs/`, `settings/`, `scripts/`, 루트 README/CONTRIBUTING/AGENTS.md만 허용.
- diff cap: 500 lines, files ≤ 15 초과 시 → 작업 폐기 (Step 6 fail 경로).

### 4. 검증 (모두 green이어야 PR 생성)

각각 별도 Bash 호출. 하나라도 fail이면 Step 6 fail 경로.

```bash
npm run build 2>&1 | tail -50
npm test 2>&1 | tail -50
npm run lint 2>&1 | tail -50
```

### 5. PR 생성 (검증 모두 green일 때)

- `git add` 변경된 파일만. `.env`, `*credentials*`, `.claude/`, `node_modules/` 제외.
- `git commit -m "improve(<id>): <title>"`.
- `git push -u origin improve/<slug>`.
- `gh pr create --base lyon-v1 --title "improve(<id>): <title>" --body "$(printf '## Backlog item\n- id: %s\n- title: %s\n\n## 변경 요약\n%s\n\n## 검증\n- build: green\n- test: green\n- lint: green\n' "<id>" "<title>" "<3-5줄 요약>")"`.
- 출력 PR URL 기억.

### 6. 백로그 갱신

**Success 경로** (PR 생성 성공):
- `git checkout lyon-v1`.
- `docs/improvement/backlog.md`에서 해당 항목의 `status`를 `in-pr`, `pr` 칸에 URL 기입.
- `git add docs/improvement/backlog.md`.
- `git commit -m "chore(backlog): mark <id> as in-pr"`.
- `git push origin lyon-v1`.

**Fail 경로** (검증 fail / diff cap 초과 / 다른 에러):
- 작업 브랜치에서: `git restore .` `git clean -fd` `git checkout lyon-v1` `git branch -D improve/<slug>`.
- `docs/improvement/backlog.md`에서 해당 항목 `attempts++`. attempts >= 3이면 status=`stuck`.
- `git add docs/improvement/backlog.md` → `git commit -m "chore(backlog): <id> attempt failed"` → `git push origin lyon-v1`.

### 7. 로그

```bash
bash scripts/improvement/append-log.sh "<id>" "<pr-url-or-dash>" "<success|failed|stuck>"
```

### 8. 요약 출력 (≤ 10줄)

- 처리한 항목 id + 제목 (1줄)
- 결과 (success / failed / stuck) (1줄)
- PR URL 또는 사유 (1줄)
- 검증 요약 (1줄)
- **마지막 줄: 정확히 `ITERATION_COMPLETE`** (또는 백로그 비었다면 `BACKLOG_EMPTY`)

## 안전 게이트 재확인

- main / master 작업 금지 (deny + hook).
- `.env`, secrets 파일 수정 금지.
- 외부 네트워크: gh CLI / npm registry만.
- attempts >= 3 → status=stuck → 다음 iteration으로 넘어감.
