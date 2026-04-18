import { Hono } from 'hono';
import {
  AgentRegistry, SkillRegistry, ToolRegistry, loadConfigOptional, listGuardrails, getGuardrail,
  saveConfig, clearConfigCache,
} from '@airflux/core';
import type { SkillDefinition } from '@airflux/core';
import { queryLogs, getLogStats, getAgentStats, getDetailedMetrics } from '../store/log-store.js';
import { getGoldenDataset, addTestCase, getEvalRuns, seedDefaultTestCases } from '../store/eval-store.js';
import { queryFeedback, getFeedbackStats, getFeedbackDetail } from '../store/feedback-store.js';
import { getDbHealth, cleanupDb } from '../store/db-health.js';
import { refreshDailyStats, getDailyStats } from '../store/log-aggregator.js';
import { getFeatureFlags } from '../bootstrap.js';
import { isLLMAvailable, getLLMStatus, setApiKey, clearApiKeyCache } from '../llm/model-factory.js';
import { runEval } from '../eval/runner.js';
import { getCostByUser } from '../llm/cost-tracker.js';
import { getCostByUserPg, getCostEntriesForUserPg } from '../store/cost-store.js';
import { isPostgresAvailable } from '../store/pg.js';
import { getDailyCostStats } from '../llm/cost-tracker.js';
import { getSkillStats, getStalenessReport } from '../skills/skill-tracker.js';
import { getExecutionStats, getStaleExecutions } from '../store/execution-state.js';
import {
  getPromptVersions,
  getCurrentPrompt,
  createPromptVersion,
  rollbackPrompt,
  getPromptAgents,
} from '../store/prompt-store.js';

export const adminRoutes = new Hono();

/** Validate that a name parameter matches safe pattern (lowercase alphanum + dashes) */
const SAFE_NAME = /^[a-z][a-z0-9-]{0,49}$/;
function validateNameParam(name: string): boolean {
  return SAFE_NAME.test(name);
}

// ─── Overview stats ───────────────────────────────────────────────

adminRoutes.get('/overview', (c) => {
  const agents = AgentRegistry.list();
  const enabled = agents.filter(a => a.isEnabled());
  const skills = SkillRegistry.list();
  const tools = ToolRegistry.list();
  const stats = getLogStats();
  const agentStats = getAgentStats();
  const fbStats = getFeedbackStats();

  // Get latest eval score
  const recentRuns = getEvalRuns(1);
  const latestEvalScore = recentRuns.length > 0 ? recentRuns[0].score : null;

  // Merge per-agent request counts with registered agents
  const agentStatsMap = new Map(agentStats.map(a => [a.name, a.requestsToday]));

  return c.json({
    agents: {
      total: agents.length,
      enabled: enabled.length,
      list: enabled.map(a => ({
        name: a.name,
        requestsToday: agentStatsMap.get(a.name) || 0,
      })),
    },
    skills: { total: skills.length },
    tools: { total: tools.length },
    metrics: {
      requestsToday: stats.requestsToday,
      errorRate: stats.errorRate,
      costToday: getDailyCostStats().costUsd,
      evalScore: latestEvalScore,
      latency: { p50: 0, p95: stats.avgDurationMs, p99: 0 },
    },
    feedback: {
      total: fbStats.total,
      positiveRate: fbStats.positiveRate,
    },
    llm: {
      available: isLLMAvailable(),
      hint: isLLMAvailable()
        ? undefined
        : 'ANTHROPIC_API_KEY 환경변수를 설정하거나, `claude login`으로 로그인하세요',
    },
    alerts: [] as { type: string; message: string; time: string }[],
  });
});

// ─── Agent management ─────────────────────────────────────────────

/** Persist current agent list to settings/agents.yaml (skipped in test env) */
function persistAgents(): void {
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) return;
  const agents = AgentRegistry.list().map(a => ({
    name: a.name,
    enabled: a.isEnabled(),
    description: a.config.description || '',
    model: a.config.model,
    skills: a.config.skills || [],
    tools: a.getToolNames(),
    maxSteps: a.config.maxSteps,
    temperature: a.config.temperature,
    ...(a.config.advisor ? { advisor: a.config.advisor } : {}),
  }));
  saveConfig('agents', agents);
  clearConfigCache();
}

