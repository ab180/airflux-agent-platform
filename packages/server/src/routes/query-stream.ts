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
import { isClaudeOAuthThrottled } from '../llm/claude-throttle.js';

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

  // Prompt-aware provider/tier routing. Availability-first: a provider
  // is "available" when (a) the credential is usable and (b) we haven't
  // observed a real throttle signal from it recently. A numeric utilization
  // threshold is an OPT-IN extra gate (env AIRFLUX_*_UTIL_THRESHOLD) for
  // users who want to steer away before the quota actually runs out.
  const llmStatus = getLLMStatus();
  const now = Date.now();
  const claudeThrottled = isClaudeOAuthThrottled(now);
  const codexThrottled = isCodexThrottled(now);

  // Optional utilization threshold gates (only active when user sets env).
  const fh = llmStatus.rateLimit?.fiveHour;
  const sd = llmStatus.rateLimit?.sevenDay;
  const claudeUtil = Math.max(fh?.utilization ?? 0, sd?.utilization ?? 0);
  const claudeThr = llmStatus.claudeUtilizationThreshold;
  const claudeCrossedOptThreshold =
    typeof claudeThr === 'number' && claudeUtil >= claudeThr;
  // Codex has no live utilization stream today (ChatGPT Codex backend
  // doesn't ship Anthropic-style headers). The optional threshold is
  // wired for symmetry — it won't fire until utilization tracking exists.
  const codexUtil = 0;
  const codexThr = llmStatus.codexUtilizationThreshold;
  const codexCrossedOptThreshold =
    typeof codexThr === 'number' && codexUtil >= codexThr;

  // Claude is usable via any of these credential sources. The model-factory
  // picks the best path at request time (credentials.json > env token >
  // API key on fallback). Previously this was restricted to OAuth only,
  // which caused the router to avoid Claude entirely when credentials.json
  // was missing (e.g. macOS Keychain not yet synced to the container) even
  // though an env token was available. Broadening here lets routing try
  // Claude; if the env token turns out stale, the request fails with a
  // clear error instead of silently steering every prompt to Codex.
  const claudeCredentialPresent =
    llmStatus.source === 'claude-max-oauth'
    || llmStatus.source === 'env:ANTHROPIC_AUTH_TOKEN'
    || llmStatus.source === 'env:ANTHROPIC_API_KEY'
    || llmStatus.source.startsWith('env:ANTHROPIC_API_KEY');
  const availability: ProviderAvailability = {
    claudeOAuth:
      claudeCredentialPresent
      && llmStatus.healthy
      && !claudeThrottled
      && !claudeCrossedOptThreshold,
    claudeApiKey: !!llmStatus.apiKeyFallbackAvailable,
    codexOAuth:
      !!(llmStatus.codex && llmStatus.codex.source === 'codex-chatgpt-oauth')
      && !codexThrottled
      && !codexCrossedOptThreshold,
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
