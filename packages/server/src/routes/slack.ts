/**
 * Slack Event API webhook endpoint.
 * Receives messages from Slack, routes to the appropriate agent, responds in-thread.
 *
 * Setup:
 *   1. Create Slack App at api.slack.com
 *   2. Set env: SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET
 *   3. Event Subscriptions → Request URL: https://your-domain/api/slack/events
 *   4. Subscribe to: message.channels, app_mention
 */

import { Hono } from 'hono';
import { AgentRegistry, runGuardrails, maskPii } from '@airflux/core';
import { SlackResponseChannel } from '../channels/slack.js';
import { getRouter } from '../bootstrap.js';
import { insertLog } from '../store/log-store.js';
import { checkBudget } from '../llm/cost-tracker.js';
import { recordCost } from '../llm/cost-tracker.js';
import { logger } from '../lib/logger.js';
import { getOrCreateSession, appendToSession, getSessionHistory } from '../store/session-store.js';
import { startExecution, completeExecution, failExecution } from '../store/execution-state.js';
import { createHmac, timingSafeEqual } from 'crypto';
import { randomUUID } from 'crypto';

export const slackRoute = new Hono();

/** Verify Slack request signature */
function verifySlackSignature(
  signingSecret: string,
  signature: string,
  timestamp: string,
  body: string,
): boolean {
  const baseString = `v0:${timestamp}:${body}`;
  const hmac = createHmac('sha256', signingSecret).update(baseString).digest('hex');
  const expected = `v0=${hmac}`;
  if (signature.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

slackRoute.post('/slack/events', async (c) => {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  const rawBody = await c.req.text();

  // Verify signature if secret is configured
  if (signingSecret) {
    const signature = c.req.header('x-slack-signature') || '';
    const timestamp = c.req.header('x-slack-request-timestamp') || '';

    // Reject requests older than 5 minutes (replay protection)
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - Number(timestamp)) > 300) {
      return c.json({ error: 'Request too old' }, 403);
    }

    if (!verifySlackSignature(signingSecret, signature, timestamp, rawBody)) {
      return c.json({ error: 'Invalid signature' }, 403);
    }
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  // Handle Slack URL verification challenge
  if (body.type === 'url_verification') {
    return c.json({ challenge: body.challenge });
  }

  // Handle event callbacks
  if (body.type === 'event_callback') {
    const event = body.event as Record<string, string>;

    // Ignore bot messages (prevent loops)
    if (event.bot_id || event.subtype === 'bot_message') {
      return c.json({ ok: true });
    }

    const query = (event.text || '').replace(/<@[A-Z0-9]+>/g, '').trim(); // Strip @mentions
    if (!query) return c.json({ ok: true });

    const userId = event.user || 'slack-user';
    const channelId = event.channel || '';
    const threadTs = event.thread_ts || event.ts || '';

    // Run guardrails
    const guardrailCheck = runGuardrails(['prompt-injection', 'pii-filter'], { text: query, type: 'input' });
    if (!guardrailCheck.pass) {
      const reason = guardrailCheck.results.find(r => !r.pass)?.reason || 'Blocked';
      const channel = new SlackResponseChannel('', channelId, threadTs);
      await channel.send({ success: false, error: `차단됨: ${reason}` });
      // Log blocked request for monitoring
      try {
        insertLog({
          id: randomUUID(),
          timestamp: new Date().toISOString(),
          agent: 'guardrail',
          query: query.slice(0, 200),
          userId: `slack:${userId}`,
          source: 'slack',
          success: false,
          responseText: null,
          errorMessage: `Guardrail blocked: ${reason}`,
          durationMs: 0,
          inputTokens: null,
          outputTokens: null,
        });
      } catch { /* non-critical */ }
      return c.json({ ok: true });
    }

    // Session management — load conversation history for this Slack thread
    const sessionId = `slack:${channelId}:${threadTs}`;
    let sessionHistory = '';
    try {
      getOrCreateSession(sessionId, `slack:${userId}`);
      sessionHistory = getSessionHistory(sessionId);
    } catch {
      // Session store not critical
    }

    // Route to agent
    const routed = getRouter().route(query);
    const agentName = routed.agent;
    const traceId = randomUUID();

    const responseChannel = new SlackResponseChannel('', channelId, threadTs);

    // Budget check (GSD-2 budget enforcement — same as query.ts)
    const agentInstance = AgentRegistry.getOptional(agentName);
    const budgetError = checkBudget(agentInstance?.config.dailyBudget);
    if (budgetError) {
      await responseChannel.send({ success: false, error: budgetError });
      return c.json({ ok: true });
    }

    // Track execution state (GSD-2 state machine)
    startExecution(traceId, agentName, query, `slack:${userId}`, 'slack');

    const startTime = performance.now();
    try {
      const result = await AgentRegistry.execute(agentName, {
        question: query,
        userId: `slack:${userId}`,
        sessionId,
        source: 'slack',
        responseChannel,
        sessionHistory: sessionHistory || undefined,
        metadata: { channel: channelId, threadTs },
      });

      const durationMs = Math.round(performance.now() - startTime);
      completeExecution(traceId, durationMs);

      // Save to session for conversation continuity
      if (result.success && result.text) {
        try { appendToSession(sessionId, query, result.text, agentName); } catch { /* non-critical */ }
      }

      // PII masking on response
      if (result.text) {
        const masked = maskPii(result.text);
        if (masked.masked) result.text = masked.text;
      }

      await responseChannel.send(result);

      // Track cost
      const usage = (result.metadata as Record<string, unknown>)?.usage as { inputTokens?: number; outputTokens?: number } | undefined;
      if (usage?.inputTokens || usage?.outputTokens) {
        recordCost({
          timestamp: new Date().toISOString(),
          agent: agentName,
          model: (result.metadata as Record<string, unknown>)?.model as string || 'default',
          inputTokens: usage.inputTokens || 0,
          outputTokens: usage.outputTokens || 0,
          durationMs,
        });
      }

      // Log
      insertLog({
        id: traceId,
        timestamp: new Date().toISOString(),
        agent: agentName,
        query,
        userId: `slack:${userId}`,
        source: 'slack',
        success: result.success,
        responseText: result.text?.slice(0, 500) || null,
        errorMessage: result.error || null,
        durationMs,
        inputTokens: usage?.inputTokens || null,
        outputTokens: usage?.outputTokens || null,
      });

      logger.info('Slack query processed', { agent: agentName, userId, durationMs });
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : 'Unknown';
      failExecution(traceId, errMsg, Math.round(performance.now() - startTime));
      await responseChannel.send({
        success: false,
        error: `에이전트 실행 실패: ${errMsg}`,
      });
    }

    return c.json({ ok: true });
  }

  return c.json({ ok: true });
});

/**
 * Slack slash command endpoint.
 * Setup: Slash Commands → Request URL: https://your-domain/api/slack/command
 * Command: /ask (or custom name)
 *
 * Slack sends form-urlencoded body with: text, user_id, channel_id, response_url
 */
slackRoute.post('/slack/command', async (c) => {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  const rawBody = await c.req.text();

  if (signingSecret) {
    const signature = c.req.header('x-slack-signature') || '';
    const timestamp = c.req.header('x-slack-request-timestamp') || '';
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - Number(timestamp)) > 300) {
      return c.text('Request too old', 403);
    }
    if (!verifySlackSignature(signingSecret, signature, timestamp, rawBody)) {
      return c.text('Invalid signature', 403);
    }
  }

  const params = new URLSearchParams(rawBody);
  const query = params.get('text')?.trim() || '';
  const userId = params.get('user_id') || 'slack-user';
  const channelId = params.get('channel_id') || '';
  const responseUrl = params.get('response_url') || '';

  if (!query) {
    return c.json({ response_type: 'ephemeral', text: '사용법: /ask 질문 내용' });
  }

  // Guardrails
  const guardrailCheck = runGuardrails(['prompt-injection', 'pii-filter'], { text: query, type: 'input' });
  if (!guardrailCheck.pass) {
    const reason = guardrailCheck.results.find(r => !r.pass)?.reason || 'Blocked';
    return c.json({ response_type: 'ephemeral', text: `차단됨: ${reason}` });
  }

  // Route and execute (respond immediately, then send result via response_url)
  const routed = getRouter().route(query);
  const agentName = routed.agent;

  // Immediate ack (Slack requires response within 3s)
  // Process async and reply via response_url
  const traceId = randomUUID();
  startExecution(traceId, agentName, query, `slack:${userId}`, 'slack');

  // Async execution
  (async () => {
    const startTime = performance.now();
    try {
      const channel = new SlackResponseChannel(responseUrl, channelId);
      const result = await AgentRegistry.execute(agentName, {
        question: query,
        userId: `slack:${userId}`,
        sessionId: `slack-cmd:${channelId}:${traceId}`,
        source: 'slack',
        responseChannel: channel,
        metadata: { channel: channelId, slashCommand: true },
      });

      const durationMs = Math.round(performance.now() - startTime);
      completeExecution(traceId, durationMs);

      if (result.text) {
        const masked = maskPii(result.text);
        if (masked.masked) result.text = masked.text;
      }

      await channel.send(result);

      const usage = (result.metadata as Record<string, unknown>)?.usage as { inputTokens?: number; outputTokens?: number } | undefined;
      if (usage?.inputTokens || usage?.outputTokens) {
        recordCost({ timestamp: new Date().toISOString(), agent: agentName, model: (result.metadata as Record<string, unknown>)?.model as string || 'default', inputTokens: usage.inputTokens || 0, outputTokens: usage.outputTokens || 0, durationMs });
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : 'Unknown';
      failExecution(traceId, errMsg, Math.round(performance.now() - startTime));
      if (responseUrl) {
        await fetch(responseUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: `에러: ${errMsg}` }) }).catch(() => {});
      }
    }
  })();

  return c.json({ response_type: 'in_channel', text: `🔄 ${agentName} 에이전트가 처리 중...` });
});
