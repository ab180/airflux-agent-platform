# System Overview

> Airflux Agent System — Multi-endpoint AI Agent Platform for AB180 Airflux

## 아키텍처 다이어그램

```
                          ┌─────────────────────────────────────────────┐
                          │            Airflux Agent Platform            │
                          ├─────────────────────────────────────────────┤
                          │                                             │
  ┌─────────┐             │  ┌──────────────────────────────────┐       │
  │  Slack   │─────────── │──│  Endpoint Router (gateway.ts)    │       │
  └─────────┘   webhook   │  │  - Slack slash/event/interactive │       │
  ┌─────────┐             │  │  - REST API (Web UI)             │       │
  │ Web UI  │─────────── │──│  - Cron scheduler                │       │
  └─────────┘   REST API  │  │  - Webhook receiver              │       │
  ┌─────────┐             │  └──────────┬───────────────────────┘       │
  │  Cron   │─────────── │─────────────│                               │
  └─────────┘   schedule  │             ▼                               │
  ┌─────────┐             │  ┌──────────────────────────────────┐       │
  │ Webhook │─────────── │──│  Agent Orchestrator (worker.ts)   │       │
  └─────────┘   event     │  │                                  │       │
                          │  │  ┌────────┐ ┌────────┐ ┌──────┐ │       │
                          │  │  │ SQL    │ │Insight │ │Image │ │       │
                          │  │  │ Agent  │ │ Agent  │ │Agent │ │       │
                          │  │  └───┬────┘ └───┬────┘ └──┬───┘ │       │
                          │  │      │          │         │      │       │
                          │  │  ┌───▼──────────▼─────────▼───┐ │       │
                          │  │  │    AI Gateway (OIDC)        │ │       │
                          │  │  │    Claude / GPT / Gemini    │ │       │
                          │  │  └─────────────────────────────┘ │       │
                          │  └──────────────────────────────────┘       │
                          │                                             │
                          │  ┌──────────────────────────────────┐       │
                          │  │  Data Layer                      │       │
                          │  │  ┌──────────┐ ┌───────┐ ┌─────┐ │       │
                          │  │  │Snowflake │ │ MySQL │ │Druid│ │       │
                          │  │  └──────────┘ └───────┘ └─────┘ │       │
                          │  └──────────────────────────────────┘       │
                          │                                             │
                          │  ┌──────────────────────────────────┐       │
                          │  │  Response Layer                  │       │
                          │  │  - Slack Block Kit               │       │
                          │  │  - JSON API Response             │       │
                          │  │  - S3 Presigned (큰 결과)         │       │
                          │  │  - Image (차트/다이어그램)         │       │
                          │  └──────────────────────────────────┘       │
                          └─────────────────────────────────────────────┘
```

## 핵심 설계 원칙

### 1. Endpoint-Agnostic Agent Core
에이전트는 입력이 어디서 왔는지 모른다. Slack이든 REST API든 Cron이든 동일한 `AgentContext`를 받아 동일하게 동작.

```typescript
// 모든 엔드포인트가 동일한 AgentContext를 생성
interface AgentContext {
  question: string;
  userId: string;
  sessionId: string;
  source: 'slack' | 'api' | 'cron' | 'webhook';
  responseChannel: ResponseChannel;  // 결과를 어디로 보낼지
  metadata: Record<string, any>;
}

// ResponseChannel — 소스별 응답 전략
interface ResponseChannel {
  type: 'slack-thread' | 'http-response' | 'slack-dm' | 'webhook-callback' | 's3-report';
  send(result: AgentResult): Promise<void>;
}
```

### 2. Agent as Durable Workflow (2026 패턴)
단순 Lambda 호출이 아닌, Workflow DevKit 기반 DurableAgent로 crash-safe 실행.

