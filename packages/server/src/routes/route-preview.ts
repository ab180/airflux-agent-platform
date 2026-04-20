/**
 * Routing preview endpoint — echoes what routeLLM() would pick for a
 * given prompt + agent, without actually calling an LLM. Surfaces the
 * decision in the dashboard so users can see why the platform is going
 * to pick Claude vs Codex, default vs powerful, low vs high effort.
 */

import { Hono } from 'hono';
import { AgentRegistry } from '@airflux/core';
import type { ModelTier } from '@airflux/core';
import { routeLLM, type ProviderAvailability } from '../llm/routing.js';
import { getLLMStatus } from '../llm/model-factory.js';

export const routePreviewRoute = new Hono();

function currentAvailability(): ProviderAvailability {
  const llm = getLLMStatus();
  // OAuth / creds branch is healthy when source involves claude-max-oauth and not expired.
  const claudeOAuth =
    llm.source.startsWith('claude-max-oauth') && !llm.expired && llm.healthy;
  const claudeApiKey = !!llm.apiKeyFallbackAvailable;
  const codexOAuth = !!(llm.codex && llm.codex.source === 'codex-chatgpt-oauth');
  const openaiApiKey = !!(llm.codex && llm.codex.source === 'openai-api-key');
  return { claudeOAuth, claudeApiKey, codexOAuth, openaiApiKey };
}

routePreviewRoute.post('/route/preview', async (c) => {
  let body: unknown;
  try { body = await c.req.json(); } catch {
    return c.json({ success: false, error: 'Invalid JSON' }, 400);
  }
  const b = body as Record<string, unknown>;
  const question = typeof b.question === 'string' ? b.question : '';
  if (!question.trim()) return c.json({ success: false, error: 'question required' }, 400);

  const agentName = typeof b.agent === 'string' ? b.agent : '';
  let agentModelTier: ModelTier = 'default';
  if (agentName) {
    const agent = AgentRegistry.getOptional(agentName);
    if (agent) {
      const m = (agent.config.model as string) || 'default';
      agentModelTier = (m === 'fast' || m === 'default' || m === 'powerful') ? m : 'default';
    }
  }

  const available = currentAvailability();
  const decision = routeLLM({ question, agentModelTier, available });

  return c.json({
    input: { question, agent: agentName || null, agentModelTier },
    available,
    decision,
  });
});
