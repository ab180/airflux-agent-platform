/**
 * Inter-agent message API routes.
 * Dashboard uses these to display agent communication.
 */

import { Hono } from 'hono';
import { getRecentMessages, getThread, getPendingMessages, getMessageStats, sendMessage } from '../bus/message-bus.js';

export const messageRoutes = new Hono();

// List recent messages (with optional agent filter)
messageRoutes.get('/', async (c) => {
  const agentName = c.req.query('agent');
  const limit = parseInt(c.req.query('limit') || '50', 10);

  if (agentName) {
    const pending = await getPendingMessages(agentName, limit);
    return c.json({ agent: agentName, messages: pending });
  }

  const [messages, stats] = await Promise.all([
    getRecentMessages(limit),
    getMessageStats(),
  ]);
  return c.json({ messages, stats });
});

// Get a message thread
messageRoutes.get('/:id/thread', async (c) => {
  const id = c.req.param('id');
  const thread = await getThread(id);
  return c.json({ thread });
});

// Get stats
messageRoutes.get('/stats', async (c) => {
  const stats = await getMessageStats();
  return c.json(stats);
});

// Admin: manually inject a message (for testing)
messageRoutes.post('/', async (c) => {
  const body = await c.req.json() as {
    fromAgent: string;
    toAgent: string;
    subject: string;
    body: string;
    type?: string;
    priority?: string;
  };

  if (!body.fromAgent || !body.toAgent || !body.subject || !body.body) {
    return c.json({ error: 'fromAgent, toAgent, subject, body are required' }, 400);
  }

  const id = await sendMessage({
    fromAgent: body.fromAgent,
    toAgent: body.toAgent,
    subject: body.subject,
    body: body.body,
    type: (body.type as 'request' | 'response' | 'notification' | 'finding') || 'request',
    priority: (body.priority as 'low' | 'normal' | 'high' | 'urgent') || 'normal',
  });

  return c.json({ sent: true, messageId: id });
});
