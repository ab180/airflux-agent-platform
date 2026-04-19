import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { AgentRegistry, HttpResponseChannel } from '@airflux/core';
import type { AgentContext } from '@airflux/core';
import { AssistantAgent } from '../agents/assistant-agent.js';
import { runWithRequestContext } from '../runtime/request-context.js';
import { resolveTrustedUserId } from '../security/trusted-user.js';
import { recordCost } from '../llm/cost-tracker.js';
import { toWireEvent, formatSSELine, type WireEvent } from '../streaming/stream-events.js';
import { logger } from '../lib/logger.js';

export const queryStreamRoute = new Hono();

/**
 * Streaming variant of /api/query. Emits Server-Sent Events with a narrow
 * wire vocabulary (text delta, tool-call, tool-result, done, error).
 *
 * Required body: { question: string, agent: string }
 * Optional body: { sessionId?: string }
 *
 * The agent MUST implement streamExecute() — today that is AssistantAgent.
 * For non-streaming agents the route returns 400 and clients fall back to
 * POST /api/query.
 */
queryStreamRoute.post('/query/stream', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: 'Invalid JSON' }, 400);
  }

  const b = body as Record<string, unknown>;
  const question = typeof b.question === 'string' ? b.question.trim() : '';
  const agentName = typeof b.agent === 'string' ? b.agent.trim() : '';
  const sessionId = typeof b.sessionId === 'string' ? b.sessionId : `stream-${Date.now()}`;
  const userId = resolveTrustedUserId(new Headers(c.req.raw.headers), 'anonymous');

  if (!question) return c.json({ success: false, error: 'question is required' }, 400);
  if (!agentName) return c.json({ success: false, error: 'agent is required for streaming' }, 400);

  const agent = AgentRegistry.getOptional(agentName);
  if (!agent) return c.json({ success: false, error: `Unknown agent: ${agentName}` }, 404);
  if (!(agent instanceof AssistantAgent)) {
    return c.json(
      {
        success: false,
        error: `Agent "${agentName}" does not support streaming. Use POST /api/query.`,
      },
      400,
    );
  }

  const context: AgentContext = {
    question,
    userId,
    sessionId,
    source: 'api',
    responseChannel: new HttpResponseChannel(),
    metadata: {},
  };

  return streamSSE(c, async (sse) => {
    const started = performance.now();
    let streamResult;
    try {
      streamResult = await runWithRequestContext(
        { userId, sessionId, source: 'api', agentName },
        () => agent.streamExecute(context),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown error';
      const err: WireEvent = { type: 'error', message: msg };
      await sse.writeSSE({ data: JSON.stringify(err) });
      return;
    }

    let textAccum = '';
    let inputTokens = 0;
    let outputTokens = 0;
    let finishReason = 'unknown';

    try {
      for await (const part of streamResult.fullStream as AsyncIterable<Record<string, unknown>>) {
        const wire = toWireEvent(part as Record<string, unknown> & { type: string });
        if (!wire) continue;
        if (wire.type === 'text') textAccum += wire.delta;
        if (wire.type === 'done') {
          inputTokens = wire.usage.inputTokens;
          outputTokens = wire.usage.outputTokens;
          finishReason = wire.finishReason;
        }
        await sse.writeSSE({ data: JSON.stringify(wire) });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'stream failure';
      const err: WireEvent = { type: 'error', message: msg };
      await sse.writeSSE({ data: JSON.stringify(err) });
      return;
    }

    // Record cost (userId comes from request context automatically).
    const durationMs = Math.round(performance.now() - started);
    try {
      await runWithRequestContext(
        { userId, sessionId, source: 'api', agentName },
        async () => {
          recordCost({
            timestamp: new Date().toISOString(),
            agent: agentName,
            model: streamResult.modelTier,
            inputTokens,
            outputTokens,
            durationMs,
          });
        },
      );
    } catch (e) {
      logger.warn('cost record failed for stream', {
        error: e instanceof Error ? e.message : String(e),
      });
    }

    // Note: textAccum, finishReason carried via the 'done' event already sent.
    void textAccum;
    void finishReason;
    void formatSSELine; // re-exported; referenced to silence unused import lint
  });
});
