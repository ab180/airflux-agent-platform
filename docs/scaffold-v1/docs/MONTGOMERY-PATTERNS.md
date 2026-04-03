# Montgomery → Airflux Pattern Map

Montgomery(abot) 코드베이스에서 추출한 43개 패턴과 Airflux 적용 현황.

## Architecture Patterns (8)
| # | Pattern | Montgomery File | Airflux File | Status |
|---|---------|----------------|-------------|--------|
| 1 | Dual-Lambda (sync+async) | slash-command.ts + async-processor.ts | gateway.ts + worker.ts | ✅ |
| 2 | 4-Lambda Event Routing | sst.config.ts | sst.config.ts | ✅ |
| 3 | Registry (singleton+lazy) | commands/registry.ts | core/agent-registry.ts | ✅ |
| 4 | Package Architecture | commands/find-app/ | agents/sql-agent/ | ✅ |
| 5 | Stage-Aware Config | sst.config.ts | sst.config.ts | ✅ |
| 6 | Auto-Wired References | sst.config.ts | sst.config.ts | ✅ |
| 7 | CloudWatch Alarms | sst.config.ts | sst.config.ts | ✅ |
| 8 | copyFiles for Settings | sst.config.ts | sst.config.ts | ✅ |

## Data Patterns (8)
| # | Pattern | Montgomery File | Airflux | Status |
|---|---------|----------------|---------|--------|
| 9 | Credential Caching (TTL) | utils/secrets.ts | utils/secrets.ts | ✅ |
| 10 | Connection Pooling + Ping | utils/database.ts | datasources/snowflake.ts, mysql.ts | ✅ |
| 11 | Connection Reset on Error | async-processor.ts | worker.ts, datasources/*.ts | ✅ |
| 12 | Query Transparency | sdk/processor.ts | sql-agent/agent.ts | ✅ |
| 13 | Multi-Source Enrichment | find-app/processor.ts | (설계 완료) | ⬜ |
| 14 | Fuzzy Search Fallback | find-app/processor.ts | (설계 완료) | ⬜ |
| 15 | Hierarchical Grouping | sdk/processor.ts | (설계 완료) | ⬜ |
| 16 | Parallel Query Execution | lag/processor.ts | (설계 완료) | ⬜ |

## Slack Patterns (12)
| # | Pattern | Montgomery File | Airflux | Status |
|---|---------|----------------|---------|--------|
| 17 | Retry Skip (x-slack-retry) | event-subscription.ts | gateway.ts | ✅ |
| 18 | Emoji Feedback | event-subscription.ts | worker.ts | ✅ |
| 19 | Graceful Auth Degradation | async-processor.ts | worker.ts | ✅ |
| 20 | Error Classification | event-subscription.ts | worker.ts | ✅ |
| 21 | Thread Context Collection | event-subscription.ts | (설계 완료) | ⬜ |
| 22 | Unified Message Post/Update | utils/slack.ts | utils/slack.ts | ✅ |
| 23 | Bot Self-Reference Cache | event-subscription.ts | utils/slack.ts | ✅ |
| 24 | S3 Presigned URL | utils/s3.ts | utils/s3.ts | ✅ |
| 25 | Mention→Email Resolution | utils/slack.ts | utils/slack.ts | ✅ |
| 26 | URL Prettification | utils/slack.ts | (설계 완료) | ⬜ |
| 27 | Message-in-Thread Search | dj/processor.ts | (설계 완료) | ⬜ |
| 28 | Dynamic Block Kit Builder | dj/processor.ts | (설계 완료) | ⬜ |

## Interactive Patterns (5)
| # | Pattern | Montgomery File | Airflux | Status |
|---|---------|----------------|---------|--------|
| 29 | Modal State via private_metadata | dj/command.ts | (설계 완료) | ⬜ |
| 30 | Multi-Step Modal Flow | dj + interactions/ | (설계 완료) | ⬜ |
| 31 | Thread State (dual-layer) | utils/thread-state.ts | (설계 완료) | ⬜ |
| 32 | User Group Access Control | utils/slack-user-group-access.ts | (설계 완료) | ⬜ |
| 33 | Interaction Registry | interactions/registry.ts | (설계 완료) | ⬜ |

## Code Patterns (7)
| # | Pattern | Montgomery File | Airflux | Status |
|---|---------|----------------|---------|--------|
| 34 | Prefix-Based Routing | github/deployment.ts | gateway.ts (debug/explain) | ✅ |
| 35 | Short Alias System | five-hundred/constants.ts | semantic-layer.yaml | ✅ |
| 36 | CSV/YAML External Config | dj/constants.ts | settings/*.yaml | ✅ |
| 37 | Discriminated Union Response | link-info/api-client.ts | types/agent.ts | ✅ |
| 38 | 3-Layer Separation | link-info/ | agents/sql-agent/ + core/response-formatter.ts | ✅ |
| 39 | Lazy require() / import() | interactions/registry.ts | core/agent-registry.ts | ✅ |
| 40 | Minimal Dependencies | package.json | package.json | ✅ |

## Content Patterns (3)
| # | Pattern | Montgomery File | Airflux | Status |
|---|---------|----------------|---------|--------|
| 41 | Factory Method | dj/types.ts | (설계 완료) | ⬜ |
| 42 | Paginated API with Target | github/release.ts | (설계 완료) | ⬜ |
| 43 | Markdown→Slack Converter | github/release.ts | utils/markdown-to-slack.ts | ✅ |

## Additional Implementations (not in original 43)
| # | Pattern | Airflux File | Notes |
|---|---------|-------------|-------|
| + | Structured Error Codes | types/errors.ts | Montgomery isGitHubAuthError 확장 |
| + | Response Formatter | core/response-formatter.ts | Montgomery link-info/formatter 확장 |
| + | Config Loader (YAML) | utils/config-loader.ts | Montgomery CSV loader 진화 |
| + | Prefix Parser | utils/prefix-parser.ts | Montgomery parseThinkPrefix 통합 |

## Summary (Updated Round 66)
- **Total patterns**: 43
- **Implemented in scaffold**: **30** (✅)
- **Designed, pending impl**: 13 (⬜)
- **Implementation rate**: **70%**
- **Additional modules**: 4 (Montgomery 패턴을 확장한 Airflux 고유 모듈)
