import type { LLMProvider, ModelTier } from '../types/agent.js';

class LocalClaudeProvider implements LLMProvider {
  private static readonly MODELS: Record<ModelTier, string> = {
    fast: 'claude-haiku-4.5',
    default: 'claude-sonnet-4.6',
    powerful: 'claude-opus-4.6',
  };

  getModel(tier: ModelTier): string {
    return LocalClaudeProvider.MODELS[tier];
  }

  getName(): string {
    return 'local-claude';
  }
}

class BedrockProvider implements LLMProvider {
  private static readonly MODELS: Record<ModelTier, string> = {
    fast: 'anthropic.claude-haiku-4.5',
    default: 'anthropic.claude-sonnet-4.6',
    powerful: 'anthropic.claude-opus-4.6',
  };

  getModel(tier: ModelTier): string {
    return BedrockProvider.MODELS[tier];
  }

  getName(): string {
    return 'bedrock';
  }
}

class InternalAgentProvider implements LLMProvider {
  getModel(tier: ModelTier): string {
    return `internal/${tier}`;
  }

  getName(): string {
    return 'internal-agent-api';
  }
}

function autoDetectProvider(): LLMProvider {
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return new BedrockProvider();
  }
  if (process.env.AGENT_API_URL) {
    return new InternalAgentProvider();
  }
  return new LocalClaudeProvider();
}

export function createProvider(): LLMProvider {
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

export const provider = createProvider();
