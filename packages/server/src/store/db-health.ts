import { getDb } from './db.js';
import { cleanExpiredSessions } from './session-store.js';
import { statSync } from 'fs';
import type { TableInfo, DbHealth, CleanupResult } from '@airflux/runtime';

export type { TableInfo, DbHealth, CleanupResult };

export function getDbHealth(): DbHealth {
  const db = getDb();

  // Get DB file path
  const pathResult = db.pragma('database_list') as { file: string }[];
  const dbPath = pathResult[0]?.file || 'unknown';

  // Get file size
  let sizeBytes = 0;
  try {
    sizeBytes = statSync(dbPath).size;
    // Add WAL file size if exists
    try { sizeBytes += statSync(dbPath + '-wal').size; } catch {}
  } catch {}

  // Check WAL mode
  const journalMode = (db.pragma('journal_mode') as { journal_mode: string }[])[0]?.journal_mode;

  // Get table row counts
  const tableNames = db.prepare(`
    SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all() as { name: string }[];

  const tables: TableInfo[] = tableNames.map(({ name }) => {
    const { count } = db.prepare(`SELECT COUNT(*) as count FROM "${name}"`).get() as { count: number };
    return { name, rowCount: count };
  });

  return {
    status: 'ok',
    path: dbPath,
    sizeBytes,
    sizeHuman: formatBytes(sizeBytes),
    walMode: journalMode === 'wal',
    tables,
  };
}

export function cleanupDb(maxLogDays: number = 30, maxSessionHours: number = 24): CleanupResult {
  const db = getDb();

  // Clean expired sessions
  const expiredSessions = cleanExpiredSessions(maxSessionHours);

  // Clean old logs (keep last N days)
  // Validate input to prevent SQL injection via datetime offset
  const safeDays = Math.max(1, Math.min(Math.floor(Number(maxLogDays) || 30), 365));
  const logResult = db.prepare(`
    DELETE FROM request_logs
    WHERE timestamp < datetime('now', ?)
  `).run(`-${safeDays} days`);

  // Clean old eval runs (keep last 50)
  const evalResult = db.prepare(`
    DELETE FROM eval_runs
    WHERE id NOT IN (SELECT id FROM eval_runs ORDER BY timestamp DESC LIMIT 50)
  `).run();

  return {
    expiredSessions,
    oldLogs: logResult.changes,
    oldEvalRuns: evalResult.changes,
  };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}
