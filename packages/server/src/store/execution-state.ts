/**
 * Agent execution state machine (GSD-2 disk-driven state pattern).
 * Tracks execution lifecycle: pending → running → completed/failed.
 * Enables crash detection (stale "running" entries) and retry logic.
 */

import { getDb } from './db.js';
import type { ExecutionStatus, ExecutionState } from '@airflux/runtime';

export type { ExecutionStatus, ExecutionState };

let initialized = false;

function ensureTable(): void {
  if (initialized) return;
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS execution_state (
      id TEXT PRIMARY KEY,
      agent TEXT NOT NULL,
      query TEXT NOT NULL,
      user_id TEXT NOT NULL DEFAULT 'anonymous',
      source TEXT NOT NULL DEFAULT 'api',
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'timeout')),
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      duration_ms INTEGER,
      error TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_exec_status ON execution_state(status);
    CREATE INDEX IF NOT EXISTS idx_exec_agent ON execution_state(agent, started_at DESC);
  `);
  initialized = true;
}

/** Mark execution as started (pending → running). */
export function startExecution(id: string, agent: string, query: string, userId: string, source: string): void {
  ensureTable();
  getDb().prepare(`
    INSERT INTO execution_state (id, agent, query, user_id, source, status, started_at)
    VALUES (?, ?, ?, ?, ?, 'running', datetime('now'))
  `).run(id, agent, query.slice(0, 500), userId, source);
}

/** Mark execution as completed. */
export function completeExecution(id: string, durationMs: number): void {
  ensureTable();
  getDb().prepare(`
    UPDATE execution_state
    SET status = 'completed', completed_at = datetime('now'), duration_ms = ?
    WHERE id = ?
  `).run(durationMs, id);
}

/** Mark execution as failed. */
export function failExecution(id: string, error: string, durationMs: number): void {
  ensureTable();
  getDb().prepare(`
    UPDATE execution_state
    SET status = 'failed', completed_at = datetime('now'), duration_ms = ?, error = ?
    WHERE id = ?
  `).run(durationMs, error.slice(0, 500), id);
}

/** Detect stale executions (running for too long — likely crashed). */
export function getStaleExecutions(maxAgeMinutes: number = 10): ExecutionState[] {
  ensureTable();
  return getDb().prepare(`
    SELECT id, agent, query, user_id as userId, source, status,
           started_at as startedAt, completed_at as completedAt,
           duration_ms as durationMs, error, retry_count as retryCount
    FROM execution_state
    WHERE status = 'running'
      AND started_at < datetime('now', ?)
    ORDER BY started_at ASC
  `).all(`-${maxAgeMinutes} minutes`) as ExecutionState[];
}

/**
 * Recover from crash: mark all stale "running" entries as "timeout".
 * Called at server startup (GSD-2 crash recovery pattern).
 * Returns number of recovered entries.
 */
export function recoverStaleExecutions(maxAgeMinutes: number = 10): number {
  ensureTable();
  const result = getDb().prepare(`
    UPDATE execution_state
    SET status = 'timeout', completed_at = datetime('now'), error = 'Server restart: execution was still running'
    WHERE status = 'running'
      AND started_at < datetime('now', ?)
  `).run(`-${maxAgeMinutes} minutes`);
  return result.changes;
}

/** Get execution stats summary. */
export function getExecutionStats(): {
  running: number;
  completed: number;
  failed: number;
  stale: number;
} {
  ensureTable();
  const db = getDb();
  const running = (db.prepare("SELECT COUNT(*) as c FROM execution_state WHERE status = 'running'").get() as { c: number }).c;
  const completed = (db.prepare("SELECT COUNT(*) as c FROM execution_state WHERE status = 'completed'").get() as { c: number }).c;
  const failed = (db.prepare("SELECT COUNT(*) as c FROM execution_state WHERE status = 'failed'").get() as { c: number }).c;
  const stale = (db.prepare("SELECT COUNT(*) as c FROM execution_state WHERE status = 'running' AND started_at < datetime('now', '-10 minutes')").get() as { c: number }).c;

  return { running, completed, failed, stale };
}
