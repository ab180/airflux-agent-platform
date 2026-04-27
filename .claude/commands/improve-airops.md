---
description: One iteration of airops self-improvement (ralph-loop driven)
---

# Improve Airops — One Iteration

당신은 airops 레포 self-improvement loop의 **한 iteration**을 실행합니다.
이 prompt는 ralph-loop이 매 iteration 자동 주입합니다.

## 자율주행 원칙

- 모든 명령은 `.claude/settings.local.json` allow에 사전 등록되어 사용자 confirmation 없이 실행됩니다.
- destructive 명령은 deny + `.claude/hooks/pre-bash.sh`로 차단됩니다.
- main / master / 다른 사용자 브랜치 작업 금지.
- **모든 iteration은 단일 누적 브랜치 `improve/auto`에 커밋한다.** 매 iteration이 새 PR을 만들지 않고, 이미 열린 PR에 커밋이 누적된다.
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

### 2. 브랜치 준비 (단일 누적 브랜치 `improve/auto`)

- `git checkout lyon-v1` (먼저 lyon-v1로).
- `git pull --ff-only origin lyon-v1` (실패 시 다음 iteration로 양보, BACKLOG_EMPTY 출력 X, 그냥 종료).
- `git fetch origin improve/auto` 시도.
  - **`improve/auto`가 origin에 있으면**: `git checkout improve/auto` 후 `git pull --ff-only origin improve/auto` (실패 시 종료).
  - **없으면 (첫 iteration)**: `git checkout -b improve/auto` (lyon-v1에서 분기).

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

### 5. 커밋 + push + (필요 시) PR 생성

- `git add` 변경된 파일만. `.env`, `*credentials*`, `.claude/`, `node_modules/` 제외.
- `git commit -m "improve(<id>): <title>"`.
- `git push -u origin improve/auto`.
- **PR 존재 확인**: `gh pr list --head improve/auto --base lyon-v1 --state open --json number -q '.[0].number'`.
  - **결과가 빈 값이면 (PR 없음, 첫 iteration)**: `gh pr create --base lyon-v1 --head improve/auto --title "improve: self-improvement loop (cumulative)" --body "$(printf 'Self-improvement loop이 매 iteration마다 이 PR에 commit을 누적합니다.\n\n진행 상황: docs/improvement/backlog.md\n일일 로그: docs/improvement/log/\n\n첫 iteration: improve(%s): %s' "<id>" "<title>")"`. 출력 PR URL 기억.
  - **이미 있으면 (PR 존재)**: 새 PR 생성 안 함. 기존 PR URL을 그대로 사용 (위 명령 결과 + `gh pr view --json url -q .url`).

### 6. 백로그 갱신

**Success 경로** (커밋/push 성공):
- `git checkout lyon-v1`.
- `docs/improvement/backlog.md`에서 해당 항목의 `status`를 `in-pr`, `pr` 칸에 PR URL 기입 (모든 항목이 같은 PR URL을 가리킴).
- `git add docs/improvement/backlog.md`.
- `git commit -m "chore(backlog): mark <id> as in-pr"`.
- `git push origin lyon-v1`.

**Fail 경로** (검증 fail / diff cap 초과 / 다른 에러):
- `improve/auto`에서: `git restore .` `git clean -fd` `git checkout lyon-v1`. **`improve/auto` 브랜치는 삭제하지 않는다** (이전 iteration commit이 살아있음).
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
