# Agent Core — AI SDK 6 + Multi-Agent

> 2026/04 최신 에이전틱 패턴: AI SDK 6 Agent class, DurableAgent, Subagent

## Agent 아키텍처

```
                 ┌─────────────────────────┐
                 │     Router Agent         │
                 │  (의도 분류 + 에이전트 선택) │
                 └────────┬────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
   ┌──────────┐   ┌───────────┐   ┌──────────┐
   │SQL Agent │   │ Insight   │   │ Image    │
   │          │   │ Agent     │   │ Agent    │
   │ Text→SQL │   │ 이상탐지   │   │ 차트생성  │
   │ 실행     │   │ 추이분석   │   │ 다이어그램│
   │ 포맷팅   │   │ 요약      │   │          │
   └──────────┘   └───────────┘   └──────────┘
        │               │               │
        └───────────────┼───────────────┘
                        ▼
               ┌────────────────┐
               │ Result Merger  │
               │ (결과 조합)     │
               └────────────────┘
```

## Router Agent — 의도 분류

모든 요청은 Router Agent가 먼저 처리:

```typescript
import { Agent, stepCountIs } from 'ai';

const routerAgent = new Agent({
  model: 'anthropic/claude-haiku-4.5',  // 빠르고 저렴한 모델
  instructions: `
    사용자 질문을 분석하여 적절한 에이전트를 선택하세요.
    - sql: 데이터 조회/집계 질문 → SQL Agent
    - insight: 분석/인사이트/이상탐지 → Insight Agent (SQL Agent 선 실행)
    - image: 차트/시각화 요청 → Image Agent (SQL Agent 선 실행)
    - multi: 복합 요청 → 여러 에이전트 순차 실행
    - help: 도움말/기능 안내
  `,
  tools: {
    routeToAgent: {
      description: '적절한 에이전트로 라우팅',
      inputSchema: z.object({
        agents: z.array(z.enum(['sql', 'insight', 'image'])),
        reasoning: z.string(),
      }),
    },
  },
  stopWhen: stepCountIs(1),
});
```

## SQL Agent — Text-to-SQL

```typescript
const sqlAgent = new Agent({
  model: 'anthropic/claude-sonnet-4.6',
  instructions: `
    Airflux 데이터를 조회하는 SQL을 생성합니다.
    - Semantic Layer를 참조하여 테이블/컬럼 매핑
    - READ-ONLY SQL만 생성 (SELECT, WITH)
    - 비용 예측 후 임계값 초과 시 경고
  `,
  tools: {
    getSemanticLayer: {
      description: 'Airflux 시맨틱 레이어 조회 (테이블, 컬럼, 관계)',
      inputSchema: z.object({ domain: z.string().optional() }),
      execute: async ({ domain }) => loadSemanticLayer(domain),
    },
    executeQuery: {
      description: 'Snowflake SQL 실행 (READ-ONLY)',
      inputSchema: z.object({
        sql: z.string(),
        explain: z.boolean().optional(),
      }),
      execute: async ({ sql, explain }) => {
        // Guardrail: READ-ONLY 검증
        if (!isReadOnly(sql)) throw new AirfluxError('GUARD-RO-001');
        // Guardrail: 비용 예측
        const cost = await estimateQueryCost(sql);
        if (cost > COST_THRESHOLD) throw new AirfluxError('GUARD-COST-001', { cost });
        return snowflake.execute(sql);
      },
    },
    formatResult: {
      description: '쿼리 결과를 사용자 친화적으로 포맷',
      inputSchema: z.object({
        data: z.any(),
        format: z.enum(['table', 'summary', 'csv']),
      }),
    },
  },
  stopWhen: stepCountIs(5),
});
```

## Insight Agent — 자동 인사이트

```typescript
const insightAgent = new Agent({
  model: 'anthropic/claude-sonnet-4.6',
  instructions: `
    데이터를 분석하여 인사이트를 도출합니다:
    - 추이 분석: 증가/감소 패턴, 변곡점
    - 이상 탐지: 통계적 이상치 (Z-score > 2)
    - 비교 분석: 기간 대비, 앱 간 비교
    - 상관 분석: 지표 간 관계
    결과는 한국어로, 핵심만 간결하게.
  `,
  tools: {
    runSqlAgent: {
      description: 'SQL Agent에 데이터 조회 위임',
      inputSchema: z.object({ question: z.string() }),
      execute: async ({ question }) => {
        // Subagent 패턴
        const result = await sqlAgent.generate({
          messages: [{ role: 'user', content: question }],
        });
        return result.text;
      },
    },
    detectAnomalies: {
      description: '시계열 데이터에서 이상치 탐지',
      inputSchema: z.object({
        data: z.array(z.object({ date: z.string(), value: z.number() })),
        sensitivity: z.enum(['low', 'medium', 'high']).default('medium'),
      }),
      execute: async ({ data, sensitivity }) => {
        return statisticalAnomalyDetection(data, sensitivity);
      },
    },
  },
  stopWhen: stepCountIs(8),
});
```

