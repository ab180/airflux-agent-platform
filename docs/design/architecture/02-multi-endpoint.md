# Multi-Endpoint Architecture

> Slack-only를 넘어 REST API, Cron, Webhook까지 지원하는 엔드포인트 설계

## 왜 Multi-Endpoint인가?

Montgomery는 Slack 전용이다. Airflux Agent는 다양한 소비자가 있다:

| 소비자 | 엔드포인트 | 사용 예시 |
|--------|-----------|----------|
| CS 팀 (Slack) | Slack slash/mention | "이 앱 지난 주 이벤트 수 알려줘" |
| PM (Web Dashboard) | REST API | 대시보드에서 자연어 쿼리 실행 |
| 자동화 시스템 | Cron | 매일 아침 이상치 리포트 생성 |
| 외부 서비스 | Webhook | 알림 트리거 시 자동 분석 |
| 내부 도구 | MCP Server | Claude Code에서 Airflux 데이터 접근 |

## Lambda 구조

Montgomery 4-Lambda 패턴을 확장:

```
SST v3 Functions:
├── SlackGateway       (src/endpoints/slack.ts)
│   - slash commands, events, interactions
│   - Chat SDK adapter (멀티플랫폼 확장 가능)
│   - timeout: 3s (Slack 제한)
│
├── ApiGateway         (src/endpoints/api.ts)
│   - REST API (인증된 요청)
│   - POST /api/query   → 자연어 쿼리
│   - POST /api/report  → 리포트 생성
│   - GET  /api/status   → 작업 상태 조회
│   - timeout: 30s
│
├── CronRunner         (src/endpoints/cron.ts)
│   - 스케줄 기반 자동 실행
│   - 일일 이상치 리포트
│   - 주간 요약 리포트
│   - timeout: 300s
│
├── WebhookReceiver    (src/endpoints/webhook.ts)
│   - 외부 이벤트 수신
│   - 알림 조건 트리거 시 분석 실행
│   - timeout: 30s
│
└── Worker             (src/worker.ts)
    - 모든 엔드포인트의 비동기 작업 처리
    - DurableAgent 실행
    - timeout: 900s (15분)
```

## Endpoint → AgentContext 변환

각 엔드포인트는 자신의 입력을 표준 AgentContext로 변환:

```typescript
// src/endpoints/slack.ts
function slackToContext(event: SlackEvent): AgentContext {
  return {
    question: event.text,
    userId: event.user_id,
    sessionId: event.thread_ts || event.channel + '-' + Date.now(),
    source: 'slack',
    responseChannel: new SlackResponseChannel({
      channelId: event.channel,
      threadTs: event.thread_ts,
      responseUrl: event.response_url,
    }),
    metadata: { channelName: event.channel_name },
  };
}

// src/endpoints/api.ts
function apiToContext(req: ApiRequest): AgentContext {
  return {
    question: req.body.query,
    userId: req.auth.userId,
    sessionId: req.body.sessionId || crypto.randomUUID(),
    source: 'api',
    responseChannel: new HttpResponseChannel(req.responseStream),
    metadata: { apiVersion: req.headers['x-api-version'] },
  };
}

// src/endpoints/cron.ts
function cronToContext(schedule: CronSchedule): AgentContext {
  return {
    question: schedule.query,  // e.g. "지난 24시간 이상치 분석"
    userId: 'system',
    sessionId: `cron-${schedule.name}-${Date.now()}`,
    source: 'cron',
    responseChannel: new MultiResponseChannel([
      new SlackResponseChannel({ channelId: schedule.slackChannel }),
      new S3ReportChannel({ bucket: 'airflux-reports' }),
    ]),
    metadata: { scheduleName: schedule.name },
  };
}
```

## ResponseChannel 패턴 (핵심 추상화)

에이전트는 결과를 ResponseChannel에 보낸다. 채널이 알아서 적절한 포맷으로 전달.

```typescript
interface ResponseChannel {
  // 스트리밍 진행 상태
  sendProgress(status: string): Promise<void>;

  // 최종 결과 전달
  sendResult(result: AgentResult): Promise<void>;

  // 에러 전달
  sendError(error: AirfluxError): Promise<void>;
}

class SlackResponseChannel implements ResponseChannel {
  async sendProgress(status: string) {
    // Slack 이모지 + 스레드 메시지
    await this.slack.reactions.add({ name: 'thought_balloon', ... });
  }

  async sendResult(result: AgentResult) {
    // Block Kit 포맷으로 변환
    const blocks = ResponseFormatter.toSlackBlocks(result);
    if (blocks.length > SLACK_LIMIT) {
      // S3에 업로드하고 링크 전달
      const url = await uploadToS3(result);
      await this.slack.chat.postMessage({ text: `결과: ${url}`, ... });
    } else {
      await this.slack.chat.postMessage({ blocks, ... });
    }
  }
}

class HttpResponseChannel implements ResponseChannel {
  async sendProgress(status: string) {
    // SSE 스트리밍
    this.stream.write(`data: {"type":"progress","status":"${status}"}\n\n`);
  }

  async sendResult(result: AgentResult) {
    // JSON 응답 (스트리밍 또는 일괄)
    this.stream.write(`data: ${JSON.stringify(result)}\n\n`);
  }
}

class S3ReportChannel implements ResponseChannel {
  async sendResult(result: AgentResult) {
    // HTML/PDF 리포트 생성 후 S3 업로드
    const html = ReportGenerator.toHtml(result);
    await s3.putObject({ Body: html, Key: `reports/${Date.now()}.html` });
  }
}

// 여러 채널에 동시 전달 (Cron → Slack + S3)
class MultiResponseChannel implements ResponseChannel {
  constructor(private channels: ResponseChannel[]) {}

  async sendResult(result: AgentResult) {
    await Promise.all(this.channels.map(ch => ch.sendResult(result)));
  }
}
```

## 인증 전략

| 엔드포인트 | 인증 방식 |
|-----------|----------|
| Slack | Slack 서명 검증 (x-slack-signature) |
| REST API | Bearer Token (내부 서비스 키) + 사용자 인증 |
| Cron | CRON_SECRET 헤더 검증 |
| Webhook | HMAC 서명 또는 API 키 |
| MCP | OAuth 2.1 (Vercel OIDC) |

## SST Config 예시

```typescript
// sst.config.ts
const worker = new sst.aws.Function("Worker", {
  handler: "src/worker.handler",
  timeout: "900 seconds",
  vpc: { ... },
  environment: { ... },
});

const slackGateway = new sst.aws.Function("SlackGateway", {
  handler: "src/endpoints/slack.handler",
  url: { cors: true },
  timeout: "10 seconds",
  environment: {
    WORKER_FUNCTION_NAME: worker.name,
    ...commonEnv,
  },
});

const apiGateway = new sst.aws.Function("ApiGateway", {
  handler: "src/endpoints/api.handler",
  url: { cors: true },
  timeout: "30 seconds",
  environment: {
    WORKER_FUNCTION_NAME: worker.name,
    ...commonEnv,
  },
});

const cronRunner = new sst.aws.Function("CronRunner", {
  handler: "src/endpoints/cron.handler",
  timeout: "300 seconds",
  environment: {
    WORKER_FUNCTION_NAME: worker.name,
    ...commonEnv,
  },
});

// Cron 스케줄 설정
new sst.aws.Cron("DailyAnomalyReport", {
  schedule: "rate(1 day)",
  function: cronRunner,
});
```
