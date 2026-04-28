/**
 * Persistent cost store — PostgreSQL-backed.
 * Each LLM call is recorded with agent, model, tokens, and USD cost.
 */

import { getPgPool, isPostgresAvailable } from './pg.js';
import type { CostEntry } from '@airflux/runtime';

export type { CostEntry };

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
