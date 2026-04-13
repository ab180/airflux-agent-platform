import { getDb } from './db.js';

/**
 * Pre-aggregated daily stats per agent.
 * Refreshed periodically to avoid scanning full request_logs on every dashboard load.
 */

let initialized = false;

function ensureTables(): void {
  if (initialized) return;
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS daily_agent_stats (
      date TEXT NOT NULL,
      agent TEXT NOT NULL,
      requests INTEGER NOT NULL DEFAULT 0,
      errors INTEGER NOT NULL DEFAULT 0,
      avg_duration_ms INTEGER NOT NULL DEFAULT 0,
      total_input_tokens INTEGER NOT NULL DEFAULT 0,
      total_output_tokens INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (date, agent)
    );
  `);
  initialized = true;
}

export function refreshDailyStats(): { date: string; agentsUpdated: number } {
  ensureTables();
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);

  // Delete today's stats (will be re-computed)
  db.prepare('DELETE FROM daily_agent_stats WHERE date = ?').run(today);

  // Aggregate from request_logs
  const result = db.prepare(`
    INSERT INTO daily_agent_stats (date, agent, requests, errors, avg_duration_ms, total_input_tokens, total_output_tokens)
    SELECT
      DATE(timestamp) as date,
      agent,
      COUNT(*) as requests,
      SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as errors,
      CAST(AVG(duration_ms) AS INTEGER) as avg_duration_ms,
      SUM(COALESCE(input_tokens, 0)) as total_input_tokens,
      SUM(COALESCE(output_tokens, 0)) as total_output_tokens
    FROM request_logs
    WHERE timestamp >= ? AND timestamp < datetime(?, '+1 day')
    GROUP BY DATE(timestamp), agent
  `).run(today, today);

  return { date: today, agentsUpdated: result.changes };
}

export function getDailyStats(days: number = 7): {
  date: string;
  agent: string;
  requests: number;
  errors: number;
  avgDurationMs: number;
}[] {
  ensureTables();
  // Validate input to prevent SQL injection via datetime offset
  const safeDays = Math.max(1, Math.min(Math.floor(Number(days) || 7), 365));
  return getDb().prepare(`
    SELECT date, agent, requests, errors, avg_duration_ms as avgDurationMs
    FROM daily_agent_stats
    WHERE date >= DATE('now', ?)
    ORDER BY date DESC, requests DESC
  `).all(`-${safeDays} days`) as {
    date: string;
    agent: string;
    requests: number;
    errors: number;
    avgDurationMs: number;
  }[];
}
