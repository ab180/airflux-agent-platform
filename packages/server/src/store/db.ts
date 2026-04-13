import Database from 'better-sqlite3';
import { resolve } from 'path';
import { mkdirSync } from 'fs';
import { logger } from '../lib/logger.js';

let instance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (instance) return instance;

  const dbPath = process.env.LOG_DB_PATH || resolve(process.cwd(), '../../data/airflux.db');
  const dir = resolve(dbPath, '..');
  mkdirSync(dir, { recursive: true });

  instance = new Database(dbPath);
  instance.pragma('journal_mode = WAL');
  instance.pragma('synchronous = NORMAL');
  instance.pragma('cache_size = -64000');   // 64MB cache for faster queries
  instance.pragma('temp_store = MEMORY');   // Use memory for temp tables

  logger.info("SQLite database initialized", { path: dbPath });
  return instance;
}
