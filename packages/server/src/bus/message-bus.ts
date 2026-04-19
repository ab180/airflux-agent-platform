/**
 * Inter-agent message bus — PostgreSQL-backed with in-memory fallback.
 *
 * Agents communicate by sending messages through this bus.
 * Messages are typed (request/response/notification/finding) and
 * can be threaded via parent_id.
 *
 * ---
 * FROZEN 2026-04-18 — expansion paused
 *
 * Existing queue/store functions remain usable. No new message types, no
 * new producers/consumers until a documented multi-agent user story
 * exists. See docs/FROZEN.md.
 */

import { randomUUID } from 'crypto';
import { isPostgresAvailable, getPgPool } from '../store/pg.js';
import { logger } from '../lib/logger.js';

export interface AgentMessage {
  id: string;
  fromAgent: string;
  toAgent: string;
  type: 'request' | 'response' | 'notification' | 'finding';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  subject: string;
  body: string;
  metadata: Record<string, unknown>;
  parentId?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: string;
  processedAt?: string;
}

// In-memory fallback when PostgreSQL is unavailable
const memoryStore: AgentMessage[] = [];

export async function sendMessage(msg: {
  fromAgent: string;
  toAgent: string;
  type?: AgentMessage['type'];
  priority?: AgentMessage['priority'];
  subject: string;
  body: string;
  metadata?: Record<string, unknown>;
  parentId?: string;
}): Promise<string> {
  const id = randomUUID();
  const now = new Date().toISOString();

  if (isPostgresAvailable()) {
    const pool = getPgPool();
    await pool.query(
      `INSERT INTO agent_messages (id, from_agent, to_agent, type, priority, subject, body, metadata, parent_id, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', $10)`,
      [
        id,
        msg.fromAgent,
        msg.toAgent,
        msg.type || 'request',
        msg.priority || 'normal',
        msg.subject,
        msg.body,
        JSON.stringify(msg.metadata || {}),
        msg.parentId || null,
        now,
      ],
    );
  } else {
    memoryStore.push({
      id,
      fromAgent: msg.fromAgent,
      toAgent: msg.toAgent,
      type: msg.type || 'request',
      priority: msg.priority || 'normal',
      subject: msg.subject,
      body: msg.body,
      metadata: msg.metadata || {},
      parentId: msg.parentId,
      status: 'pending',
      createdAt: now,
    });
  }

  logger.info('Agent message sent', { id, from: msg.fromAgent, to: msg.toAgent, type: msg.type || 'request', subject: msg.subject });
  return id;
}

export async function getPendingMessages(agentName: string, limit = 10): Promise<AgentMessage[]> {
  if (isPostgresAvailable()) {
    const pool = getPgPool();
    const { rows } = await pool.query(
      `SELECT * FROM agent_messages
       WHERE (to_agent = $1 OR to_agent = '*') AND status = 'pending'
       ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, created_at ASC
       LIMIT $2`,
      [agentName, limit],
    );
    return rows.map(rowToMessage);
  }
  return memoryStore
    .filter(m => (m.toAgent === agentName || m.toAgent === '*') && m.status === 'pending')
    .sort((a, b) => priorityOrder(a.priority) - priorityOrder(b.priority))
    .slice(0, limit);
}

export async function markProcessed(messageId: string, status: 'completed' | 'failed'): Promise<void> {
  const now = new Date().toISOString();

  if (isPostgresAvailable()) {
    const pool = getPgPool();
    await pool.query(
      `UPDATE agent_messages SET status = $1, processed_at = $2 WHERE id = $3`,
      [status, now, messageId],
    );
  } else {
    const msg = memoryStore.find(m => m.id === messageId);
    if (msg) {
      msg.status = status;
      msg.processedAt = now;
    }
  }
}

export async function getThread(parentId: string): Promise<AgentMessage[]> {
  if (isPostgresAvailable()) {
    const pool = getPgPool();
    const { rows } = await pool.query(
      `SELECT * FROM agent_messages WHERE id = $1 OR parent_id = $1 ORDER BY created_at ASC`,
      [parentId],
    );
    return rows.map(rowToMessage);
  }
  return memoryStore.filter(m => m.id === parentId || m.parentId === parentId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getRecentMessages(limit = 50): Promise<AgentMessage[]> {
  if (isPostgresAvailable()) {
    const pool = getPgPool();
    const { rows } = await pool.query(
      `SELECT * FROM agent_messages ORDER BY created_at DESC LIMIT $1`,
      [limit],
    );
    return rows.map(rowToMessage);
  }
  return [...memoryStore].reverse().slice(0, limit);
}

export async function getMessageStats(): Promise<{
  total: number;
  pending: number;
  byAgent: Record<string, number>;
}> {
  if (isPostgresAvailable()) {
    const pool = getPgPool();
    const [totalRes, pendingRes, byAgentRes] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM agent_messages`),
      pool.query(`SELECT COUNT(*) FROM agent_messages WHERE status = 'pending'`),
      pool.query(`SELECT from_agent, COUNT(*) as cnt FROM agent_messages GROUP BY from_agent`),
    ]);
    const byAgent: Record<string, number> = {};
    for (const row of byAgentRes.rows) {
      byAgent[row.from_agent] = parseInt(row.cnt, 10);
    }
    return {
      total: parseInt(totalRes.rows[0].count, 10),
      pending: parseInt(pendingRes.rows[0].count, 10),
      byAgent,
    };
  }
  const byAgent: Record<string, number> = {};
  for (const m of memoryStore) {
    byAgent[m.fromAgent] = (byAgent[m.fromAgent] || 0) + 1;
  }
  return {
    total: memoryStore.length,
    pending: memoryStore.filter(m => m.status === 'pending').length,
    byAgent,
  };
}

// Helpers

function rowToMessage(row: Record<string, unknown>): AgentMessage {
  return {
    id: row.id as string,
    fromAgent: row.from_agent as string,
    toAgent: row.to_agent as string,
    type: row.type as AgentMessage['type'],
    priority: row.priority as AgentMessage['priority'],
    subject: row.subject as string,
    body: row.body as string,
    metadata: (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) as Record<string, unknown>,
    parentId: row.parent_id as string | undefined,
    status: row.status as AgentMessage['status'],
    createdAt: (row.created_at as Date)?.toISOString?.() ?? String(row.created_at),
    processedAt: row.processed_at ? ((row.processed_at as Date)?.toISOString?.() ?? String(row.processed_at)) : undefined,
  };
}

function priorityOrder(p: string): number {
  return { urgent: 0, high: 1, normal: 2, low: 3 }[p] ?? 2;
}
