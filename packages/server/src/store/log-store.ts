import { getDb } from './db.js';
import type { RequestLog, LogQuery } from '@airflux/runtime';

export type { RequestLog, LogQuery };

let initialized = false;

function ensureTables(): void {
  if (initialized) return;
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS request_logs (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      agent TEXT NOT NULL,
      query TEXT NOT NULL,
      user_id TEXT NOT NULL DEFAULT 'anonymous',
      source TEXT NOT NULL DEFAULT 'api',
      success INTEGER NOT NULL DEFAULT 1,
      response_text TEXT,
      error_message TEXT,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      input_tokens INTEGER,
      output_tokens INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON request_logs(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_logs_agent ON request_logs(agent);
    CREATE INDEX IF NOT EXISTS idx_logs_user ON request_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_logs_agent_timestamp ON request_logs(agent, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_logs_success_timestamp ON request_logs(success, timestamp DESC);
  `);
  initialized = true;
}

export function insertLog(log: RequestLog): void {
  ensureTables();
  const stmt = getDb().prepare(`
    INSERT INTO request_logs (id, timestamp, agent, query, user_id, source, success, response_text, error_message, duration_ms, input_tokens, output_tokens)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    log.id,
    log.timestamp,
    log.agent,
    log.query,
    log.userId,
    log.source,
    log.success ? 1 : 0,
    log.responseText,
    log.errorMessage,
    log.durationMs,
    log.inputTokens,
    log.outputTokens,
  );
}


export function queryLogs(opts: LogQuery = {}): { logs: RequestLog[]; total: number } {
  ensureTables();
  const limit = opts.limit || 50;
  const offset = opts.offset || 0;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (opts.agent) {
    conditions.push('agent = ?');
    params.push(opts.agent);
  }
  if (opts.success !== undefined) {
    conditions.push('success = ?');
    params.push(opts.success ? 1 : 0);
  }
  if (opts.startDate) {
    conditions.push('timestamp >= ?');
    params.push(opts.startDate);
  }
  if (opts.endDate) {
    conditions.push('timestamp <= ?');
    params.push(opts.endDate);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countStmt = getDb().prepare(`SELECT COUNT(*) as count FROM request_logs ${where}`);
  const { count: total } = countStmt.get(...params) as { count: number };

  const stmt = getDb().prepare(`
    SELECT id, timestamp, agent, query, user_id as userId, source,
           success, response_text as responseText, error_message as errorMessage,
           duration_ms as durationMs, input_tokens as inputTokens, output_tokens as outputTokens
    FROM request_logs ${where}
    ORDER BY timestamp DESC
    LIMIT ? OFFSET ?
  `);

  const logs = stmt.all(...params, limit, offset) as RequestLog[];

  return {
    logs: logs.map(l => ({ ...l, success: Boolean(l.success) })),
    total,
  };
}

export function getLogStats() {
  ensureTables();
  const db = getDb();

  const today = new Date().toISOString().slice(0, 10);
  const todayStats = db.prepare(`
    SELECT
      COUNT(*) as requestsToday,
      SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as errorsToday,
      AVG(duration_ms) as avgDurationMs,
      SUM(COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0)) as totalTokens
    FROM request_logs
    WHERE timestamp >= ?
  `).get(today) as { requestsToday: number; errorsToday: number; avgDurationMs: number; totalTokens: number };

  return {
    requestsToday: todayStats.requestsToday || 0,
    errorsToday: todayStats.errorsToday || 0,
    errorRate: todayStats.requestsToday > 0
      ? Number(((todayStats.errorsToday / todayStats.requestsToday) * 100).toFixed(1))
      : 0,
    avgDurationMs: Math.round(todayStats.avgDurationMs || 0),
    totalTokens: todayStats.totalTokens || 0,
  };
}

export function getAgentStats(): { name: string; requestsToday: number }[] {
  ensureTables();
  const today = new Date().toISOString().slice(0, 10);
  return getDb().prepare(`
    SELECT agent as name, COUNT(*) as requestsToday
    FROM request_logs
    WHERE timestamp >= ?
    GROUP BY agent
    ORDER BY requestsToday DESC
  `).all(today) as { name: string; requestsToday: number }[];
}

export function getDetailedMetrics() {
  ensureTables();
  const db = getDb();

  // Overall totals
  const totals = db.prepare(`
    SELECT
      COUNT(*) as totalRequests,
      SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as totalErrors,
      AVG(duration_ms) as avgDuration,
      MAX(duration_ms) as maxDuration,
      SUM(COALESCE(input_tokens, 0)) as totalInputTokens,
      SUM(COALESCE(output_tokens, 0)) as totalOutputTokens
    FROM request_logs
  `).get() as Record<string, number>;

  // Per-agent stats
  const agentBreakdown = db.prepare(`
    SELECT
      agent,
      COUNT(*) as requests,
      SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as errors,
      AVG(duration_ms) as avgDuration,
      MAX(duration_ms) as maxDuration
    FROM request_logs
    GROUP BY agent
    ORDER BY requests DESC
  `).all() as { agent: string; requests: number; errors: number; avgDuration: number; maxDuration: number }[];

  // Recent 24h hourly breakdown
  const hourly = db.prepare(`
    SELECT
      strftime('%H', timestamp) as hour,
      COUNT(*) as requests,
      SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as errors
    FROM request_logs
    WHERE timestamp >= datetime('now', '-24 hours')
    GROUP BY hour
    ORDER BY hour
  `).all() as { hour: string; requests: number; errors: number }[];

  // Recent 10 errors
  const recentErrors = db.prepare(`
    SELECT agent, query, error_message as error, timestamp, duration_ms as durationMs
    FROM request_logs
    WHERE success = 0
    ORDER BY timestamp DESC
    LIMIT 10
  `).all() as { agent: string; query: string; error: string; timestamp: string; durationMs: number }[];

  return {
    totals: {
      requests: totals.totalRequests || 0,
      errors: totals.totalErrors || 0,
      errorRate: totals.totalRequests > 0
        ? Number(((totals.totalErrors / totals.totalRequests) * 100).toFixed(1))
        : 0,
      avgDuration: Math.round(totals.avgDuration || 0),
      maxDuration: totals.maxDuration || 0,
      tokens: {
        input: totals.totalInputTokens || 0,
        output: totals.totalOutputTokens || 0,
      },
    },
    agentBreakdown: agentBreakdown.map(a => ({
      ...a,
      avgDuration: Math.round(a.avgDuration || 0),
      errorRate: a.requests > 0
        ? Number(((a.errors / a.requests) * 100).toFixed(1))
        : 0,
    })),
    hourly,
    recentErrors,
  };
}
