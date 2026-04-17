/**
 * Conversation API — PostgreSQL-backed chat history.
 * User-facing endpoints for managing conversations and messages.
 *
 * Pattern from ab180/agent: /v1/conversation API
 */

import { Hono } from 'hono';
import { getMessages, listConversations, deleteConversation } from '../store/conversation-store.js';
import { isPostgresAvailable } from '../store/pg.js';
import { requireTrustedUserId } from '../security/trusted-user.js';

export const conversationRoutes = new Hono();

conversationRoutes.get('/conversations', async (c) => {
  const userId = requireTrustedUserId(new Headers(c.req.raw.headers));
  if (!userId) return c.json({ success: false, error: 'Trusted user required' }, 401);
  const limit = Math.min(Number(c.req.query('limit')) || 50, 200);
  const conversations = await listConversations(userId, limit);
  return c.json({ conversations });
});

conversationRoutes.get('/conversations/:id/messages', async (c) => {
  const userId = requireTrustedUserId(new Headers(c.req.raw.headers));
  if (!userId) return c.json({ success: false, error: 'Trusted user required' }, 401);
  const id = c.req.param('id');
  const limit = Math.min(Number(c.req.query('limit')) || 100, 1000);
  const messages = await getMessages(id, limit, userId);
  return c.json({ messages });
});

conversationRoutes.delete('/conversations/:id', async (c) => {
  const userId = requireTrustedUserId(new Headers(c.req.raw.headers));
  if (!userId) return c.json({ success: false, error: 'Trusted user required' }, 401);
  const id = c.req.param('id');
  const deleted = await deleteConversation(id, userId);
  if (!deleted) return c.json({ success: false, error: 'Not found' }, 404);
  return c.json({ success: true });
});

conversationRoutes.get('/conversations/status', (c) => {
  return c.json({
    postgres: isPostgresAvailable(),
    note: isPostgresAvailable()
      ? 'Full conversation history available'
      : 'PostgreSQL not configured — set DATABASE_URL for persistent chat history',
  });
});
