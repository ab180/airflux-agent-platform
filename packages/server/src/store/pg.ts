/**
 * PostgreSQL connection pool.
 * Used when DATABASE_URL is set. Falls back to SQLite (db.ts) otherwise.
 *
 * All new features (chat history, cost tracking) use PostgreSQL when available.
 * Legacy stores (log-store, feedback-store, etc.) continue using SQLite
 * and will be migrated incrementally.
 */

import pg from 'pg';
import { logger } from '../lib/logger.js';

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function isPostgresAvailable(): boolean {
  return !!process.env.DATABASE_URL;
}

export function getPgPool(): pg.Pool {
  if (pool) return pool;

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');

  pool = new Pool({
    connectionString: url,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  pool.on('error', (err: Error) => {
    logger.error('PostgreSQL pool error', { error: err.message });
  });

  logger.info('PostgreSQL pool created', { url: url.replace(/\/\/.*@/, '//***@') });
  return pool;
}

/**
 * Initialize PostgreSQL tables.
 * Called once at server startup when DATABASE_URL is present.
 */
export async function initPgTables(): Promise<void> {
  const p = getPgPool();

  await p.query(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'anonymous',
      agent TEXT NOT NULL DEFAULT 'echo-agent',
      title TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user', 'agent')),
      text TEXT NOT NULL,
      agent TEXT,
      trace_id TEXT,
      duration_ms INTEGER,
      input_tokens INTEGER,
      output_tokens INTEGER,
      model TEXT,
      tool_calls TEXT[], -- array of tool names
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS cost_entries (
      id SERIAL PRIMARY KEY,
      timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      agent TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cost_usd NUMERIC(10, 6) NOT NULL DEFAULT 0,
      duration_ms INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_cost_timestamp ON cost_entries(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_cost_agent ON cost_entries(agent, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id, updated_at DESC);
  `);

  logger.info('PostgreSQL tables initialized');
}

/**
 * Gracefully close the pool.
 */
export async function closePgPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
