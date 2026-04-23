import { getDb } from './db.js';
import type { PromptVersion } from '@airflux/runtime';

export type { PromptVersion };

let initialized = false;

function ensureTables(): void {
  if (initialized) return;
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS prompt_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent TEXT NOT NULL,
      version TEXT NOT NULL,
      content TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      is_current INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(agent, version)
    );

    CREATE INDEX IF NOT EXISTS idx_prompts_agent ON prompt_versions(agent);
    CREATE INDEX IF NOT EXISTS idx_prompts_current ON prompt_versions(agent, is_current);
  `);
  initialized = true;
}

export function getPromptVersions(agent: string): PromptVersion[] {
  ensureTables();
  return getDb().prepare(`
    SELECT id, agent, version, content, description,
           is_current as isCurrent, created_at as createdAt
    FROM prompt_versions
    WHERE agent = ?
    ORDER BY id DESC
  `).all(agent) as PromptVersion[];
}

export function getCurrentPrompt(agent: string): PromptVersion | null {
  ensureTables();
  const row = getDb().prepare(`
    SELECT id, agent, version, content, description,
           is_current as isCurrent, created_at as createdAt
    FROM prompt_versions
    WHERE agent = ? AND is_current = 1
  `).get(agent) as PromptVersion | undefined;
  return row || null;
}

export function createPromptVersion(
  agent: string,
  version: string,
  content: string,
  description: string,
  setAsCurrent: boolean = true,
): PromptVersion {
  ensureTables();
  const db = getDb();

  if (setAsCurrent) {
    db.prepare('UPDATE prompt_versions SET is_current = 0 WHERE agent = ?').run(agent);
  }

  const stmt = db.prepare(`
    INSERT INTO prompt_versions (agent, version, content, description, is_current, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    agent,
    version,
    content,
    description,
    setAsCurrent ? 1 : 0,
    new Date().toISOString(),
  );

  return {
    id: Number(result.lastInsertRowid),
    agent,
    version,
    content,
    description,
    isCurrent: setAsCurrent,
    createdAt: new Date().toISOString(),
  };
}

export function rollbackPrompt(agent: string, versionId: number): PromptVersion | null {
  ensureTables();
  const db = getDb();

  const target = db.prepare(`
    SELECT id, agent, version, content, description, created_at as createdAt
    FROM prompt_versions
    WHERE agent = ? AND id = ?
  `).get(agent, versionId) as PromptVersion | undefined;

  if (!target) return null;

  db.prepare('UPDATE prompt_versions SET is_current = 0 WHERE agent = ?').run(agent);
  db.prepare('UPDATE prompt_versions SET is_current = 1 WHERE id = ?').run(versionId);

  return { ...target, isCurrent: true };
}

export function getPromptAgents(): string[] {
  ensureTables();
  return (getDb().prepare(`
    SELECT DISTINCT agent FROM prompt_versions ORDER BY agent
  `).all() as { agent: string }[]).map(r => r.agent);
}