## Image Agent — 차트/다이어그램 생성

```typescript
import { generateText } from 'ai';

const imageAgent = new Agent({
  model: 'anthropic/claude-sonnet-4.6',
  instructions: `
    데이터를 시각화합니다.
    - 차트: QuickChart API로 URL 생성 (빠른 경로)
    - 복잡한 시각화: Gemini 3.1 Flash로 이미지 직접 생성
    - 다이어그램: Mermaid 문법 생성
  `,
  tools: {
    generateChart: {
      description: 'QuickChart API로 차트 URL 생성',
      inputSchema: z.object({
        type: z.enum(['bar', 'line', 'pie', 'doughnut', 'radar']),
        labels: z.array(z.string()),
        datasets: z.array(z.object({
          label: z.string(),
          data: z.array(z.number()),
        })),
        title: z.string().optional(),
      }),
      execute: async (config) => {
        const chartConfig = { type: config.type, data: { labels: config.labels, datasets: config.datasets } };
        return `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}`;
      },
    },
    generateImage: {
      description: 'Gemini 멀티모달 LLM으로 이미지 생성',
      inputSchema: z.object({
        prompt: z.string(),
        context: z.string().optional(),
      }),
      execute: async ({ prompt }) => {
        const result = await generateText({
          model: 'google/gemini-3.1-flash-image-preview',
          prompt: `다음 데이터를 시각화하는 차트 이미지를 생성하세요: ${prompt}`,
        });
        // result.files에서 이미지 추출
        const image = result.files?.[0];
        if (image) {
          const url = await uploadToS3(image.data, 'charts/' + Date.now() + '.png');
          return { imageUrl: url };
        }
      },
    },
    generateMermaid: {
      description: 'Mermaid 다이어그램 문법 생성',
      inputSchema: z.object({
        type: z.enum(['flowchart', 'sequence', 'gantt', 'pie']),
        description: z.string(),
      }),
    },
  },
  stopWhen: stepCountIs(3),
});
```

## Agent Registry — 동적 등록

```typescript
// Montgomery CommandRegistry 패턴 확장
class AgentRegistry {
  private static agents = new Map<string, Agent>();

  static register(name: string, agent: Agent) {
    this.agents.set(name, agent);
  }

  static get(name: string): Agent | undefined {
    return this.agents.get(name);
  }

  static list(): string[] {
    return Array.from(this.agents.keys());
  }
}

// 초기화
AgentRegistry.register('router', routerAgent);
AgentRegistry.register('sql', sqlAgent);
AgentRegistry.register('insight', insightAgent);
AgentRegistry.register('image', imageAgent);
```

## Agent 실행 흐름

```typescript
// worker.ts — 모든 엔드포인트의 비동기 작업 처리
export async function executeAgent(context: AgentContext): Promise<void> {
  const { question, responseChannel } = context;

  try {
    // 1. 진행 상태 알림
    await responseChannel.sendProgress('분석 중...');

    // 2. Router Agent로 의도 분류
    const routing = await routerAgent.generate({
      messages: [{ role: 'user', content: question }],
    });

    // 3. 라우팅 결과에 따라 에이전트 실행
    const agentNames = parseRouting(routing);
    const results: AgentResult[] = [];

    for (const name of agentNames) {
      const agent = AgentRegistry.get(name);
      await responseChannel.sendProgress(`${name} 에이전트 실행 중...`);

      const result = await agent.generate({
        messages: [{ role: 'user', content: question }],
      });
      results.push({ agent: name, output: result.text, metadata: result.usage });
    }

    // 4. 결과 조합 + 전달
    const merged = mergeResults(results);
    await responseChannel.sendResult(merged);

  } catch (error) {
    if (error instanceof AirfluxError) {
      await responseChannel.sendError(error);
    } else {
      await responseChannel.sendError(
        new AirfluxError('LLM-API-001', { original: String(error) })
      );
    }
  }
}
```

## DurableAgent (장시간 분석)

큰 분석 작업은 DurableAgent로 crash-safe 실행:

```typescript
import { DurableAgent } from '@workflow/ai/agent';

// Cron 기반 일일 리포트 등 장시간 작업에 사용
const durableInsightAgent = new DurableAgent({
  model: 'anthropic/claude-sonnet-4.6',
  tools: { runSqlAgent, detectAnomalies, generateChart, sendSlackNotification },
  instructions: '일일 이상치 분석 리포트를 생성합니다...',
  stopWhen: stepCountIs(20),
});

// 각 tool 호출이 자동으로 retryable step이 됨
// Lambda crash, deploy 중에도 상태 유지
```
