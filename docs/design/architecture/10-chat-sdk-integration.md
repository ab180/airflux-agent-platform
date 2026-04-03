# Chat SDK Integration

> Slack 전용 → 멀티 플랫폼 확장을 위한 Chat SDK 통합 설계

## 1. 왜 Chat SDK인가

현재: `@slack/web-api` 직접 사용 (Montgomery 패턴).
문제: Teams, Discord 확장 시 각 플랫폼별 코드 작성 필요.

Chat SDK는 **하나의 코드베이스로 여러 플랫폼**을 지원:
- 메시지 → `thread.post(text)` (모든 플랫폼 동일)
- 리치 UI → `Card` JSX (플랫폼별 자동 변환)
- AI 응답 → `thread.post(textStream)` (스트리밍 지원)

## 2. 도입 시점: Phase 4

Phase 1-3: `@slack/web-api` 직접 사용 (빠른 개발, 복잡도 낮음).
Phase 4: Chat SDK로 전환 + Teams/Discord 추가.

### 전환이 쉬운 이유

ResponseChannel 추상화 덕분에 에이전트 코드 변경 없음:

```
현재: Agent → SlackResponseChannel → @slack/web-api
전환: Agent → ChatSdkResponseChannel → Chat SDK → Slack/Teams/Discord
```

## 3. Chat SDK 구조

```typescript
import { Chat } from 'chat';
import { createSlackAdapter } from '@chat-adapter/slack';
import { createTeamsAdapter } from '@chat-adapter/teams';
import { createRedisState } from '@chat-adapter/state-redis';

const chat = new Chat({
  adapters: {
    slack: createSlackAdapter({
      botToken: process.env.SLACK_BOT_TOKEN,
      signingSecret: process.env.SLACK_SIGNING_SECRET,
    }),
    teams: createTeamsAdapter({
      appId: process.env.TEAMS_APP_ID,
      appPassword: process.env.TEAMS_APP_PASSWORD,
    }),
  },
  state: createRedisState({ url: process.env.REDIS_URL }),
});
```

## 4. 이벤트 핸들러

```typescript
// 모든 플랫폼에서 동일한 핸들러
chat.onNewMention(async ({ thread, message }) => {
  const question = message.text;
  const userId = message.author.id;

  // 1. 진행 표시
  await thread.startTyping();

  // 2. AgentContext 구성
  const context: AgentContext = {
    question,
    userId,
    sessionId: thread.id,
    source: thread.platform,  // 'slack' | 'teams' | 'discord'
    responseChannel: new ChatSdkResponseChannel(thread),
    metadata: {},
  };

  // 3. 에이전트 실행 (기존 로직 동일)
  await executeAgent(context);
});

// Slack slash command
chat.onSlashCommand('/airflux', async ({ thread, args }) => {
  const context: AgentContext = {
    question: args,
    userId: thread.author.id,
    sessionId: thread.id,
    source: 'slack',
    responseChannel: new ChatSdkResponseChannel(thread),
    metadata: {},
  };
  await executeAgent(context);
});
```

## 5. ChatSdkResponseChannel

```typescript
class ChatSdkResponseChannel implements ResponseChannel {
  constructor(private thread: Thread) {}

  async sendProgress(status: string): Promise<void> {
    await this.thread.startTyping();
    // Slack: native typing indicator
    // Teams: typing activity
    // Discord: typing indicator
  }

  async sendResult(result: AgentResult): Promise<void> {
    // 텍스트 응답
    await this.thread.post(result.summary);

    // 리치 카드 (플랫폼별 자동 변환)
    if (result.dataTable || result.chart) {
      await this.thread.post(
        <Card>
          {result.dataTable && (
            <Section>
              <Text>{formatMarkdownTable(result.dataTable)}</Text>
            </Section>
          )}
          {result.chart && (
            <Image src={result.chart.data} alt={result.chart.title} />
          )}
          <Actions>
            <Button actionId="feedback_positive" value={result.metadata.traceId}>👍</Button>
            <Button actionId="feedback_negative" value={result.metadata.traceId}>👎</Button>
          </Actions>
        </Card>
      );
    }
  }

  async sendError(error: AirfluxError): Promise<void> {
    await this.thread.post(`❌ ${error.userMessage}`);
  }
}
```

## 6. 마이그레이션 계획

```
Phase 4 Week 1:
  - Chat SDK 설치 + Slack adapter 설정
  - ChatSdkResponseChannel 구현
  - 기존 SlackResponseChannel 테스트를 ChatSdk 버전으로 전환
  - 기존 기능 100% 동일하게 동작 확인

Phase 4 Week 2:
  - webhook routes 추가 (Slack + Teams)
  - Teams adapter 설정 + 테스트
  - Card JSX로 Block Kit 대체 (점진적)

Phase 4 Week 3+:
  - Discord adapter (필요 시)
  - 피드백 버튼 Cross-platform 동작 확인
```

## 7. 설계 결정 이유

| 결정 | 이유 |
|------|------|
| Phase 4에 도입 | 초기에는 Slack만으로 충분 — 불필요한 복잡도 회피 |
| ResponseChannel 덕분에 전환 쉬움 | 에이전트 코드 변경 0, 채널 구현체만 교체 |
| Card JSX | 플랫폼별 Block Kit/Adaptive Card 직접 작성 불필요 |
| Redis state | Lambda 환경에서 세션 지속성 필수 |
| thread.post(textStream) | AI 응답 스트리밍을 Chat SDK가 플랫폼별로 최적화 |
