# LLM Provider Strategy

> 환경별 LLM 접근 방식: 로컬(Claude Code 크레덴셜) → 인프라(Bedrock/내부 Agent API)

## 1. 환경별 전략

```
로컬 개발:
  Claude Code 크레덴셜 (~/.claude/.credentials.json)
  → 본인 구독 크레딧 사용
  → API 키 비용 없음

인프라 (AB180):
  경로 A: agent.internal.airbridge.io (기존 내부 Agent API)
  경로 B: AWS Bedrock (IAM 역할, API 키 불필요)
  → 회사 빌링
```

## 2. Provider 추상화

에이전트 코드는 Provider를 모른다. 문자열만 안다.

```typescript
// 에이전트는 이것만 호출
const result = await generateText({
  model: provider.getModel('default'),
  prompt: question,
});

// Provider가 환경에 따라 다른 백엔드 연결
interface LLMProvider {
  getModel(tier: 'fast' | 'default' | 'powerful'): LanguageModel;
  estimateCost(inputTokens: number, outputTokens: number): number;
  getName(): string;
}
```

## 3. 로컬: Claude Code 크레덴셜 Provider

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { homedir } from 'os';

class LocalClaudeProvider implements LLMProvider {
  private client: Anthropic;

  constructor() {
    // Claude Code의 OAuth 토큰 읽기
    const token = this.getClaudeCodeToken();
    this.client = new Anthropic({ apiKey: token });
  }

  private getClaudeCodeToken(): string {
    // 1. 환경변수 우선
    if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
    if (process.env.ANTHROPIC_AUTH_TOKEN) return process.env.ANTHROPIC_AUTH_TOKEN;

    // 2. Claude Code 크레덴셜 파일
    const credPaths = [
      `${homedir()}/.claude/.credentials.json`,
      `${homedir()}/.config/claude/credentials.json`,
    ];

    for (const path of credPaths) {
      try {
        const creds = JSON.parse(readFileSync(path, 'utf-8'));
        if (creds.oauthToken) return creds.oauthToken;
        if (creds.apiKey) return creds.apiKey;
      } catch { /* 다음 경로 시도 */ }
    }

    throw new Error('Claude 크레덴셜을 찾을 수 없습니다. claude login을 먼저 실행하세요.');
  }

  getModel(tier: 'fast' | 'default' | 'powerful'): LanguageModel {
    const models = {
      fast: 'claude-haiku-4.5',
      default: 'claude-sonnet-4.6',
      powerful: 'claude-opus-4.6',
    };
    return anthropic(models[tier]);
  }

  getName(): string { return 'local-claude'; }
}
```

## 4. 인프라: Bedrock Provider

```typescript
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';

class BedrockProvider implements LLMProvider {
  private bedrock: ReturnType<typeof createAmazonBedrock>;

  constructor() {
    // IAM 역할 자동 사용 — API 키 불필요
    this.bedrock = createAmazonBedrock({
      region: process.env.AWS_REGION || 'us-east-1',
      // Lambda 실행 역할의 IAM 권한으로 자동 인증
    });
  }

  getModel(tier: 'fast' | 'default' | 'powerful'): LanguageModel {
    const models = {
      fast: 'anthropic.claude-haiku-4.5',
      default: 'anthropic.claude-sonnet-4.6',
      powerful: 'anthropic.claude-opus-4.6',
    };
    return this.bedrock(models[tier]);
  }

  getName(): string { return 'bedrock'; }
}
```

## 5. 인프라: 내부 Agent API Provider

```typescript
class InternalAgentProvider implements LLMProvider {
  private baseUrl: string;

  constructor() {
    this.baseUrl = process.env.AGENT_API_URL || 'https://agent.internal.airbridge.io';
  }

  getModel(tier: 'fast' | 'default' | 'powerful'): LanguageModel {
    // 내부 API가 모델 선택을 처리
    // 에이전트 시스템은 채널/프롬프트만 전달
    return createInternalModel(this.baseUrl, tier);
  }

  getName(): string { return 'internal-agent-api'; }
}
```

## 6. Provider 자동 선택

```typescript
// src/providers/index.ts
function createProvider(): LLMProvider {
  const env = process.env.LLM_PROVIDER || 'auto';

  switch (env) {
    case 'local-claude':
      return new LocalClaudeProvider();
    case 'bedrock':
      return new BedrockProvider();
    case 'internal':
      return new InternalAgentProvider();
    case 'auto':
    default:
      return autoDetectProvider();
  }
}

function autoDetectProvider(): LLMProvider {
  // 1. Lambda 환경 (AWS_LAMBDA_FUNCTION_NAME) → Bedrock
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return new BedrockProvider();
  }

  // 2. 내부 Agent API 설정 있으면 → Internal
  if (process.env.AGENT_API_URL) {
    return new InternalAgentProvider();
  }

  // 3. 그 외 (로컬) → Claude Code 크레덴셜
  return new LocalClaudeProvider();
}

// 싱글턴
export const provider = createProvider();
```

## 7. 설정

```yaml
# settings/agents.yaml — provider 별도 지정도 가능
- name: data-agent
  model: default          # 'fast' | 'default' | 'powerful'
  # provider는 환경에서 자동 감지

- name: router-agent
  model: fast             # Router는 빠르고 저렴한 모델
```

```bash
# 로컬 개발 (.env.local)
LLM_PROVIDER=local-claude
# 또는 auto (기본값 — Claude Code 크레덴셜 자동 감지)

# 인프라 (.env.production)
LLM_PROVIDER=bedrock
AWS_REGION=us-east-1

# 또는 내부 API
LLM_PROVIDER=internal
AGENT_API_URL=https://agent.internal.airbridge.io
```

## 8. 확장: 멀티 Provider

나중에 OpenAI, Gemini 등 추가 시:

```typescript
class OpenAIProvider implements LLMProvider { ... }
class VertexProvider implements LLMProvider { ... }

// A/B 테스트: 같은 에이전트에 다른 Provider
const variants = {
  control: { provider: 'bedrock', model: 'default' },
  treatment: { provider: 'openai', model: 'default' },
};
```

## 9. 설계 결정 이유

| 결정 | 이유 |
|------|------|
| 로컬에서 Claude Code 크레덴셜 | API 키 비용 없음. 본인 구독으로 개발 |
| 인프라에서 Bedrock | AB180 AWS 인프라 활용, IAM 자동 인증 |
| auto 감지 | 환경변수 하나로 전환 — 코드 변경 없음 |
| tier (fast/default/powerful) | 모델명 하드코딩 대신 역할 기반 선택 |
| 내부 Agent API 경로 | 이미 있는 인프라 재사용 가능성 |