adminRoutes.get('/agents', (c) => {
  const agents = AgentRegistry.list().map(a => a.toJSON());
  return c.json({ agents });
});

adminRoutes.post('/agents', async (c) => {
  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ success: false, error: 'Invalid JSON' }, 400); }

  const b = body as Record<string, unknown>;
  if (typeof b.name !== 'string' || !/^[a-z][a-z0-9-]{0,49}$/.test(b.name)) {
    return c.json({ success: false, error: 'name must be a lowercase alphanumeric string with dashes' }, 400);
  }
  if (AgentRegistry.has(b.name)) {
    return c.json({ success: false, error: `Agent "${b.name}" already exists` }, 409);
  }

  // Validate model tier
  const validModels = ['fast', 'default', 'powerful'];
  const model = typeof b.model === 'string' ? b.model : 'default';
  if (!validModels.includes(model)) {
    return c.json({ success: false, error: `model must be one of: ${validModels.join(', ')}` }, 400);
  }

  // Validate tools exist
  const tools = Array.isArray(b.tools) ? b.tools as string[] : [];
  const registeredTools = ToolRegistry.list();
  const unknownTools = tools.filter(t => !registeredTools.includes(t));
  if (unknownTools.length > 0) {
    return c.json({ success: false, error: `Unknown tools: ${unknownTools.join(', ')}. Available: ${registeredTools.join(', ')}` }, 400);
  }

  // Validate maxSteps range
  const maxSteps = typeof b.maxSteps === 'number' ? b.maxSteps : 5;
  if (maxSteps < 1 || maxSteps > 20) {
    return c.json({ success: false, error: 'maxSteps must be between 1 and 20' }, 400);
  }

  // Parse advisor config
  const advisorInput = b.advisor as Record<string, unknown> | undefined;
  const advisor = advisorInput && typeof advisorInput.model === 'string' && validModels.includes(advisorInput.model)
    ? {
        model: advisorInput.model as 'fast' | 'default' | 'powerful',
        maxUses: typeof advisorInput.maxUses === 'number' ? Math.min(Math.max(advisorInput.maxUses, 1), 10) : 3,
        caching: advisorInput.caching === true,
      }
    : undefined;

  const config = {
    name: b.name,
    enabled: b.enabled !== false,
    description: typeof b.description === 'string' ? b.description.slice(0, 200) : '',
    model,
    skills: Array.isArray(b.skills) ? b.skills as string[] : [],
    tools,
    maxSteps,
    temperature: typeof b.temperature === 'number' ? Math.min(Math.max(b.temperature, 0), 2) : 0,
    advisor,
  };

  try {
    await AgentRegistry.initialize([config]);
    persistAgents();
    const agent = AgentRegistry.getOptional(config.name);
    return c.json({ success: true, agent: agent?.toJSON() }, 201);
  } catch (e) {
    return c.json({ success: false, error: e instanceof Error ? e.message : 'Failed to create agent' }, 500);
  }
});

adminRoutes.get('/agents/:name', (c) => {
  const name = c.req.param('name');
  const agent = AgentRegistry.getOptional(name);
  if (!agent) {
    return c.json({ success: false, error: `Agent not found: ${name}` }, 404);
  }
  return c.json({ agent: agent.toJSON() });
});

adminRoutes.post('/agents/:name/enable', (c) => {
  const name = c.req.param('name');
  const agent = AgentRegistry.getOptional(name);
  if (!agent) {
    return c.json({ success: false, error: `Agent not found: ${name}` }, 404);
  }
  agent.setEnabled(true);
  persistAgents();
  return c.json({ success: true, agent: agent.toJSON() });
});

adminRoutes.post('/agents/:name/disable', (c) => {
  const name = c.req.param('name');
  const agent = AgentRegistry.getOptional(name);
  if (!agent) {
    return c.json({ success: false, error: `Agent not found: ${name}` }, 404);
  }
  agent.setEnabled(false);
  persistAgents();
  return c.json({ success: true, agent: agent.toJSON() });
});

