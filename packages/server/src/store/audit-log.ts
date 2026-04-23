/**
 * SQLite adapter for AuditLogStore (interface declared in @airflux/runtime).
 *
 * Append-only record of security-relevant events — admin auth, token
 * create/delete, prompt/config changes. Distinct from request_logs which
 * tracks agent queries for performance/debugging. Do NOT put query bodies
 * here; use request_logs for that.
 */

import { randomUUID } from 'crypto';
import type {
  AuditEvent,
  AuditRow,
  AuditOutcome,
  QueryAuditOpts,
} from '@airflux/runtime';
import { getDb } from './db.js';
import { logger } from '../lib/logger.js';

export type { AuditEvent, AuditRow, AuditOutcome, QueryAuditOpts };

let initialized = false;

function ensureTables(): void {
  if (initialized) return;
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      resource TEXT,
      outcome TEXT NOT NULL CHECK (outcome IN ('success','failure')),
      ip TEXT,
      user_agent TEXT,
      metadata TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action, timestamp DESC);
  `);
  initialized = true;
}

/**
 * Record an audit event. Best-effort: writes synchronously for simplicity
 * but catches errors so audit failures never bubble up and break callers.
 */
export function logAudit(event: AuditEvent): void {
  try {
    ensureTables();
    const id = randomUUID();
    const timestamp = new Date().toISOString();
    getDb()
      .prepare(
        `INSERT INTO audit_log (id, timestamp, user_id, action, resource, outcome, ip, user_agent, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        timestamp,
        event.userId,
        event.action,
        event.resource ?? null,
        event.outcome,
        event.ip ?? null,
        event.userAgent ?? null,
        JSON.stringify(event.metadata ?? {}),
      );
  } catch (e) {
    logger.warn('audit log write failed', {
      action: event.action,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

export function queryAudit(opts: QueryAuditOpts = {}): { events: AuditRow[]; total: number } {
  ensureTables();
  const limit = Math.min(opts.limit ?? 50, 500);
  const offset = opts.offset ?? 0;
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (opts.userId) {
    conditions.push('user_id = ?');
    params.push(opts.userId);
  }
  if (opts.action) {
    conditions.push('action = ?');
    params.push(opts.action);
  }
  if (opts.outcome) {
    conditions.push('outcome = ?');
    params.push(opts.outcome);
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

  const db = getDb();
  const total = (
    db.prepare(`SELECT COUNT(*) as count FROM audit_log ${where}`).get(...params) as {
      count: number;
    }
  ).count;
  const rows = db
    .prepare(
      `SELECT id, timestamp, user_id as "userId", action, resource, outcome, ip,
              user_agent as "userAgent", metadata
       FROM audit_log ${where}
       ORDER BY timestamp DESC, rowid DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as Array<
    Omit<AuditRow, 'metadata'> & { metadata: string }
  >;

  const events: AuditRow[] = rows.map((r) => ({
    ...r,
    metadata: safeParse(r.metadata),
  }));
  return { events, total };
}

function safeParse(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return {};
  }
}
