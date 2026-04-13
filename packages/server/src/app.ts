import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger as honoLogger } from 'hono/logger';
import { logger } from './lib/logger.js';
import { securityHeaders, requestId, bodyLimit, adminAuth } from './middleware/security.js';
import { serverTiming } from './middleware/timing.js';
import { rateLimit } from './middleware/rate-limit.js';
import { queryRoute } from './routes/query.js';
import { feedbackRoute } from './routes/feedback.js';
import { adminRoutes } from './routes/admin.js';
import { healthRoute } from './routes/health.js';
import { slackRoute } from './routes/slack.js';
import { conversationRoutes } from './routes/conversations.js';
import { cliAuthRoutes } from './routes/cli-auth.js';

export const app = new Hono();

// Global middleware
app.use('*', requestId);
app.use('*', serverTiming);
app.use('*', securityHeaders);
app.use('*', honoLogger());

// CORS: restrict origin in production, allow all in dev
app.use('/api/*', cors({
  origin: process.env.CORS_ORIGIN || '*',
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Admin-Key', 'X-Request-Id'],
  maxAge: 3600,
}));

// Rate limiting
app.use('/api/query', rateLimit({ windowMs: 60_000, max: 30 }));    // 30 req/min for queries
app.use('/api/feedback', rateLimit({ windowMs: 60_000, max: 60 })); // 60 req/min for feedback

// Body size limit
app.use('/api/query', bodyLimit(100_000));        // 100KB for queries
app.use('/api/admin/*', bodyLimit(100_000));        // 100KB for other admin

// Health check (no auth required)
app.route('/api', healthRoute);

// Agent query endpoint (user-facing)
app.route('/api', queryRoute);

// Feedback endpoint (user-facing)
app.use('/api/feedback', bodyLimit(10_000));
app.route('/api', feedbackRoute);

// Slack integration (no admin auth — verified by Slack signing secret)
app.route('/api', slackRoute);

// Conversation API (user-facing, PostgreSQL-backed)
app.route('/api', conversationRoutes);

// CLI auth (trigger claude/codex login from dashboard)
app.route('/api', cliAuthRoutes);

// Admin API endpoints (requires auth in production)
app.use('/api/admin/*', adminAuth);
app.route('/api/admin', adminRoutes);

// Root info endpoint
app.get('/', (c) =>
  c.json({
    name: 'Airflux Agent Platform',
    version: '0.1.0',
  }),
);

// Global error handler - never leak internal details
app.onError((err, c) => {
  logger.error('Unhandled error', { error: err instanceof Error ? err.message : String(err) });
  return c.json({ success: false, error: 'Internal server error' }, 500);
});
