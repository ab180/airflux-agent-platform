import { Hono } from 'hono';
import { AgentRegistry } from '@airflux/core';
import { getLLMStatus } from '../llm/model-factory.js';
import { getEnvironment } from '../runtime/environment.js';

export const healthRoute = new Hono();

healthRoute.get('/health', (c) => {
  const agents = AgentRegistry.list();
  const llm = getLLMStatus();
  const env = getEnvironment();
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    // `mode` lets the dashboard show local-only affordances (e.g. the
    // "7d: 34% · 2일 14시간 뒤 초기화" reset chip on the rate-limit bars).
    mode: env.mode,
    agents: {
      total: agents.length,
      enabled: agents.filter((a) => a.isEnabled()).length,
    },
    llm: {
      available: llm.available,
      healthy: llm.healthy,
      source: llm.source,
      verified: llm.verified,
      expired: llm.expired,
      hoursExpired: llm.hoursExpired,
      hint: llm.hint,
      rateLimit: llm.rateLimit,
      oauthUtilizationThreshold: llm.oauthUtilizationThreshold,
      claudeUtilizationThreshold: llm.claudeUtilizationThreshold,
      codexUtilizationThreshold: llm.codexUtilizationThreshold,
      apiKeyFallbackAvailable: llm.apiKeyFallbackAvailable,
      codex: llm.codex,
      codexThrottle: llm.codexThrottle,
      claudeThrottle: llm.claudeThrottle,
    },
  });
});