```typescript
// 기존 Montgomery: Lambda invoke → async processor
// Airflux v2: WDK DurableAgent → step-based execution
import { DurableAgent } from '@workflow/ai/agent';

const sqlAgent = new DurableAgent({
  model: 'anthropic/claude-sonnet-4.6',  // AI Gateway 라우팅
  tools: { querySnowflake, getSchema, generateChart },
  instructions: '...',
  stopWhen: stepCountIs(10),
});
```

### 3. AI Gateway 중심 (OIDC, Provider-Agnostic)
모든 LLM 호출은 AI Gateway를 통해. API 키 관리 불필요, 자동 failover.

```typescript
// ❌ 기존: 직접 provider SDK
import Anthropic from '@anthropic-ai/sdk';

// ✅ 2026: AI Gateway 문자열만으로 라우팅
const result = await streamText({
  model: 'anthropic/claude-sonnet-4.6',  // 자동으로 AI Gateway 경유
  prompt: question,
});
```

### 4. Multi-Agent Collaboration
복잡한 질문은 여러 에이전트가 협업. Router Agent가 분배.

```
사용자: "지난 주 이벤트 추이를 분석하고 이상치가 있으면 알려줘"
  ↓
Router Agent → SQL Agent (데이터 조회)
             → Insight Agent (추이 분석 + 이상 탐지)
             → Image Agent (차트 생성)
             → 결과 조합 → 응답
```

## 기술 스택 (2026/04)

| 레이어 | 기술 | 이유 |
|--------|------|------|
| Runtime | SST v3 + AWS Lambda | Montgomery 검증됨, VPC 접근 |
| LLM | AI Gateway (OIDC) | Provider-agnostic, failover, 비용 추적 |
| Agent Framework | AI SDK 6 Agent class | Tool calling, streaming, MCP 지원 |
| Durable Execution | Workflow DevKit | Crash-safe, pause/resume |
| Chat Interface | Chat SDK + @chat-adapter/slack | 멀티 플랫폼 확장 가능 |
| Data Warehouse | Snowflake | Airflux 프로덕트 데이터 |
| Metadata DB | MySQL (RDS) | 앱/계정 메타데이터 |
| Cache | Upstash Redis | 세션, 쿼리 결과 캐싱 |
| File Storage | S3 + Presigned URL | 큰 결과, 이미지, CSV |
| Image Generation | Gemini 3.1 Flash Image Preview | 차트, 다이어그램 |
| Monitoring | CloudWatch + Structured Logging | Montgomery 패턴 |

## Montgomery에서 가져온 검증된 패턴

| 패턴 | Montgomery 출처 | Airflux 적용 |
|------|----------------|-------------|
| 4-Lambda 분리 | sst.config.ts | Endpoint별 Lambda 분리 |
| Registry Pattern | commands/registry.ts | AgentRegistry + EndpointRegistry |
| Async/Sync 다형성 | BaseCommand.isAsync | DurableAgent vs 즉시 응답 |
| Credential Caching | utils/secrets.ts | AI Gateway OIDC + DB secrets |
| Thread State | utils/thread-state.ts | Session State (Redis 확장) |
| Emoji Feedback | event-subscription.ts | 진행 상태 UX |
| Error Classification | base.ts sendErrorReply | AirfluxError 구조화 에러 |

## 새로 추가되는 2026 패턴

| 패턴 | 출처 | 설명 |
|------|------|------|
| AI Gateway OIDC | Vercel AI Gateway | API 키 없는 LLM 접근 |
| DurableAgent | Workflow DevKit | Crash-safe 에이전트 실행 |
| Tool Calling (MCP-aligned) | AI SDK 6 | inputSchema/outputSchema 표준 |
| Multi-Agent Subagent | AI SDK 6 Agent.subagent | 에이전트 간 위임 |
| Image via Multimodal LLM | Gemini 3.1 Flash | generateText → result.files |
| Chat SDK Adapters | Vercel Chat SDK | 멀티 플랫폼 봇 |
| ResponseChannel Pattern | 자체 설계 | 엔드포인트 무관 응답 |
