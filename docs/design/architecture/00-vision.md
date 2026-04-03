# Airflux Agent System — Vision

## 이 프로젝트가 하는 것

```
┌─────────────────────────────────────────────────────────────┐
│                   Airflux Agent Platform                      │
│                                                              │
│  ┌────────────────────────────────────────────────────┐      │
│  │  관리 레이어 (Admin)                                │      │
│  │  - 에이전트 등록/수정/삭제                           │      │
│  │  - 스킬/도구 세팅 및 지정                           │      │
│  │  - 모니터링, 비용, 품질 대시보드                     │      │
│  │  - 프롬프트/설정 런타임 변경                         │      │
│  │  - 사용자 권한 관리                                 │      │
│  └────────────────────────────────────────────────────┘      │
│                          ↕                                   │
│  ┌────────────────────────────────────────────────────┐      │
│  │  실행 레이어 (Runtime)                              │      │
│  │  - Router: 의도 분류 → 에이전트 선택                 │      │
│  │  - Orchestrator: 복합 작업 실행                     │      │
│  │  - 스케줄러: 주기적 자동 실행                        │      │
│  │  - 세션/메모리: 대화 컨텍스트 유지                   │      │
│  └────────────────────────────────────────────────────┘      │
│                          ↕                                   │
│  ┌────────────────────────────────────────────────────┐      │
│  │  에이전트 & 스킬 (자유롭게 추가)                     │      │
│  │                                                    │      │
│  │  📊 Data Agent                                     │      │
│  │    skills: [text-to-sql, dbt-query, chart-gen]     │      │
│  │    tools: [snowflake, dbt, quickchart]             │      │
│  │                                                    │      │
│  │  🔍 Research Agent                                 │      │
│  │    skills: [anomaly-detect, trend-analysis, report]│      │
│  │    tools: [snowflake, slack-notify, s3-export]     │      │
│  │    schedule: "매일 09:00 이상치 리포트"              │      │
│  │                                                    │      │
│  │  📋 Task Agent                                     │      │
│  │    skills: [todo-manage, jira-sync, reminder]      │      │
│  │    tools: [jira, notion, slack, calendar]          │      │
│  │                                                    │      │
│  │  🚀 Onboarding Agent                              │      │
│  │    skills: [app-diagnose, sdk-check, benchmark]    │      │
│  │    tools: [snowflake, newrelic, slack-dm]          │      │
│  │    trigger: webhook (앱 생성 이벤트)                │      │
│  │                                                    │      │
│  │  💬 Digest Agent                                   │      │
│  │    skills: [channel-summarize, weekly-digest]      │      │
│  │    tools: [slack-history, llm-summarize]           │      │
│  │    schedule: "매주 월 10:00 위클리 다이제스트"       │      │
│  │                                                    │      │
│  │  ... (누구나 새 에이전트 추가 가능)                  │      │
│  └────────────────────────────────────────────────────┘      │
│                          ↕                                   │
│  ┌────────────────────────────────────────────────────┐      │
│  │  인터페이스 (어디서든 접근)                          │      │
│  │  Slack │ REST API │ Cron │ Webhook │ MCP           │      │
│  └────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

## 두 종류의 사용자

### 관리자 (Admin)
- 에이전트를 **등록/수정/삭제**한다
- 스킬과 도구를 **세팅하고 지정**한다
- 프롬프트를 **튜닝**한다
- 모델을 **선택/변경**한다
- 스케줄을 **설정**한다 (자동 리서치, 정기 리포트)
- 품질을 **모니터링**한다 (평가 점수, drift, 비용)
- 사용자 권한을 **관리**한다

### 일반 사용자 (User)
- 자연어로 **질문**한다 ("이 앱 DAU 알려줘")
- 결과를 **받는다** (테이블, 차트, 인사이트)
- 자동 리포트를 **받는다** (Cron 스케줄)
- 피드백을 **남긴다** (👍/👎)
- 후속 질문을 **한다** ("차트로 보여줘")

## 에이전트가 하는 일들 (예시)

| 에이전트 | 하는 일 | 트리거 | 스킬/도구 |
|---------|--------|--------|----------|
| Data Agent | 데이터 조회, SQL 생성 | 사용자 질문 | text-to-sql, dbt, snowflake |
| Research Agent | 이상 탐지, 추이 분석, 리포트 | Cron(매일), 사용자 | anomaly-detect, trend, s3 |
| Task Agent | 할 일 관리, Jira 연동 | 사용자 명령 | jira, notion, calendar |
| Onboarding Agent | 신규 앱 진단, SDK 확인 | Webhook(앱 생성) | snowflake, newrelic |
| Digest Agent | 채널 요약, 위클리 | Cron(주간) | slack-history, llm-summarize |
| Alert Agent | 임계값 모니터링, 알림 | Cron(매시간) | snowflake, slack-notify |
| Report Agent | 정기 리포트 생성 | Cron(주/월간) | snowflake, s3, chart |

## 핵심 가치

1. **자유로운 에이전트 추가** — 50줄 코드 + 설정 파일로 새 에이전트
2. **도구/스킬 자유 세팅** — 플러그인으로 외부 서비스 연동, 설정으로 활성화
3. **자동 또는 수동** — Cron 스케줄, Webhook 트리거, 또는 사용자 직접 요청
4. **모니터링 + 강화** — 품질 평가, 피드백, A/B 테스트로 지속 개선
5. **관리자 + 사용자 분리** — 관리자는 시스템 제어, 사용자는 자연어로 사용

## 설계 문서 맵 (이 비전 기준)

```
이 비전을 실현하는 설계:

관리 레이어:
  05-agent-management.md    → 에이전트 등록/설정/모니터링
  14-platform-philosophy.md → 플러그인, 카탈로그, dbt 연동
  08-security-access.md     → RBAC, 관리자/사용자 권한
  03-config-schemas.md      → 모든 설정 파일 스키마

실행 레이어:
  03-agent-core.md          → Router, Orchestrator, AI SDK 6
  06-data-protocol-feedback.md → 에이전트 간 데이터 전달
  07-prompt-engineering.md  → 프롬프트 관리, context window
  12-rate-limiting.md       → 동시성, 큐잉
  13-memory-system.md       → 세션, 사용자 기억

에이전트 & 스킬:
  01-text-to-sql.md         → Data Agent의 스킬
  02-insight-engine.md      → Research Agent의 스킬
  03-image-generation.md    → 차트/시각화 스킬
  04-research-automation.md → 자동 리서치 워크플로우
  05-task-automation.md     → Task Agent 기능

품질 & 운영:
  06-evaluation-observability.md → 평가, drift, A/B
  11-debugging-tracing.md   → 디버깅, 트레이싱
  05-operations-runbook.md  → 장애 대응, 운영
  04-cost-model-guide.md    → 비용 관리

인터페이스:
  02-multi-endpoint.md      → Slack, API, Cron, Webhook, MCP
  07-response-ux.md         → 응답 포맷
  09-mcp-server.md          → Claude Code 연동
  10-chat-sdk-integration.md → 멀티 플랫폼
```
