import { Hono } from 'hono';
import { randomUUID } from 'crypto';
import { insertFeedback } from '../store/feedback-store.js';
import { logger } from '../lib/logger.js';

const UUID_PATTERN = /^[0-9a-f-]{36}$/i;
const AGENT_NAME_PATTERN = /^[a-z][a-z0-9-]{0,49}$/;
const MAX_COMMENT_LENGTH = 500;
const MAX_USER_ID_LENGTH = 200;

export const feedbackRoute = new Hono();

feedbackRoute.post('/feedback', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: 'Invalid JSON' }, 400);
  }

  if (!body || typeof body !== 'object') {
    return c.json({ success: false, error: 'Request body must be a JSON object' }, 400);
  }

  const b = body as Record<string, unknown>;

  // traceId: required, UUID format
  if (typeof b.traceId !== 'string' || !UUID_PATTERN.test(b.traceId)) {
    return c.json({ success: false, error: 'traceId must be a valid UUID' }, 400);
  }

  // rating: required, enum
  if (b.rating !== 'positive' && b.rating !== 'negative') {
    return c.json({ success: false, error: 'rating must be "positive" or "negative"' }, 400);
  }

  // agent: optional, safe pattern
  let agent = 'unknown';
  if (b.agent !== undefined) {
    if (typeof b.agent !== 'string' || !AGENT_NAME_PATTERN.test(b.agent)) {
      return c.json({ success: false, error: 'agent must be a lowercase alphanumeric name' }, 400);
    }
    agent = b.agent;
  }

  // userId: optional, length-limited
  let userId = 'anonymous';
  if (b.userId !== undefined) {
    if (typeof b.userId !== 'string' || b.userId.length > MAX_USER_ID_LENGTH) {
      return c.json({ success: false, error: `userId must be a string of max ${MAX_USER_ID_LENGTH} chars` }, 400);
    }
    userId = b.userId;
  }

  // comment: optional, truncated
  const comment = typeof b.comment === 'string' ? b.comment.slice(0, MAX_COMMENT_LENGTH) : null;

  const feedback = {
    id: randomUUID(),
    traceId: b.traceId,
    rating: b.rating as 'positive' | 'negative',
    comment,
    userId,
    agent,
    timestamp: new Date().toISOString(),
  };

  try {
    insertFeedback(feedback);
    return c.json({ success: true, id: feedback.id });
  } catch (e) {
    logger.error('Feedback write failed', { error: e instanceof Error ? e.message : String(e) });
    return c.json({ success: false, error: 'Failed to save feedback' }, 500);
  }
});
