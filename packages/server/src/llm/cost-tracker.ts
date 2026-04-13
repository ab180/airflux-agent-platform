/**
 * LLM cost tracking module (inspired by GSD-2 metrics ledger pattern).
 * Calculates USD cost from token counts using model-specific pricing.
 */

// Pricing per 1M tokens (USD) — Anthropic as of 2026-04
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5-20251001':   { input: 0.80,  output: 4.00 },
  'claude-sonnet-4-6-20250514':  { input: 3.00,  output: 15.00 },
  'claude-opus-4-6-20250514':    { input: 15.00, output: 75.00 },
};

// Tier → model mapping (must match model-factory.ts)
const TIER_MODELS: Record<string, string> = {
  fast: 'claude-haiku-4-5-20251001',
  default: 'claude-sonnet-4-6-20250514',
  powerful: 'claude-opus-4-6-20250514',
};

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface CostEntry {
  timestamp: string;
  agent: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number;
}

/** Calculate USD cost for a given model tier and token usage. */
export function calculateCost(tier: string, usage: TokenUsage): number {
  const modelId = TIER_MODELS[tier] || TIER_MODELS['default'];
  const pricing = MODEL_PRICING[modelId] || MODEL_PRICING['claude-sonnet-4-6-20250514'];

  const inputCost = (usage.inputTokens / 1_000_000) * pricing.input;
  const outputCost = (usage.outputTokens / 1_000_000) * pricing.output;

  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000; // 6 decimal places
}

/** In-memory cost ledger (flushed to overview stats). */
let dailyCostUsd = 0;
let dailyInputTokens = 0;
let dailyOutputTokens = 0;
let lastResetDate = new Date().toISOString().slice(0, 10);

function resetIfNewDay(): void {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== lastResetDate) {
    dailyCostUsd = 0;
    dailyInputTokens = 0;
    dailyOutputTokens = 0;
    lastResetDate = today;
  }
}

/** Record a cost entry from an agent execution. */
export function recordCost(entry: Omit<CostEntry, 'costUsd'>): CostEntry {
  resetIfNewDay();
  const costUsd = calculateCost(entry.model, {
    inputTokens: entry.inputTokens,
    outputTokens: entry.outputTokens,
  });

  dailyCostUsd += costUsd;
  dailyInputTokens += entry.inputTokens;
  dailyOutputTokens += entry.outputTokens;

  return { ...entry, costUsd };
}

/** Check if daily budget is exceeded. Returns null if OK, or error message if over budget. */
export function checkBudget(dailyBudget?: number): string | null {
  if (!dailyBudget || dailyBudget <= 0) return null;
  resetIfNewDay();
  if (dailyCostUsd >= dailyBudget) {
    return `Daily budget exceeded: $${dailyCostUsd.toFixed(4)} / $${dailyBudget} limit`;
  }
  return null;
}

/** Get today's aggregated cost stats. */
export function getDailyCostStats(): {
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  date: string;
} {
  resetIfNewDay();
  return {
    costUsd: Math.round(dailyCostUsd * 10000) / 10000,
    inputTokens: dailyInputTokens,
    outputTokens: dailyOutputTokens,
    date: lastResetDate,
  };
}
