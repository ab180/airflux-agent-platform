# Self-Improvement Loop

airops 레포 자체를 자동으로 점진 개선하는 unattended loop.
사용자가 자리를 비우는 동안 백로그 top 항목을 1개씩 처리해 PR을 누적.

## 동작 개요

```
ralph-loop (외부 러너)
   └─ /improve-airops (한 iteration prompt)
        ├─ 1. backlog top open 항목 pick
        ├─ 2. 단일 누적 브랜치 improve/auto 준비 (없으면 lyon-v1에서 분기)
        ├─ 3. 작업
        ├─ 4. build + test + lint 검증
        ├─ 5. commit + push improve/auto (PR이 없으면 첫 iteration에 1번만 생성)
        ├─ 6. backlog 상태 갱신 (lyon-v1 직접 push)
        ├─ 7. 일일 로그 append
        └─ 8. ITERATION_COMPLETE 또는 BACKLOG_EMPTY 출력
```

**모든 iteration은 단일 PR에 commit이 누적된다.** 매 iteration이 별개 PR을 만들지 않는다.

다음 iteration은 ralph-loop의 Stop hook으로 자동 재진입.

## 시작

별도 Claude Code 세션에서:

```
/ralph-loop:ralph-loop --completion-promise=BACKLOG_EMPTY --max-iterations=50 /improve-airops
```

또는 `/ralph-loop` 단축 형태가 가능하면 그것도 OK.

## 멈추기

- `BACKLOG_EMPTY` 출력 시 자동 종료
- `--max-iterations=50` 도달 시 자동 종료
- Ctrl+C로 즉시 중지

## 진행 상황 확인

- 누적 PR: `gh pr list --head improve/auto --base lyon-v1`
- PR 커밋 누적: `gh pr view --head improve/auto -q .commits`
- 일일 로그: `docs/improvement/log/YYYY-MM-DD.md`
- 백로그 상태: `docs/improvement/backlog.md`

## 백로그 추가

사용자만 수동 추가. 다음 형식으로 한 줄:

```
| BL-XXX | P0|P1|P2 | <title> | <acceptance> | open | 0 | - |
```

## Safety rails (이미 적용됨)

- `.claude/settings.local.json` allow / deny
- `.claude/hooks/pre-bash.sh` PreToolUse hook
- main / master 작업 금지
- destructive 명령 (`rm -rf`, `git push --force`, `git reset --hard origin/*`) 차단
- secrets / `.env` / `.credentials` 수정 차단
- 외부 네트워크 차단 (gh CLI / npm registry만 허용)
- iteration time soft cap 12분, diff cap 500 lines / 15 files

## 다른 개발자가 자기 레포에 적용하기

이 시스템은 `airops`-specific 부분이 거의 없다 (PR base가 `lyon-v1`인 것 정도).
다른 레포에 옮기려면:

1. `.claude/settings.local.json` 복사 후 PR base 브랜치 패턴 수정
2. `.claude/hooks/pre-bash.sh` 그대로 복사
3. `.claude/commands/improve-airops.md` 복사 + base 브랜치 / 검증 명령 (npm vs pnpm vs yarn) 수정
4. `docs/improvement/{backlog,README}.md` + `scripts/improvement/append-log.sh` 복사
5. backlog 시드 작성 (자기 레포의 P0 후보)

장기적으로는 `@airops/improvement-loop` 패키지로 일반화 (Phase 1, 미구현).

## 알려진 한계

- ralph-loop의 Stop hook 정확 동작은 환경 의존. `--max-iterations`가 안전핀.
- `gh auth status` 만료 시 PR 생성 실패 → iteration이 fail로 표시되고 attempts++. 사용자 복귀 시 `gh auth login` 필요.
- `improve/*` 브랜치 누적 → 사용자가 PR 머지 후 정기 cleanup.
- `lyon-v1` push 충돌 가능 (외부 push 발생 시) → iteration fail 처리 후 다음 iteration `git pull --ff-only`.

## 알려진 위험 (자율주행 SHIP-WITH-RISK 결정)

리뷰(2026-04-27, gstack-autoplan)에서 다음 critical 우려가 적시됐고 사용자 결정으로 보류됐다. 복귀 후 첫 cleanup 대상.

- Helper script wildcard allow가 우회 통로 (settings.local.json `Bash(./scripts/improvement/*)`).
- pipefail 부재로 build/test/lint pipe가 실패 가려질 수 있음.
- `npm test` 무한 대기 시 timeout 강제 없음.
- atomic lock / lease 패턴 부재 — concurrent iteration race.
- lint coverage 결손 — apps/dashboard 외 패키지에는 lint 스크립트 없음.
- `gh auth login` 회복 경로 부재.