adminRoutes.put('/agents/:name', async (c) => {
  const name = c.req.param('name');
  if (!validateNameParam(name)) {
    return c.json({ success: false, error: 'Invalid agent name' }, 400);
  }
  const agent = AgentRegistry.getOptional(name);
  if (!agent) {
    return c.json({ success: false, error: `Agent not found: ${name}` }, 404);
  }

  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ success: false, error: 'Invalid JSON' }, 400); }

  const b = body as Record<string, unknown>;
  const validModels = ['fast', 'default', 'powerful'];

  // Update mutable fields on the config
  if (typeof b.description === 'string') agent.config.description = b.description.slice(0, 200);
  if (typeof b.model === 'string' && validModels.includes(b.model)) agent.config.model = b.model;
  if (typeof b.temperature === 'number') agent.config.temperature = Math.min(Math.max(b.temperature, 0), 2);
  if (typeof b.maxSteps === 'number') agent.config.maxSteps = Math.min(Math.max(b.maxSteps, 1), 20);
  if (b.enabled === true || b.enabled === false) agent.setEnabled(b.enabled);

  // Update advisor
  if (b.advisor === null) {
    agent.config.advisor = undefined;
  } else if (b.advisor && typeof (b.advisor as Record<string, unknown>).model === 'string') {
    const adv = b.advisor as Record<string, unknown>;
    if (validModels.includes(adv.model as string)) {
      agent.config.advisor = {
        model: adv.model as 'fast' | 'default' | 'powerful',
        maxUses: typeof adv.maxUses === 'number' ? Math.min(Math.max(adv.maxUses, 1), 10) : 3,
        caching: adv.caching === true,
      };
    }
  }

  persistAgents();
  return c.json({ success: true, agent: agent.toJSON() });
});

adminRoutes.delete('/agents/:name', (c) => {
  const name = c.req.param('name');
  const agent = AgentRegistry.getOptional(name);
  if (!agent) {
    return c.json({ success: false, error: `Agent not found: ${name}` }, 404);
  }
  AgentRegistry.remove(name);
  persistAgents();
  return c.json({ success: true, message: `Agent "${name}" deleted` });
});

// ─── Skill catalog ────────────────────────────────────────────────

adminRoutes.get('/skills', (c) => {
  const skills = SkillRegistry.list();

  // Enrich with usage info: which agents use each skill
  const agentConfigs = AgentRegistry.list().map(a => a.toJSON());
  const enriched = skills.map(skill => ({
    ...skill,
    usedBy: agentConfigs
      .filter(a => a.skills.includes(skill.name))
      .map(a => a.name),
  }));

  return c.json({ skills: enriched });
});

adminRoutes.get('/skills/stats', (c) => {
  return c.json({
    stats: getSkillStats(),
    stale: getStalenessReport(7),
  });
});

// ─── Tool list ────────────────────────────────────────────────────

adminRoutes.get('/tools', (c) => {
  const toolNames = ToolRegistry.list();
  const tools = toolNames.map(name => {
    const tool = ToolRegistry.getOptional(name);
    return {
      name,
      description: tool?.description || '',
      status: 'active' as const,
    };
  });
  return c.json({ tools });
});

adminRoutes.get('/tools/:name', (c) => {
  const name = c.req.param('name');
  const tool = ToolRegistry.getOptional(name);
  if (!tool) {
    return c.json({ success: false, error: `Tool not found: ${name}` }, 404);
  }
  return c.json({
    name,
    description: tool.description,
    status: 'active',
  });
});

adminRoutes.post('/tools/:name/test', async (c) => {
  const name = c.req.param('name');
  const tool = ToolRegistry.getOptional(name);
  if (!tool) {
    return c.json({ success: false, error: `Tool not found: ${name}` }, 404);
  }

  let input: unknown;
  try {
    input = await c.req.json();
  } catch {
    input = {};
  }

  try {
    const startTime = performance.now();
    const result = await tool.execute(input);
    const durationMs = Math.round(performance.now() - startTime);
    return c.json({ success: true, result, durationMs });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Tool execution failed';
    return c.json({ success: false, error: message }, 500);
  }
});

// ─── Schedules ────────────────────────────────────────────────────

