<!-- Proposal template — write to proposals/<id>.md after Phase 3 ANALYZE -->

# Proposal: <id> — <title>

**Discovered by**: <Phase 1 tool>
**Priority**: <P1 | P2>
**Created**: <ISO>

## What

<2-3 줄 — 무엇을 바꿀지>

## Evidence (자동 분석 출력 인용)

```
<도구 출력 일부, ≤ 20줄>
```

## Impact analysis (EDA)

- **영향 받는 파일**: <list>
- **영향 받는 모듈/사용자**: <list 또는 "none">
- **가역성**: 가역 | 일부 가역 (config) | 비가역
- **다른 후보와 conflict**: <list 또는 "none">

## Plan

- **변경 범위**: <files, 예상 lines>
- **검증**: <build | test | lint | smoke 시나리오>
- **롤백**: <git restore | feature flag | config revert>
- **dry-run 가능?**: yes | no

## Risk

- <known risks 1줄씩>

## Acceptance

- <명확한 통과 기준 — Phase 6 VERIFY 가 이걸로 판정>
