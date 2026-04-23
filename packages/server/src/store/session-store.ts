import { getDb } from './db.js';
import type { SessionMessage, Session } from '@airflux/runtime';

export type { SessionMessage, Session };

const MAX_MESSAGES_PER_SESSION = 20;

let initialized = false;

function ensureTables(): void {
  if (initialized) return;
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      messages TEXT NOT NULL DEFAULT '[]',
      last_activity TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_activity ON sessions(last_activity);
  `);
  initialized = true;
}

export function getSession(sessionId: string): Session | null {
  ensureTables();
  const row = getDb().prepare(`
    SELECT id, user_id as userId, messages, last_activity as lastActivity
    FROM sessions WHERE id = ?
  `).get(sessionId) as { id: string; userId: string; messages: string; lastActivity: string } | undefined;

  if (!row) return null;

  return {
    id: row.id,
    userId: row.userId,
    messages: JSON.parse(row.messages),
    lastActivity: row.lastActivity,
  };
}

export function getOrCreateSession(sessionId: string, userId: string): Session {
  const existing = getSession(sessionId);
  if (existing) return existing;

  ensureTables();
  getDb().prepare(`
    INSERT INTO sessions (id, user_id, messages, last_activity)
    VALUES (?, ?, '[]', ?)
  `).run(sessionId, userId, new Date().toISOString());

  return { id: sessionId, userId, messages: [], lastActivity: new Date().toISOString() };
}

export function appendToSession(
  sessionId: string,
  userMessage: string,
  agentMessage: string,
  agentName: string,
): void {
  ensureTables();
  const session = getSession(sessionId);
  if (!session) return;

  const now = new Date().toISOString();
  const messages = [
    ...session.messages,
    { role: 'user' as const, text: userMessage, timestamp: now },
    { role: 'agent' as const, text: agentMessage, agent: agentName, timestamp: now },
  ];

  // Keep only the last N messages to prevent unbounded growth
  const trimmed = messages.slice(-MAX_MESSAGES_PER_SESSION);

  getDb().prepare(`
    UPDATE sessions SET messages = ?, last_activity = ? WHERE id = ?
  `).run(JSON.stringify(trimmed), now, sessionId);
}

export function getSessionHistory(sessionId: string): string {
  const session = getSession(sessionId);
  if (!session || session.messages.length === 0) return '';

  return session.messages
    .map(m => `${m.role === 'user' ? '사용자' : m.agent || '에이전트'}: ${m.text}`)
    .join('\n');
}

export function cleanExpiredSessions(maxAgeHours: number = 24): number {
  ensureTables();
  // Validate input to prevent SQL injection via datetime offset
  const safeHours = Math.max(1, Math.min(Math.floor(Number(maxAgeHours) || 24), 720));
  const result = getDb().prepare(`
    DELETE FROM sessions
    WHERE last_activity < datetime('now', ?)
  `).run(`-${safeHours} hours`);
  return result.changes;
}