adminRoutes.get('/schedules', (c) => {
  const agents = AgentRegistry.list().map(a => a.toJSON());
  const schedules = agents.flatMap(agent =>
    (agent.schedule || []).map((s, i) => ({
      id: `${agent.name}-${i}`,
      agentName: agent.name,
      ...s,
      enabled: true,
      lastRun: null,
      nextRun: null,
    }))
  );
  return c.json({ schedules });
});

// ─── Execution State (GSD-2 state machine) ──────────────────────

adminRoutes.get('/executions/stats', (c) => {
  return c.json(getExecutionStats());
});

adminRoutes.get('/executions/stale', (c) => {
  const maxAge = Math.min(Number(c.req.query('maxAgeMinutes')) || 10, 60);
  return c.json({ stale: getStaleExecutions(maxAge) });
});

// ─── Monitoring ───────────────────────────────────────────────────

adminRoutes.get('/monitoring/metrics', (c) => {
  return c.json(getDetailedMetrics());
});

// ─── Feedback ─────────────────────────────────────────────────────

adminRoutes.get('/feedback', (c) => {
  const limit = Math.min(Number(c.req.query('limit')) || 50, 500);
  const offset = Math.max(Number(c.req.query('offset')) || 0, 0);
  const agent = c.req.query('agent') || undefined;
  const rating = c.req.query('rating') || undefined;
  const startDate = c.req.query('startDate') || undefined;
  const endDate = c.req.query('endDate') || undefined;
  return c.json(queryFeedback({ limit, offset, agent, rating, startDate, endDate }));
});

adminRoutes.get('/feedback/:traceId', (c) => {
  const traceId = c.req.param('traceId');
  const detail = getFeedbackDetail(traceId);
  if (!detail) {
    return c.json({ success: false, error: 'Feedback not found for this traceId' }, 404);
  }
  return c.json({ success: true, feedback: detail });
});

// ─── Prompts ──────────────────────────────────────────────────────

adminRoutes.get('/prompts', (c) => {
  const agents = getPromptAgents();
  return c.json({ agents });
});

adminRoutes.get('/prompts/:agent', (c) => {
  const agent = c.req.param('agent');
  const versions = getPromptVersions(agent);
  const current = getCurrentPrompt(agent);
  return c.json({ agent, current, versions });
});

adminRoutes.post('/prompts/:agent', async (c) => {
  const agent = c.req.param('agent');
  if (!validateNameParam(agent)) {
    return c.json({ success: false, error: 'Invalid agent name' }, 400);
  }
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: 'Invalid JSON' }, 400);
  }

  const b = body as Record<string, unknown>;
  if (typeof b.version !== 'string' || !b.version.trim()) {
    return c.json({ success: false, error: 'version is required' }, 400);
  }
  if (typeof b.content !== 'string' || !b.content.trim()) {
    return c.json({ success: false, error: 'content is required' }, 400);
  }
  if (b.content.length > 50_000) {
    return c.json({ success: false, error: 'content exceeds 50KB limit' }, 400);
  }

  try {
    const prompt = createPromptVersion(
      agent,
      b.version.trim(),
      b.content.trim(),
      typeof b.description === 'string' ? b.description : '',
      b.setAsCurrent !== false,
    );
    return c.json({ success: true, prompt });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    if (msg.includes('UNIQUE constraint')) {
      return c.json({ success: false, error: `Version ${b.version} already exists for ${agent}` }, 409);
    }
    return c.json({ success: false, error: 'Failed to save prompt' }, 500);
  }
});

adminRoutes.post('/prompts/:agent/rollback', async (c) => {
  const agent = c.req.param('agent');
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: 'Invalid JSON' }, 400);
  }

  const b = body as Record<string, unknown>;
  if (typeof b.versionId !== 'number') {
    return c.json({ success: false, error: 'versionId (number) is required' }, 400);
  }

  const result = rollbackPrompt(agent, b.versionId);
  if (!result) {
    return c.json({ success: false, error: 'Version not found' }, 404);
  }

  return c.json({ success: true, prompt: result });
});

// ─── Guardrails ───────────────────────────────────────────────────

adminRoutes.get('/guardrails', (c) => {
  const names = listGuardrails();
  const guardrails = names.map(name => {
    const g = getGuardrail(name);
    return { name, description: g?.description || '' };
  });
  return c.json({ guardrails });
});

