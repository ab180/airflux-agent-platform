/**
 * Persistent cost store — PostgreSQL-backed.
 * Replaces in-memory cost tracking when DATABASE_URL is set.
 * Each LLM call is recorded with agent, model, tokens, and USD cost.
 */

import { getPgPool, isPostgresAvailable } from './pg.js';

export interface CostEntry {
  agent: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number;
  timestamp: string;
  userId: string;
}

/** Record a cost entry to PostgreSQL. */
export async function recordCostPg(entry: CostEntry): Promise<void> {
  if (!isPostgresAvailable()) return;

  const pool = getPgPool();
  await pool.query(
    `INSERT INTO cost_entries (timestamp, agent, model, input_tokens, output_tokens, cost_usd, duration_ms, user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [entry.timestamp, entry.agent, entry.model, entry.inputTokens, entry.outputTokens, entry.costUsd, entry.durationMs, entry.userId],
  );
}

/** Get cost breakdown by user for the last N days. */
export async function getCostByUserPg(days: number = 7): Promise<Array<{
  userId: string;
  totalUsd: number;
  totalTokens: number;
  entries: number;
}>> {
  if (!isPostgresAvailable()) return [];

  const pool = getPgPool();
  const result = await pool.query(
    `SELECT
       user_id as "userId",
       SUM(cost_usd)::numeric as "totalUsd",
       SUM(input_tokens + output_tokens)::int as "totalTokens",
       COUNT(*)::int as entries
     FROM cost_entries
     WHERE timestamp >= NOW() - INTERVAL '1 day' * $1
     GROUP BY user_id
     ORDER BY "totalUsd" DESC`,
    [days],
  );
  return result.rows;
}

/** Get recent cost entries for a specific user. */
export async function getCostEntriesForUserPg(
  userId: string,
  limit: number = 50,
): Promise<Array<{
  timestamp: string;
  agent: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number;
}>> {
  if (!isPostgresAvailable()) return [];

  const pool = getPgPool();
  const result = await pool.query(
    `SELECT
       timestamp,
       agent,
       model,
       input_tokens as "inputTokens",
       output_tokens as "outputTokens",
       cost_usd as "costUsd",
       duration_ms as "durationMs"
     FROM cost_entries
     WHERE user_id = $1
     ORDER BY timestamp DESC
     LIMIT $2`,
    [userId, limit],
  );
  return result.rows;
}

/** Get daily cost stats from PostgreSQL. */
export async function getDailyCostPg(date?: string): Promise<{
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  entries: number;
}> {
  if (!isPostgresAvailable()) return { costUsd: 0, inputTokens: 0, outputTokens: 0, entries: 0 };

  const pool = getPgPool();
  const d = date || new Date().toISOString().slice(0, 10);
  const result = await pool.query(
    `SELECT
       COALESCE(SUM(cost_usd), 0)::numeric as "costUsd",
       COALESCE(SUM(input_tokens), 0)::int as "inputTokens",
       COALESCE(SUM(output_tokens), 0)::int as "outputTokens",
       COUNT(*)::int as entries
     FROM cost_entries
     WHERE timestamp::date = $1`,
    [d],
  );
  return result.rows[0];
}

/** Get cost breakdown by agent. */
export async function getCostByAgent(days: number = 7): Promise<{
  agent: string;
  totalCost: number;
  totalTokens: number;
  calls: number;
}[]> {
  if (!isPostgresAvailable()) return [];

  const pool = getPgPool();
  const result = await pool.query(
    `SELECT
       agent,
       SUM(cost_usd)::numeric as "totalCost",
       SUM(input_tokens + output_tokens)::int as "totalTokens",
       COUNT(*)::int as calls
     FROM cost_entries
     WHERE timestamp >= NOW() - INTERVAL '1 day' * $1
     GROUP BY agent
     ORDER BY "totalCost" DESC`,
    [days],
  );
  return result.rows;
}

/** Get daily cost trend. */
export async function getCostTrend(days: number = 7): Promise<{
  date: string;
  costUsd: number;
  tokens: number;
}[]> {
  if (!isPostgresAvailable()) return [];

  const pool = getPgPool();
  const result = await pool.query(
    `SELECT
       timestamp::date::text as date,
       SUM(cost_usd)::numeric as "costUsd",
       SUM(input_tokens + output_tokens)::int as tokens
     FROM cost_entries
     WHERE timestamp >= NOW() - INTERVAL '1 day' * $1
     GROUP BY timestamp::date
     ORDER BY date ASC`,
    [days],
  );
  return result.rows;
}
