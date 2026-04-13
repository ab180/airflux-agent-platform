import { logger } from '../lib/logger.js';
import { Hono } from 'hono';
import { AgentRegistry, HttpResponseChannel, AirfluxError, runGuardrails, maskPii } from '@airflux/core';
import type { AgentContext } from '@airflux/core';
import { randomUUID } from 'crypto';
import { validateQueryBody } from '../middleware/validation.js';
import { insertLog } from '../store/log-store.js';
import { getOrCreateSession, appendToSession, getSessionHistory } from '../store/session-store.js';
import { getRouter } from '../bootstrap.js';
import { recordCost, checkBudget } from '../llm/cost-tracker.js';
import { startExecution, completeExecution, failExecution } from '../store/execution-state.js';

export const queryRoute = new Hono();

queryRoute.post('/query', async (c) => {
  const startTime = performance.now();
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: 'Invalid JSON body' }, 400);
  }

  const validation = validateQueryBody(body);
  if (!validation.ok) {
    return c.json({ success: false, error: validation.error }, 400);
  }
  const { data } = validation;

  // Debug mode: strip "debug:" prefix and enable diagnostics
  let debugMode = false;
  if (data.query.startsWith('debug:')) {
    debugMode = true;
    data.query = data.query.slice(6).trim();
  }

  const traceId = (c.get('requestId' as never) as string) || randomUUID();
  const sessionId = data.sessionId || randomUUID();
  const responseChannel = new HttpResponseChannel();
  const debugInfo: Record<string, unknown> = {};

  // Load or create session for conversation memory
  let sessionHistory = '';
  try {
    getOrCreateSession(sessionId, data.userId);
    sessionHistory = getSessionHistory(sessionId);
  } catch {
    // Session store not critical - continue without history
  }

  if (debugMode) {
    debugInfo.sessionHistoryLength = sessionHistory.length;
    debugInfo.sessionHistoryMessages = sessionHistory ? sessionHistory.split('\n').length : 0;
  }

  const context: AgentContext = {
    question: data.query,
    userId: data.userId,
    sessionId,
    source: 'api',
    responseChannel,
    sessionHistory: sessionHistory || undefined,
    metadata: data.metadata,
  };

  try {
    // Run input guardrails
    const guardrailStartTime = performance.now();
    const guardrailCheck = runGuardrails(
      ['prompt-injection', 'pii-filter'],
      { text: data.query, type: 'input' },
    );
    const guardrailDurationMs = Math.round(performance.now() - guardrailStartTime);

    if (debugMode) {
      debugInfo.guardrails = {
        durationMs: guardrailDurationMs,
        passed: guardrailCheck.pass,
        results: guardrailCheck.results.map(r => ({
          guardrail: r.guardrail,
          pass: r.pass,
          reason: r.reason,
        })),
      };
    }

    if (!guardrailCheck.pass) {
      const failed = guardrailCheck.results.find(r => !r.pass);
      const blockedReason = failed?.reason || 'Blocked';
      try {
        insertLog({ id: traceId, timestamp: new Date().toISOString(), agent: 'guardrail', query: data.query.slice(0, 200), userId: data.userId, source: 'api', success: false, responseText: null, errorMessage: `Guardrail blocked: ${blockedReason}`, durationMs: Math.round(performance.now() - startTime), inputTokens: null, outputTokens: null });
      } catch { /* non-critical */ }
      return c.json({
        success: false,
        error: `Guardrail blocked: ${blockedReason}`,
        guardrail: failed?.guardrail,
        traceId,
        ...(debugMode ? { debug: debugInfo } : {}),
      }, 400);
    }

    // Routing
    const routingStartTime = performance.now();
    let agentName: string;
    let matchedRule: string | null = null;
    if (data.agent) {
      agentName = data.agent;
    } else {
      const routed = getRouter().route(data.query);
      agentName = routed.agent;
      matchedRule = routed.matchedRule;
    }
    const routingDurationMs = Math.round(performance.now() - routingStartTime);

    if (debugMode) {
      debugInfo.routing = {
        durationMs: routingDurationMs,
        agent: agentName,
        matchedRule,
        explicitAgent: !!data.agent,
      };
    }

    // Budget check (GSD-2 budget enforcement pattern)
    const agentInstance = AgentRegistry.getOptional(agentName);
    const budgetError = checkBudget(agentInstance?.config.dailyBudget);
    if (budgetError) {
      return c.json({
        success: false,
        error: budgetError,
        traceId,
        ...(debugMode ? { debug: debugInfo } : {}),
      }, 429);
    }

    // Agent execution (GSD-2 state machine: track lifecycle)
    startExecution(traceId, agentName, data.query, data.userId, 'api');
    const agentStartTime = performance.now();
    const result = await AgentRegistry.execute(agentName, context);
    const agentDurationMs = Math.round(performance.now() - agentStartTime);
    const totalDurationMs = Math.round(performance.now() - startTime);

    if (result.success) {
      completeExecution(traceId, totalDurationMs);
    } else {
      failExecution(traceId, result.error || 'Unknown', totalDurationMs);
    }

    if (debugMode) {
      debugInfo.execution = {
        agentDurationMs,
        totalDurationMs,
        agent: agentName,
        tools: AgentRegistry.getOptional(agentName)?.getToolNames() || [],
      };
    }

    // Post-mask PII in response
    let piiMasked = false;
    if (result.text) {
      const masked = maskPii(result.text);
      if (masked.masked) {
        result.text = masked.text;
        piiMasked = true;
        if (debugMode) {
          debugInfo.piiMasking = {
            masked: true,
            count: masked.maskedCount,
            types: masked.types,
          };
        }
      }
    }

    await responseChannel.send(result);

    // Track cost (GSD-2 metrics ledger pattern)
    const usage = (result.metadata as Record<string, unknown>)?.usage as
      | { inputTokens?: number; outputTokens?: number }
      | undefined;

    if (usage?.inputTokens || usage?.outputTokens) {
      const modelTier = (result.metadata as Record<string, unknown>)?.model as string || 'default';
      recordCost({
        timestamp: new Date().toISOString(),
        agent: agentName,
        model: modelTier,
        inputTokens: usage.inputTokens || 0,
        outputTokens: usage.outputTokens || 0,
        durationMs: totalDurationMs,
      });
    }

    // Log the request
    try {
      insertLog({
        id: traceId,
        timestamp: new Date().toISOString(),
        agent: agentName,
        query: data.query,
        userId: data.userId,
        source: 'api',
        success: result.success,
        responseText: result.text?.slice(0, 500) || null,
        errorMessage: result.error || null,
        durationMs: totalDurationMs,
        inputTokens: usage?.inputTokens || null,
        outputTokens: usage?.outputTokens || null,
      });
    } catch {
      // Log write failure is non-critical
    }

    // Save to session for conversation memory
    if (result.success && result.text) {
      try {
        appendToSession(sessionId, data.query, result.text, agentName);
      } catch {
        // Not critical
      }
    }

    return c.json({
      success: result.success,
      agent: agentName,
      traceId,
      sessionId,
      routing: matchedRule ? { rule: matchedRule } : undefined,
      text: result.text,
      data: result.data,
      error: result.error,
      metadata: result.metadata,
      ...(debugMode ? { debug: debugInfo } : {}),
    });
  } catch (e) {
    const durationMs = Math.round(performance.now() - startTime);

    if (e instanceof AirfluxError) {
      return c.json({ success: false, error: e.message, code: e.code, traceId }, e.statusCode as 400);
    }
    logger.error('Query unexpected error', { error: e instanceof Error ? e.message : String(e) });
    return c.json({ success: false, error: 'Internal server error', traceId }, 500);
  }
});
