/**
 * Advisor pattern implementation (Claude Advisor Tool).
 *
 * Pairs a cheaper executor model with a smarter advisor model.
 * The advisor sees the full context and provides strategic guidance.
 *
 * Platform-level implementation:
 * - Works at harness level, not just API passthrough
 * - Tracks advisor cost separately from executor cost
 * - Configurable per-agent via agents.yaml
 * - Automatic advisor tool injection when advisor is configured
 *
 * Usage in agents.yaml:
 *   - name: smart-agent
 *     model: default        # executor: Sonnet (cheap)
 *     advisor:
 *       model: powerful     # advisor: Opus (smart)
 *       maxUses: 3
 *       caching: true
 */

import type { AdvisorConfig, ModelTier } from '@airflux/core';
import { logger } from '../lib/logger.js';
import { recordCost } from './cost-tracker.js';

const TIER_MODELS: Record<ModelTier, string> = {
  fast: 'claude-haiku-4-5-20251001',
  default: 'claude-sonnet-4-6-20250514',
  powerful: 'claude-opus-4-6-20250514',
};

/**
 * Build the advisor tool definition for the Claude API.
 * This is injected into the tools array when an agent has advisor configured.
 */
export function buildAdvisorToolDef(config: AdvisorConfig) {
  const advisorModel = TIER_MODELS[config.model] || TIER_MODELS['powerful'];

  const toolDef: Record<string, unknown> = {
    type: 'advisor_20260301',
    name: 'advisor',
    model: advisorModel,
  };

  if (config.maxUses) {
    toolDef.max_uses = config.maxUses;
  }

  if (config.caching) {
    toolDef.caching = { type: 'ephemeral', ttl: '5m' };
  }

  return toolDef;
}

/**
 * Build the system prompt additions for advisor-enabled agents.
 * Injects timing guidance so the executor knows when to consult the advisor.
 */
export function buildAdvisorSystemPrompt(): string {
  return `
## Advisor 사용 가이드

advisor 도구를 통해 더 강력한 모델에 전략적 조언을 구할 수 있습니다.
파라미터 없이 호출하면 전체 대화 기록이 자동 전달됩니다.

advisor를 호출해야 하는 시점:
- 복잡한 작업 시작 전 (접근 방식 결정)
- 작업 완료 직전 (검증)
- 막혔을 때 (에러 반복, 접근 방식 수렴 안 됨)
- 접근 방식 변경 고려 시

advisor의 조언을 진지하게 고려하세요. 경험적 증거와 충돌할 때만 무시하세요.
`.trim();
}

/**
 * Extract advisor usage from the API response iterations array.
 * Returns separated executor and advisor token counts for accurate cost tracking.
 */
export function extractAdvisorUsage(iterations: unknown[]): {
  executorTokens: { input: number; output: number };
  advisorTokens: { input: number; output: number };
  advisorModel: string | null;
  advisorCalls: number;
} {
  let executorInput = 0;
  let executorOutput = 0;
  let advisorInput = 0;
  let advisorOutput = 0;
  let advisorModel: string | null = null;
  let advisorCalls = 0;

  if (!Array.isArray(iterations)) {
    return {
      executorTokens: { input: 0, output: 0 },
      advisorTokens: { input: 0, output: 0 },
      advisorModel: null,
      advisorCalls: 0,
    };
  }

  for (const iter of iterations) {
    const i = iter as Record<string, unknown>;
    if (i.type === 'advisor_message') {
      advisorInput += (i.input_tokens as number) || 0;
      advisorOutput += (i.output_tokens as number) || 0;
      advisorModel = (i.model as string) || null;
      advisorCalls++;
    } else if (i.type === 'message') {
      executorInput += (i.input_tokens as number) || 0;
      executorOutput += (i.output_tokens as number) || 0;
    }
  }

  return {
    executorTokens: { input: executorInput, output: executorOutput },
    advisorTokens: { input: advisorInput, output: advisorOutput },
    advisorModel,
    advisorCalls,
  };
}

/**
 * Record advisor cost separately from executor cost.
 */
export function recordAdvisorCost(
  agentName: string,
  advisorModel: string,
  advisorTokens: { input: number; output: number },
  durationMs: number,
): void {
  if (advisorTokens.input === 0 && advisorTokens.output === 0) return;

  // Map model ID back to tier for cost calculation
  const tier = (Object.entries(TIER_MODELS).find(([, id]) => id === advisorModel)?.[0] as ModelTier) || 'powerful';

  recordCost({
    timestamp: new Date().toISOString(),
    agent: `${agentName}:advisor`,
    model: tier,
    inputTokens: advisorTokens.input,
    outputTokens: advisorTokens.output,
    durationMs,
  });

  logger.info('Advisor cost recorded', {
    agent: agentName,
    advisorModel,
    inputTokens: advisorTokens.input,
    outputTokens: advisorTokens.output,
  });
}
