# Developer Onboarding — 새 에이전트 추가 가이드

> 새 에이전트를 추가할 때 개발자가 따라야 할 step-by-step 가이드

## 개요

Airflux Agent System에 새 에이전트를 추가하는 것은 **코드 + 설정 + 테스트 + 평가**의 4단계.
Montgomery의 "새 슬래시 커맨드 추가" 패턴을 에이전트 버전으로 확장.

## Step 1: 에이전트 코드 작성

### 1.1 디렉토리 생성

```bash
mkdir -p src/agents/my-agent
```

### 1.2 에이전트 클래스 구현

```typescript
// src/agents/my-agent/agent.ts
import { BaseAgent } from '../../core/base-agent';
import { AgentContext, AgentResult } from '../../types/agent';
import { Agent, stepCountIs } from 'ai';

export class MyAgent extends BaseAgent {
  name = 'my-agent';
  description = '내 에이전트의 설명';
  capability = {
    name: 'my-agent',
    description: '이 에이전트가 할 수 있는 것',
    examples: ['예시 질문 1', '예시 질문 2'],
    requiredDataSources: ['snowflake'],
  };

  private agent: Agent;

  constructor(config: AgentConfig) {
    super();
    this.agent = new Agent({
      model: config.model,
      instructions: this.buildSystemPrompt(config),
      tools: {
        // 에이전트 전용 도구 정의
        myTool: {
          description: '도구 설명',
          inputSchema: z.object({ param: z.string() }),
          execute: async ({ param }) => {
            // 구현
          },
        },
      },
      stopWhen: stepCountIs(config.maxSteps),
    });
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    const result = await this.agent.generate({
      messages: [{ role: 'user', content: context.question }],
    });

    return {
      summary: result.text,
      confidence: 'high',
      metadata: {
        agentType: this.name,
        model: this.agent.model,
        latencyMs: 0,  // logger.timed에서 측정
        costUsd: result.usage?.totalTokens ? estimateCost(result.usage) : 0,
        traceId: context.traceId,
        cached: false,
      },
    };
  }

  private buildSystemPrompt(config: AgentConfig): string {
    const prompts = loadConfig(`prompts/${this.name}`);
    return prompts.versions[config.promptVersion].system;
  }
}
```

### 1.3 인덱스 파일

```typescript
// src/agents/my-agent/index.ts
export { MyAgent } from './agent';
```

## Step 2: 설정 파일 추가

### 2.1 agents.yaml에 등록

```yaml
# settings/agents.yaml에 추가
- name: my-agent
  enabled: true
  model: anthropic/claude-sonnet-4.6
  maxSteps: 5
  temperature: 0
  costLimitPerRequest: 0.10
  dailyBudget: 20.0
  promptVersion: v1.0
  allowedSources: [slack, api]
  featureFlag: my_agent_enabled
```

### 2.2 프롬프트 버전 파일 생성

```yaml
# settings/prompts/my-agent.yaml
versions:
  v1.0:
    system: |
      당신은 ...

      ## 규칙
      1. ...
      2. ...
    current: true
```

### 2.3 feature flag 추가

```yaml
# settings/feature-flags.yaml에 추가
my_agent_enabled:
  description: "My Agent 기능 활성화"
  enabled: false                # 초기에는 비활성화
  rolloutPercentage: 0
  allowedUsers: [U_DEV_001]     # 개발자만 테스트
```

### 2.4 라우팅 규칙 추가

```yaml
# settings/routing-rules.yaml의 agents에 추가
my-agent:
  description: "내 에이전트 역할 설명"
  keywords: [관련, 키워드, 목록]
  examples:
    - question: "예시 질문"
      route: my-agent
```

## Step 3: AgentRegistry에 등록

```typescript
// src/core/agent-registry.ts의 agentModules에 추가
const agentModules: Record<string, () => Promise<any>> = {
  'sql': async () => (await import('../agents/sql-agent')).SqlAgent,
  'insight': async () => (await import('../agents/insight-agent')).InsightAgent,
  'image': async () => (await import('../agents/image-agent')).ImageAgent,
  'my-agent': async () => (await import('../agents/my-agent')).MyAgent,  // 추가
};
```

## Step 4: 테스트 작성

### 4.1 단위 테스트

```typescript
// tests/unit/my-agent.test.ts
import { describe, it, expect, vi } from 'vitest';
import { MyAgent } from '../../src/agents/my-agent/agent';

describe('MyAgent', () => {
  it('should handle basic question', async () => {
    // mock LLM 응답
    const agent = new MyAgent(mockConfig);
    const result = await agent.execute(mockContext);
    expect(result.summary).toBeDefined();
    expect(result.confidence).toBe('high');
  });

  it('should respect maxSteps', async () => {
    // maxSteps 초과 시 자연스럽게 종료 확인
  });

  it('should handle errors gracefully', async () => {
    // LLM 에러 시 AirfluxError 반환 확인
  });
});
```

### 4.2 Golden Dataset 추가

```json
// golden-dataset.json에 추가 (최소 5개)
{
  "id": "GD-MY-001",
  "category": "my_agent_category",
  "difficulty": "easy",
  "question": "테스트 질문",
  "expectedRoute": "my-agent",
  "answerPattern": "기대 패턴",
  "tags": ["my-agent", "basic"]
}
```

## Step 5: 배포 & 롤아웃

### 5.1 개발 테스트

```bash
# 로컬 테스트
npx vitest run tests/unit/my-agent.test.ts

# SST dev로 통합 테스트
npx sst dev
# Slack에서: debug: [테스트 질문]
```

### 5.2 점진적 롤아웃

```yaml
# 1단계: 개발자만
my_agent_enabled:
  enabled: true
  rolloutPercentage: 0
  allowedUsers: [U_DEV_001, U_DEV_002]

# 2단계: 10% 롤아웃
my_agent_enabled:
  enabled: true
  rolloutPercentage: 10

# 3단계: 전체 롤아웃
my_agent_enabled:
  enabled: true
  rolloutPercentage: 100
```

### 5.3 Golden Dataset 평가 통과 확인

```bash
# 배포 전 평가 실행
npm run eval -- --category my_agent_category
# 100% 통과 확인 후 배포
```

## 체크리스트

- [ ] `src/agents/my-agent/agent.ts` — 에이전트 클래스
- [ ] `src/agents/my-agent/index.ts` — export
- [ ] `settings/agents.yaml` — 에이전트 설정 추가
- [ ] `settings/prompts/my-agent.yaml` — 프롬프트 v1.0
- [ ] `settings/feature-flags.yaml` — feature flag 추가
- [ ] `settings/routing-rules.yaml` — 라우팅 규칙 추가
- [ ] `src/core/agent-registry.ts` — agentModules에 등록
- [ ] `tests/unit/my-agent.test.ts` — 단위 테스트 (최소 3개)
- [ ] `golden-dataset.json` — golden test case (최소 5개)
- [ ] 로컬 테스트 통과
- [ ] Golden Dataset 평가 통과
- [ ] Feature flag 점진적 롤아웃
