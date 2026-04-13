import { getDb } from './db.js';

export interface Feedback {
  id: string;
  traceId: string;
  rating: 'positive' | 'negative';
  comment: string | null;
  userId: string;
  agent: string;
  timestamp: string;
}

let initialized = false;

function ensureTables(): void {
  if (initialized) return;
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS feedback (
      id TEXT PRIMARY KEY,
      trace_id TEXT NOT NULL,
      rating TEXT NOT NULL CHECK (rating IN ('positive', 'negative')),
      comment TEXT,
      user_id TEXT NOT NULL DEFAULT 'anonymous',
      agent TEXT NOT NULL,
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_feedback_trace ON feedback(trace_id);
    CREATE INDEX IF NOT EXISTS idx_feedback_agent ON feedback(agent);
    CREATE INDEX IF NOT EXISTS idx_feedback_rating ON feedback(rating);
    CREATE INDEX IF NOT EXISTS idx_feedback_agent_rating ON feedback(agent, rating, timestamp DESC);
  `);
  initialized = true;
}

export function insertFeedback(feedback: Feedback): void {
  ensureTables();
  getDb().prepare(`
    INSERT INTO feedback (id, trace_id, rating, comment, user_id, agent, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    feedback.id,
    feedback.traceId,
    feedback.rating,
    feedback.comment,
    feedback.userId,
    feedback.agent,
    feedback.timestamp,
  );
}

export interface FeedbackDetail extends Feedback {
  query: string | null;
  responseText: string | null;
  durationMs: number | null;
}

export function getFeedbackDetail(traceId: string): FeedbackDetail | null {
  ensureTables();
  const row = getDb().prepare(`
    SELECT
      f.id, f.trace_id as traceId, f.rating, f.comment, f.user_id as userId, f.agent, f.timestamp,
      rl.query, rl.response_text as responseText, rl.duration_ms as durationMs
    FROM feedback f
    LEFT JOIN request_logs rl ON f.trace_id = rl.id
    WHERE f.trace_id = ?
    ORDER BY f.timestamp DESC
    LIMIT 1
  `).get(traceId) as FeedbackDetail | undefined;
  return row || null;
}

export function queryFeedback(opts: {
  limit?: number;
  offset?: number;
  agent?: string;
  rating?: string;
  startDate?: string;
  endDate?: string;
} = {}): { feedback: Feedback[]; total: number } {
  ensureTables();
  const limit = opts.limit || 50;
  const offset = opts.offset || 0;
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (opts.agent) {
    conditions.push('agent = ?');
    params.push(opts.agent);
  }
  if (opts.rating) {
    conditions.push('rating = ?');
    params.push(opts.rating);
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

  const { count: total } = getDb()
    .prepare(`SELECT COUNT(*) as count FROM feedback ${where}`)
    .get(...params) as { count: number };

  const feedback = getDb()
    .prepare(`
      SELECT id, trace_id as traceId, rating, comment, user_id as userId, agent, timestamp
      FROM feedback ${where}
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `)
    .all(...params, limit, offset) as Feedback[];

  return { feedback, total };
}

export function getFeedbackStats(): {
  total: number;
  positive: number;
  negative: number;
  positiveRate: number;
} {
  ensureTables();
  const stats = getDb().prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN rating = 'positive' THEN 1 ELSE 0 END) as positive,
      SUM(CASE WHEN rating = 'negative' THEN 1 ELSE 0 END) as negative
    FROM feedback
  `).get() as { total: number; positive: number; negative: number };

  return {
    ...stats,
    positiveRate: stats.total > 0
      ? Number(((stats.positive / stats.total) * 100).toFixed(1))
      : 0,
  };
}