// ─── Evaluation ───────────────────────────────────────────────────

adminRoutes.get('/eval/dataset', (c) => {
  const agent = c.req.query('agent') || undefined;
  seedDefaultTestCases(); // Ensure defaults exist
  const dataset = getGoldenDataset(agent);
  return c.json({ dataset, total: dataset.length });
});

adminRoutes.post('/eval/dataset', async (c) => {
  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ success: false, error: 'Invalid JSON' }, 400); }

  const b = body as Record<string, unknown>;
  if (typeof b.agent !== 'string' || typeof b.question !== 'string') {
    return c.json({ success: false, error: 'agent and question are required' }, 400);
  }
  if (!validateNameParam(b.agent)) {
    return c.json({ success: false, error: 'Invalid agent name' }, 400);
  }
  if (b.question.length > 2000) {
    return c.json({ success: false, error: 'question exceeds 2000 character limit' }, 400);
  }

  const tc = addTestCase({
    agent: b.agent,
    category: typeof b.category === 'string' ? b.category : 'general',
    difficulty: ['easy', 'medium', 'hard'].includes(b.difficulty as string)
      ? (b.difficulty as 'easy' | 'medium' | 'hard')
      : 'easy',
    question: b.question,
    expectedAgent: typeof b.expectedAgent === 'string' ? b.expectedAgent : undefined,
    expectedContains: typeof b.expectedContains === 'string' ? b.expectedContains : undefined,
    rubric: typeof b.rubric === 'string' ? b.rubric : undefined,
  });

  return c.json({ success: true, testCase: tc });
});

adminRoutes.post('/eval/run', async (c) => {
  // Explicit opt-in for LLM judge on rubric-only cases. Default off because
  // judge hits the LLM per case (cost + latency). Manual runs that need
  // qualitative scoring pass ?useJudge=true.
  const useJudge = c.req.query('useJudge') === 'true';

  try {
    const run = await runEval({ useJudge });
    return c.json({ success: true, run });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return c.json({ success: false, error: msg }, 400);
  }
});

adminRoutes.get('/eval/runs', (c) => {
  const limit = Math.min(Number(c.req.query('limit')) || 10, 100);
  return c.json({ runs: getEvalRuns(limit) });
});

// ─── Logs ─────────────────────────────────────────────────────────

adminRoutes.get('/logs', (c) => {
  const limit = Math.min(Number(c.req.query('limit')) || 50, 500);
  const offset = Math.max(Number(c.req.query('offset')) || 0, 0);
  const agent = c.req.query('agent') || undefined;
  const successParam = c.req.query('success');
  const success = successParam === 'true' ? true : successParam === 'false' ? false : undefined;
  const startDate = c.req.query('startDate') || undefined;
  const endDate = c.req.query('endDate') || undefined;
  return c.json(queryLogs({ limit, offset, agent, success, startDate, endDate }));
});

// ─── Database Health ──────────────────────────────────────────────

adminRoutes.get('/db/health', (c) => {
  try {
    return c.json(getDbHealth());
  } catch (e) {
    return c.json({
      status: 'error',
      error: e instanceof Error ? e.message : 'Unknown',
    }, 500);
  }
});

adminRoutes.post('/db/cleanup', (c) => {
  try {
    const result = cleanupDb();
    return c.json({ success: true, ...result });
  } catch (e) {
    return c.json({
      success: false,
      error: e instanceof Error ? e.message : 'Cleanup failed',
    }, 500);
  }
});

// ─── Feature Flags ────────────────────────────────────────────────

adminRoutes.get('/flags', (c) => {
  const flags = getFeatureFlags().listFlags();
  return c.json({ flags });
});

adminRoutes.post('/flags/:name', async (c) => {
  const name = c.req.param('name');
  if (!validateNameParam(name)) {
    return c.json({ success: false, error: 'Invalid flag name' }, 400);
  }
  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ success: false, error: 'Invalid JSON' }, 400); }

  const b = body as Record<string, unknown>;
  if (typeof b.enabled !== 'boolean') {
    return c.json({ success: false, error: 'enabled (boolean) is required' }, 400);
  }

  getFeatureFlags().setFlag(name, b.enabled);

  // If this flag is linked to an agent, update the agent
  for (const agent of AgentRegistry.list()) {
    if (agent.config.featureFlag === name) {
      agent.setEnabled(b.enabled);
    }
  }

  return c.json({ success: true, flag: name, enabled: b.enabled });
});

