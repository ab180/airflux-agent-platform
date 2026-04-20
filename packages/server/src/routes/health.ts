import { Hono } from 'hono';
import { AgentRegistry } from '@airflux/core';
import { getLLMStatus } from '../llm/model-factory.js';

export const healthRoute = new Hono();

healthRoute.get('/health', (c) => {
  const agents = AgentRegistry.list();
  const llm = getLLMStatus();
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
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
      apiKeyFallbackAvailable: llm.apiKeyFallbackAvailable,
    },
  });
});
