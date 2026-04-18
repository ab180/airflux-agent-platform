/**
 * LLM cost tracking module (inspired by GSD-2 metrics ledger pattern).
 * Calculates USD cost from token counts using model-specific pricing.
 *
 * User attribution: every cost entry is attributed to a userId. When a
 * caller does not pass one explicitly, the active request-context userId
 * is used; absent any context the attribution falls back to 'system'
 * (scheduler, cron, warm-up calls). This keeps per-user billing consistent
 * across the admin UI and future chargeback reports.
 */

import { getRequestContext } from '../runtime/request-context.js';

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
  userId: string;
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

interface PerUserTotals {
  entries: number;
  totalUsd: number;
  inputTokens: number;
  outputTokens: number;
}

const perUserTotals = new Map<string, PerUserTotals>();

function resetIfNewDay(): void {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== lastResetDate) {
    dailyCostUsd = 0;
    dailyInputTokens = 0;
    dailyOutputTokens = 0;
    perUserTotals.clear();
    lastResetDate = today;
  }
}

function resolveUserId(explicit: string | undefined): string {
  if (explicit && explicit.length > 0) return explicit;
  const ctx = getRequestContext();
  if (ctx?.userId && ctx.userId.length > 0) return ctx.userId;
  return 'system';
}

/** Record a cost entry from an agent execution. userId defaults to request context. */
export function recordCost(
  entry: Omit<CostEntry, 'costUsd' | 'userId'> & { userId?: string },
): CostEntry {
  resetIfNewDay();
  const userId = resolveUserId(entry.userId);
  const costUsd = calculateCost(entry.model, {
    inputTokens: entry.inputTokens,
    outputTokens: entry.outputTokens,
  });

  dailyCostUsd += costUsd;
  dailyInputTokens += entry.inputTokens;
  dailyOutputTokens += entry.outputTokens;

  const existing = perUserTotals.get(userId) ?? {
    entries: 0,
    totalUsd: 0,
    inputTokens: 0,
    outputTokens: 0,
  };
  perUserTotals.set(userId, {
    entries: existing.entries + 1,
    totalUsd: existing.totalUsd + costUsd,
    inputTokens: existing.inputTokens + entry.inputTokens,
    outputTokens: existing.outputTokens + entry.outputTokens,
  });

  return { ...entry, userId, costUsd };
}

/** Get today's aggregated costs grouped by user. */
export function getCostByUser(): Array<{
  userId: string;
  entries: number;
  totalUsd: number;
  inputTokens: number;
  outputTokens: number;
}> {
  resetIfNewDay();
  return Array.from(perUserTotals.entries()).map(([userId, totals]) => ({
    userId,
    ...totals,
  }));
}

/** Test-only: reset daily ledger + per-user totals. */
export function resetDailyCostForTest(): void {
  dailyCostUsd = 0;
  dailyInputTokens = 0;
  dailyOutputTokens = 0;
  perUserTotals.clear();
  lastResetDate = new Date().toISOString().slice(0, 10);
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
