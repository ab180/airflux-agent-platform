import { Hono } from 'hono';
import { AgentRegistry } from '@airflux/core';
import { isLLMAvailable } from '../llm/model-factory.js';

export const healthRoute = new Hono();

healthRoute.get('/health', (c) => {
  const agents = AgentRegistry.list();
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    agents: {
      total: agents.length,
      enabled: agents.filter(a => a.isEnabled()).length,
    },
    llm: {
      available: isLLMAvailable(),
      hint: isLLMAvailable()
        ? undefined
        : 'Set ANTHROPIC_API_KEY env var, or run `claude login` for Claude Code credentials',
    },
  });
});
