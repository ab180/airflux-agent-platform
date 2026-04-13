# Airflux Agent Platform — 프로젝트 현황

> 최종 업데이트: 2026-04-11 (AI 모니터링 시각화 R24 최종)

## Phase 0 ✅ + Phase 1 ✅ (인프라 연결 제외)

### 핵심 수치

| 항목 | 수치 |
|------|------|
| TypeScript 파일 | **106** |
| 테스트 | **217** (core 92 + server 125) |
| 테스트 파일 | **16** |
| 대시보드 라우트 | **15** |
| API 엔드포인트 | **47+** (admin 40 + query + feedback + health + slack 2) |
| SQLite 테이블 | **8** (+ execution_state) |
| 에이전트 | **4** (2 active + 2 disabled) |
| 도구 | **13** |
| 가드레일 | **5** (prompt injection 19패턴) |
| YAML 설정 | **6** |
| 총 개선 사이클 | **38+** |

### 아키텍처

```
[입력] → Rate Limit → Budget Check → Guardrails(19 패턴) → Router → Agent(13 tools) → PII Masker → [출력]
   ↕                                                                    ↕
[Slack webhook]                                               Cost Tracker (per-token)
                                    ↕
    Execution State Machine (pending → running → completed/failed)
                                    ↕
    Session + Log + Feedback + Prompts + Eval + DailyStats + Skills
                                    ↕
                SQLite (8 tables, WAL mode, 64MB cache)

[Dashboard :3001] — 14 routes, 한국어 UI, dark mode, 접근성, LLM 설정 UI
[Server :3000] — 42+ endpoints, 8 middleware, 구조화 로깅
```

### GSD-2 하네스 패턴 적용 (7/10)

| 패턴 | 적용 파일 | 상태 |
|------|----------|------|
| 비용 추적 (per-token ledger) | `cost-tracker.ts` | ✅ |
| 검증 자동화 (verification gate) | `verification.ts` | ✅ |
| 예산 한도 (budget enforcement) | `cost-tracker.ts` + `query.ts` | ✅ |
| 컨텍스트 인젝션 (compressed context) | `assistant-agent.ts` | ✅ |
| Slack 연동 (remote questions) | `slack.ts` + `channels/slack.ts` | ✅ |
| 스킬 디스커버리 (telemetry) | `skill-tracker.ts` | ✅ |
| 상태머신 (execution lifecycle) | `execution-state.ts` | ✅ |
| 병렬 실행 | — | ⬜ (인프라) |
| Git 워크트리 | — | ⬜ (코딩 에이전트) |
| 크래시 복구 | — | ⬜ (상태머신 확장) |

### 개선 히스토리

- **보안**: SQL injection, CSP/HSTS, timing-safe auth, prompt injection 19패턴, SSRF 강화, 입력 검증
- **사용성**: 한국어화, aria-label 접근성, skip-to-main, 에러 피드백, LLM 설정 UI
- **최적화**: DB 캐시/인덱스, 쿼리 최적화, 구조화 로깅, 비용 추적
- **기능**: YAML 영속화, DELETE API, 피드백 상세, 로그 필터, Slack webhook, 예산 한도
- **코드 품질**: client-api.ts, raw fetch 제거, 문서 동기화
- **테스트**: 59 → 217 (+268%)
- **AI 모니터링**: AI 사용량 전용 페이지, 비용/토큰 시각화 7개, 에이전트별 만족도, 점수 추이 차트, Advisor 뱃지/설정 표시

### 남은 Phase 2 항목 (인프라 필요)

- SST/Lambda 배포 (또는 Docker)
- AWS Bedrock 프로바이더 구현
- Snowflake 연결 (Data Agent 활성화)
- Slack App 연결 (webhook 엔드포인트 준비됨)
- Redis 세션 (분산 환경)
