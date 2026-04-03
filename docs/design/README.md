# Airflux Agent System — Design Documents

> 2026/04 최신 에이전틱 패턴 기반. Multi-endpoint, Multi-capability AI Agent Platform.

## 구조

```
airflux-docs/
├── README.md                          ← 이 파일
├── architecture/
│   ├── 00-vision.md                   ← 프로젝트 비전 + 설계 문서 맵
│   ├── 01-system-overview.md          ← 전체 시스템 아키텍처
│   ├── 02-multi-endpoint.md           ← 멀티 엔드포인트 설계
│   ├── 03-agent-core.md               ← 에이전트 코어 (AI SDK 6 + WDK)
│   ├── 04-data-layer.md               ← 데이터소스 및 캐싱
│   ├── 05-agent-management.md         ← 에이전트 관리/운용/품질 전략
│   ├── 06-data-protocol-feedback.md   ← 에이전트 간 데이터 전달 + 피드백 루프
│   ├── 07-prompt-engineering.md       ← 프롬프트 구조, context 관리, 캐싱
│   ├── 08-security-access.md         ← 보안, RBAC, PII 보호, Audit Log
│   ├── 09-mcp-server.md              ← MCP Server (Claude Code 연동)
│   ├── 10-chat-sdk-integration.md    ← Chat SDK 멀티 플랫폼 통합
│   ├── 11-multi-tenancy.md           ← 앱별 컨텍스트 격리 + 다중 앱 비교
│   ├── 12-rate-limiting.md           ← Rate Limiting + 동시성 + 큐잉
│   ├── 13-memory-system.md           ← 3-Tier 메모리 (세션/사용자/조직)
│   ├── 14-platform-philosophy.md     ← 플랫폼 철학, dbt 연동, 플러그인
│   ├── 15-skill-tool-system.md      ← Skill/Tool 등록, 3계층 구조
│   ├── 16-admin-interface.md        ← Admin 웹 대시보드
│   ├── 17-dashboard-data-model.md  ← 대시보드 DB 스키마 + 저장소
│   ├── 18-llm-provider.md         ← LLM Provider 전략 (로컬/인프라)
│   ├── 19-orchestrator-detail.md  ← Orchestrator 실행 모델 + WorkingMemory
│   └── 20-scheduler.md            ← 스케줄러 (Cron + Webhook 트리거)
├── capabilities/
│   ├── 01-text-to-sql.md              ← SQL 생성 + 실행
│   ├── 02-insight-engine.md           ← 자동 인사이트 생성
│   ├── 03-image-generation.md         ← 차트/이미지 생성
│   ├── 04-research-automation.md      ← 연구 자동화
│   ├── 05-task-automation.md          ← 일상 작업 자동화
│   ├── 06-evaluation-observability.md ← 평가 파이프라인 + 모니터링
│   ├── 07-response-ux.md             ← 엔드포인트별 응답 포맷 + 에러 UX
│   ├── 08-semantic-layer-sync.md     ← Semantic Layer 자동 동기화
│   ├── 09-korean-nlu.md              ← 한국어 NLU + 모호성 해결
│   ├── 10-export-notifications.md    ← 데이터 Export + 알림 시스템
│   └── 11-debugging-tracing.md       ← 디버깅, 트레이싱, /status
├── implementation/
│   ├── 01-scaffold-guide.md           ← 스캐폴드 사용법
│   ├── 02-montgomery-patterns.md      ← Montgomery 패턴 매핑
│   ├── 03-roadmap.md                  ← 구현 로드맵
│   ├── 04-developer-onboarding.md     ← 새 에이전트 추가 가이드
│   ├── 05-operations-runbook.md       ← 장애 대응 + 운영 절차
│   └── 06-testing-strategy.md         ← 단위/통합/E2E/평가 테스트
└── reference/
    ├── 01-error-codes.md              ← 에러 코드 레퍼런스
    ├── 02-tech-decisions.md           ← 기술 결정 로그
    ├── 03-config-schemas.md           ← 전체 YAML 설정 스키마
    └── 04-cost-model-guide.md         ← 비용 최적화 + 모델 선택 가이드
```

## 핵심 변경사항 (v2, 2026/04)

1. **Slack-only → Multi-endpoint**: Slack, REST API, Cron, Webhook, MCP Server
2. **AI SDK 6 + AI Gateway**: OIDC 기반, provider-agnostic 모델 라우팅
3. **Multi-Agent + Orchestrator**: Router → SQL/Insight/Image Agent, 조건부 오케스트레이션
4. **DurableAgent (WDK)**: crash-safe 장시간 분석 워크플로우
5. **에이전트 관리**: Code+Config 하이브리드, YAML 프롬프트 버전관리, few-shot 축적
6. **품질 보장**: Golden dataset 평가, LLM-as-judge, drift detection, A/B testing
7. **보안**: 5-layer defense-in-depth, RBAC, PII 3단계 보호, Audit Log
8. **비용 최적화**: Prompt caching(90%), Haiku routing, Redis 캐싱 → ~$94/월 (일 200요청 기준, hard cap $200/일)
9. **이미지**: QuickChart + Gemini 3.1 Flash Image Preview
10. **Chat SDK (Phase 4)**: ResponseChannel 추상화로 전환 비용 최소화

## 수치

| 항목 | 수량 |
|------|------|
| 설계문서 v2 | **34파일, 7,300줄+** |
| 스캐폴드 v1 | 46파일, 4,216줄 |
| Montgomery 패턴 | 31/43 구현 (72%) |
| 설정 파일 스키마 | 15종 YAML + prompts/4 + few-shots/2 |
| 에러 코드 | 15개 |
| 기술 결정 | 8개 (TD-001~008) |

## 읽는 순서 (추천)

1. `architecture/01-system-overview.md` — 전체 그림
2. `architecture/02-multi-endpoint.md` — ResponseChannel 추상화
3. `architecture/03-agent-core.md` — Agent/Router/Orchestrator
4. `architecture/05-agent-management.md` — 관리/운용 전략 (핵심)
5. `architecture/06-data-protocol-feedback.md` — StepResult + 피드백 루프
6. `capabilities/06-evaluation-observability.md` — 품질 보장
7. `implementation/03-roadmap.md` — Phase별 계획
8. `implementation/04-developer-onboarding.md` — 새 에이전트 추가 방법
