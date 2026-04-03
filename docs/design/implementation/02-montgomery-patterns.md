# Montgomery Pattern Map (Summary)

> 기존 43패턴 중 31개 구현 (72%). 상세: scaffold/docs/MONTGOMERY-PATTERNS.md

## 구현 완료 (31/43)

**Architecture (8/8)**: Dual-Lambda, 4-Lambda Routing, Registry, Package, Stage Config, Auto-Wire, CloudWatch, copyFiles

**Data (4/8)**: Credential Caching, Connection Pool+Ping, Reset on Error, Query Transparency

**Slack (8/12)**: Retry Skip, Emoji Feedback, Graceful Degradation, Error Classification, Unified Post/Update, Bot Self-Ref, S3 Presigned, Mention→Email

**Code (7/7)**: Prefix Routing, Alias, YAML Config, Discriminated Union, 3-Layer, Lazy Import, Minimal Deps

**Content (1/3)**: Markdown→Slack

**Airflux 고유 (+4)**: Structured Errors, Response Formatter, Config Loader, Prefix Parser

## 미구현 (12/43) — Phase별 배정

| Phase | 패턴 | 이유 |
|-------|------|------|
| Phase 2 | Thread Context Collection (#21) | 대화형 분석에 필수 |
| Phase 2 | Dynamic Block Kit Builder (#28) | 리치 UI 응답 |
| Phase 4 | Modal State (#29), Multi-Step Modal (#30) | 고급 인터랙션 |
| Phase 4 | Interaction Registry (#33) | Chat SDK 도입 시 |
| Phase 4 | User Group Access (#32) | RBAC 구현 시 |
| Phase 3 | Thread State dual-layer (#31) | Redis 전환 시 |
| 미정 | Multi-Source Enrichment (#13) | 복합 데이터소스 조인 |
| 미정 | Fuzzy Search (#14), Hierarchical Grouping (#15) | UX 개선 |
| 미정 | Parallel Query (#16) | 성능 최적화 |
| 미정 | URL Prettification (#26) | Slack UX |
| 미정 | Message-in-Thread Search (#27) | 대화 검색 |
| 미정 | Factory Method (#41), Paginated API (#42) | 필요 시 |
