---
description: Backlog curator — propose at most 1 new open item from automated analysis output (P1/P2 only)
---

# Improve Curator — One Pass

당신은 airops `docs/improvement/backlog.md` 의 **manager** 입니다.
한 번의 호출에서 **최대 1건의 후보**를 발굴해 추가하거나, 추가하지 않고 종료합니다.

이 skill은 `improve-airops` worker가 backlog가 비었을 때 호출하거나, 사용자가 명시적으로
호출할 수 있습니다. **단독으로는 코드 변경/PR/커밋을 만들지 않습니다.** 출력은 backlog
파일 1개 변경 + lyon-v1에 직접 commit.

## 권한 / 가드레일 (재확인)

- 우선순위 추가 범위: **P1, P2 만**. P0는 사용자 전용.
- 한 호출에 backlog 추가 최대 **1건**.
- backlog `status=open` 누적이 이미 **≥ 3건이면 즉시 종료** (추가 금지).
- 후보 근거는 다음 자동 분석 도구 출력만 허용:
  - `ts-prune` — 미사용 export
  - `eslint` (또는 `npm run lint`) — 빌드 경고/에러
  - `knip` — 미사용 file/dependency
  - `tsc --noEmit` — 타입 경고
  - `npm test` 출력 — 깨진 baseline 또는 명백한 커버리지 0 모듈
  - `git log` 패턴 — TODO/FIXME 잔재, 머지된 PR의 follow-up
- 모델 의견(예: "이 코드 더 깔끔하게"), 일반 리팩터/네이밍 취향은 **추가 금지**.
- 기존 open / in-pr / 최근 30일 done 항목과 중복/유사하면 reject + 사유 명시 후 종료.

## 절차

### 1. 사전 점검

- `docs/improvement/backlog.md` Read.
- "## Open" 표에서 `status=open` 개수 카운트. **≥ 3 이면 즉시 종료**, 마지막 줄에 정확히 `BACKLOG_FULL` 출력.
- "## Open" + "## In-Progress / Done / Stuck" 모든 행의 title + acceptance 키워드를 메모리에
  올림 (중복 검사용).

### 2. 자동 분석 1회 실행

다음 중 **상황에 맞는 1개**를 골라 1회만 실행. 출력을 100줄 이내로 캡처.

```bash
# 미사용 export
npx ts-prune -p packages/server/tsconfig.json 2>&1 | grep -v "(used in module)" | grep -v "src/index.ts" | head -50

# 빌드 경고/lint 에러
npm run lint 2>&1 | tail -80

# 미사용 file/dep
npx knip --no-progress 2>&1 | tail -80

# 타입 경고
npx tsc -p packages/server/tsconfig.json --noEmit 2>&1 | tail -50

# 머지된 PR의 follow-up TODO 잔재
grep -rn "TODO\|FIXME" packages/server/src packages/core/src 2>/dev/null | grep -v "node_modules" | head -30
```

> **Tip**: 직전 iteration에서 어떤 도구를 썼는지 git log (`git log --oneline -10 origin/lyon-v1`)
> 로 확인해 다른 도구를 골라 다양성 유지.

### 3. 후보 선정 + 중복 체크

- 출력에서 **5건 이상의 명백한 패턴** 또는 **단일 결정적 결함 1건**을 후보로 묶음.
- 너무 큰 범위(예: ts-prune 200줄)는 1개 모듈/디렉터리로 좁힘.
- **중복 체크**: 1단계에서 메모한 기존 항목 키워드와 60% 이상 겹치면 reject.
- 우선순위 매핑:
  - 빌드/lint 에러, 보안 lint, dead code 5건+, 깨진 baseline → **P1**
  - 문서/네이밍/사소한 정리 → **P2**
  - 그 외 → 후보 부적합 → 종료

### 4. 추가 또는 reject

**추가 경로**:

- 새 BL 번호 부여: 기존 max id + 1 (예: 마지막이 BL-005 → BL-006).
- backlog의 "## Open" 표 마지막 행으로 추가:
  ```
  | BL-XXX | P1|P2 | <간결한 제목> | <근거 명령 + 출력 일부 인용> + <명확한 acceptance> | open | 0 | - |
  ```
- acceptance 형식 예: `npx ts-prune showed 4 unused exports in packages/server/src/eval/. Remove all 4. build/test green.`
- 변경 commit (lyon-v1 직접):
  ```
  git add docs/improvement/backlog.md
  git commit -m "chore(backlog): curator added BL-XXX (<title>)"
  git push origin lyon-v1
  ```

**Reject 경로**:

- 추가하지 않음. 마지막 줄에 정확히 `CURATOR_NO_CANDIDATE` 출력.
- 사유 1줄 (어느 도구 출력에서 왜 후보가 안 나왔는지 또는 왜 모두 중복인지).

### 5. 출력 (≤ 6줄)

- 사용한 도구 1줄
- 후보 결정 1줄 (added BL-XXX / no candidate / backlog full)
- 근거 요약 1줄
- (added인 경우) 새 BL의 priority + acceptance 1줄 인용
- 마지막 줄: 정확히 다음 중 하나 — `CURATOR_ADDED` / `CURATOR_NO_CANDIDATE` / `BACKLOG_FULL`

## 안전 게이트 재확인

- main / master 작업 금지.
- backlog.md 외 파일 변경 금지.
- `.env`, secrets 파일 접근 금지.
- 한 호출에 1건 — 그 이상 절대 금지.
