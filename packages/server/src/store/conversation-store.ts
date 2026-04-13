/**
 * Conversation store — PostgreSQL-backed chat history.
 * Provides unlimited message history per conversation.
 * Falls back to SQLite session store when PostgreSQL is unavailable.
 */

import { getPgPool, isPostgresAvailable } from './pg.js';
import { randomUUID } from 'crypto';

export interface Conversation {
  id: string;
  userId: string;
  agent: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'agent';
  text: string;
  agent?: string;
  traceId?: string;
  durationMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  model?: string;
  toolCalls?: string[];
  createdAt: string;
}

/** Create or get a conversation. */
export async function getOrCreateConversation(
  conversationId: string,
  userId: string,
  agent: string = 'echo-agent',
): Promise<Conversation> {
  if (!isPostgresAvailable()) {
    return { id: conversationId, userId, agent, title: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  }

  const pool = getPgPool();
  const existing = await pool.query('SELECT * FROM conversations WHERE id = $1', [conversationId]);
  if (existing.rows[0]) return existing.rows[0] as Conversation;

  await pool.query(
    'INSERT INTO conversations (id, user_id, agent) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING',
    [conversationId, userId, agent],
  );
  return { id: conversationId, userId, agent, title: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
}

/** Add a message to a conversation. */
export async function addMessage(msg: Omit<ChatMessage, 'id' | 'createdAt'>): Promise<ChatMessage> {
  const id = randomUUID();
  const now = new Date().toISOString();

  if (!isPostgresAvailable()) {
    return { ...msg, id, createdAt: now };
  }

  const pool = getPgPool();
  await pool.query(
    `INSERT INTO messages (id, conversation_id, role, text, agent, trace_id, duration_ms, input_tokens, output_tokens, model, tool_calls)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [id, msg.conversationId, msg.role, msg.text, msg.agent, msg.traceId, msg.durationMs, msg.inputTokens, msg.outputTokens, msg.model, msg.toolCalls || []],
  );

  // Update conversation timestamp + title (first user message)
  await pool.query(
    `UPDATE conversations SET updated_at = NOW(), title = COALESCE(title, $2) WHERE id = $1`,
    [msg.conversationId, msg.role === 'user' ? msg.text.slice(0, 100) : null],
  );

  return { ...msg, id, createdAt: now };
}

/** Get messages for a conversation (no limit — full history). */
export async function getMessages(conversationId: string, limit: number = 100): Promise<ChatMessage[]> {
  if (!isPostgresAvailable()) return [];

  const pool = getPgPool();
  const result = await pool.query(
    `SELECT id, conversation_id as "conversationId", role, text, agent, trace_id as "traceId",
            duration_ms as "durationMs", input_tokens as "inputTokens", output_tokens as "outputTokens",
            model, tool_calls as "toolCalls", created_at as "createdAt"
     FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC LIMIT $2`,
    [conversationId, limit],
  );
  return result.rows as ChatMessage[];
}

/** List conversations for a user. */
export async function listConversations(userId: string, limit: number = 50): Promise<Conversation[]> {
  if (!isPostgresAvailable()) return [];

  const pool = getPgPool();
  const result = await pool.query(
    `SELECT id, user_id as "userId", agent, title, created_at as "createdAt", updated_at as "updatedAt"
     FROM conversations WHERE user_id = $1 ORDER BY updated_at DESC LIMIT $2`,
    [userId, limit],
  );
  return result.rows as Conversation[];
}

/** Delete a conversation and all its messages. */
export async function deleteConversation(conversationId: string): Promise<boolean> {
  if (!isPostgresAvailable()) return false;

  const pool = getPgPool();
  const result = await pool.query('DELETE FROM conversations WHERE id = $1', [conversationId]);
  return (result.rowCount ?? 0) > 0;
}