// ─── Daily Stats Aggregation ──────────────────────────────────────

adminRoutes.post('/stats/refresh', (c) => {
  const result = refreshDailyStats();
  return c.json({ success: true, ...result });
});

adminRoutes.get('/stats/daily', (c) => {
  const days = Number(c.req.query('days')) || 7;
  return c.json({ stats: getDailyStats(days) });
});

// ─── Routing Rules ────────────────────────────────────────────────

adminRoutes.get('/routing', (c) => {
  const config = loadConfigOptional('routing-rules', { rules: [], fallback: 'echo-agent' });
  return c.json(config);
});

// ─── Semantic Layer ───────────────────────────────────────────────

adminRoutes.get('/schema', (c) => {
  const config = loadConfigOptional('semantic-layer', {
    database: '', schema: '', tables: {} as Record<string, { description: string; columns: { name: string }[] }>, metrics: {} as Record<string, { description: string }>,
  });
  return c.json({
    database: config.database,
    schema: config.schema,
    tables: Object.entries(config.tables || {}).map(([name, t]) => ({
      name,
      description: t.description,
      columnCount: (t.columns || []).length,
    })),
    metrics: Object.entries(config.metrics || {}).map(([name, m]) => ({
      name,
      description: m.description,
    })),
  });
});

// ─── Cost tracking (GSD-2 metrics ledger) ───────────────────────

adminRoutes.get('/cost', (c) => {
  const stats = getDailyCostStats();
  return c.json({
    today: stats,
    pricing: {
      fast: { input: 0.80, output: 4.00, unit: 'per 1M tokens' },
      default: { input: 3.00, output: 15.00, unit: 'per 1M tokens' },
      powerful: { input: 15.00, output: 75.00, unit: 'per 1M tokens' },
    },
  });
});

// Per-user cost breakdown. Prefers Postgres (longer history, persistent)
// and falls back to the in-memory tracker when DATABASE_URL is unset.
adminRoutes.get('/cost/by-user', async (c) => {
  const days = Math.min(Number(c.req.query('days')) || 7, 90);
  if (isPostgresAvailable()) {
    const users = await getCostByUserPg(days);
    return c.json({ source: 'postgres', days, users });
  }
  const users = getCostByUser();
  return c.json({ source: 'in-memory', days: 1, users });
});

adminRoutes.get('/cost/by-user/:userId', async (c) => {
  const userId = c.req.param('userId');
  if (!isPostgresAvailable()) {
    return c.json({
      source: 'in-memory',
      userId,
      entries: [],
      note: 'Per-entry history requires DATABASE_URL (Postgres). In-memory tracker only aggregates totals.',
    });
  }
  const limit = Math.min(Number(c.req.query('limit')) || 50, 500);
  const entries = await getCostEntriesForUserPg(userId, limit);
  return c.json({ source: 'postgres', userId, entries });
});

// ─── LLM Configuration ──────────────────────────────────────────

adminRoutes.get('/llm/status', (c) => {
  const status = getLLMStatus();
  return c.json({
    ...status,
    hint: status.available
      ? undefined
      : 'ANTHROPIC_API_KEY 환경변수를 설정하거나, `claude login`으로 로그인하세요',
  });
});

adminRoutes.post('/llm/key', async (c) => {
  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ success: false, error: 'Invalid JSON' }, 400); }

  const b = body as Record<string, unknown>;
  if (typeof b.apiKey !== 'string' || b.apiKey.trim().length < 10) {
    return c.json({ success: false, error: 'apiKey must be a string (min 10 chars)' }, 400);
  }

  setApiKey(b.apiKey.trim());
  const status = getLLMStatus();
  return c.json({ success: true, ...status });
});

adminRoutes.post('/llm/clear', (c) => {
  clearApiKeyCache();
  const status = getLLMStatus();
  return c.json({ success: true, ...status });
});
