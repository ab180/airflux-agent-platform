import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { AgentRegistry, HttpResponseChannel } from '@airflux/core';
import type { AgentContext, ModelTier } from '@airflux/core';
import { AssistantAgent } from '../agents/assistant-agent.js';
import { runWithRequestContext } from '../runtime/request-context.js';
import { resolveTrustedUserId } from '../security/trusted-user.js';
import { recordCost } from '../llm/cost-tracker.js';
import { toWireEvent, formatSSELine, type WireEvent } from '../streaming/stream-events.js';
import { logger } from '../lib/logger.js';
import { routeLLM, type ProviderAvailability } from '../llm/routing.js';
import { getLLMStatus } from '../llm/model-factory.js';
import { isCodexThrottled } from '../llm/codex-throttle.js';

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

  // Prompt-aware provider/tier routing. Looks at current Claude 5h/7d
  // utilization + Codex auth state to decide which provider serves this
  // request. Agent's configured provider/tier acts as a floor (Claude
  // quota is Claude-only; Codex quota is considered when the prompt
  // signals a coding task).
  const llmStatus = getLLMStatus();
  const fh = llmStatus.rateLimit?.fiveHour;
  const sd = llmStatus.rateLimit?.sevenDay;
  const claudeUtil = Math.max(fh?.utilization ?? 0, sd?.utilization ?? 0);
  const claudeThreshold = llmStatus.claudeUtilizationThreshold ?? 0.95;
  const claudeOAuthHealthy =
    llmStatus.source === 'claude-max-oauth' && llmStatus.healthy && claudeUtil < claudeThreshold;
  // Codex availability excludes throttled state — once we see 429 we
  // steer away until the cool-down window elapses.
  const codexThrottled = isCodexThrottled(Date.now());
  const availability: ProviderAvailability = {
    claudeOAuth: claudeOAuthHealthy,
    claudeApiKey: !!llmStatus.apiKeyFallbackAvailable,
    codexOAuth:
      !!(llmStatus.codex && llmStatus.codex.source === 'codex-chatgpt-oauth') &&
      !codexThrottled,
    openaiApiKey: !!(llmStatus.codex && llmStatus.codex.source === 'openai-api-key'),
  };
  const agentModelTier: ModelTier =
    ((agent.config.model as string) === 'fast' || (agent.config.model as string) === 'default' || (agent.config.model as string) === 'powerful'
      ? (agent.config.model as ModelTier)
      : 'default');
  const decision = routeLLM({ question, agentModelTier, available: availability });
  logger.info('routing decision', {
    agent: agentName,
    provider: decision.provider,
    tier: decision.tier,
    effort: decision.effort,
    signals: decision.signals,
    reason: decision.reason,
  });

  return streamSSE(c, async (sse) => {
    const started = performance.now();
    // Surface the routing decision to the client — chip in the UI.
    await sse.writeSSE({
      data: JSON.stringify({
        type: 'routing',
        provider: decision.provider,
        tier: decision.tier,
        effort: decision.effort,
        reason: decision.reason,
      }),
    });
    let streamResult;
    try {
      streamResult = await runWithRequestContext(
        { userId, sessionId, source: 'api', agentName },
        () =>
          agent.streamExecute(context, {
            provider: decision.provider === 'codex' ? 'openai' : 'claude',
            tier: decision.tier,
          }),
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
