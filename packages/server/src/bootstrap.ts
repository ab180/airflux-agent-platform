import { logger } from './lib/logger.js';
import { resolve } from 'path';
import {
  AgentRegistry,
  SkillRegistry,
  ToolRegistry,
  EchoAgent,
  AgentRouter,
  loadConfig,
  loadConfigOptional,
  setSettingsDir,
  normalizeKoreanTime,
  extractTimeExpressions,
  DomainGlossary,
  FeatureFlagService,
  SemanticLayer,
} from '@airflux/core';
import type { AgentConfig, AgentTool, SkillDefinition, RoutingConfig, GlossaryConfig, FeatureFlagsConfig, SemanticLayerConfig } from '@airflux/core';
import { z } from 'zod';

export async function bootstrap(settingsPath?: string): Promise<void> {
  const settingsDir = settingsPath || resolve(process.cwd(), '../../settings');
  setSettingsDir(settingsDir);

  logger.info("Loading settings", { settingsDir });

  // 1. Register built-in tools
  registerBuiltInTools();

  // 2. Load and register skills from YAML
  try {
    const skillsConfig = loadConfig<{ skills: Record<string, SkillDefinition> }>('skills');
    if (skillsConfig?.skills) {
      for (const [name, skill] of Object.entries(skillsConfig.skills)) {
        SkillRegistry.register({ ...skill, name });
      }
      logger.info("Skills loaded", { count: Object.keys(skillsConfig.skills).length });
    }
  } catch (e) {
    logger.warn('No skills config found, continuing with defaults');
  }

  // 3. Register agent factories
  AgentRegistry.registerFactory('echo-agent', (config, tools) => new EchoAgent(config, tools as Record<string, AgentTool>));

  // LLM-powered agents (lazy import to avoid loading AI SDK when not needed)
  const { AssistantAgent } = await import('./agents/assistant-agent.js');
  AgentRegistry.registerFactory('assistant-agent', (config, tools) => new AssistantAgent(config, tools as Record<string, AgentTool>));

  // Default factory: any agent not explicitly registered uses AssistantAgent
  AgentRegistry.setDefaultFactory((config, tools) => new AssistantAgent(config, tools as Record<string, AgentTool>));

  // 4. Load and initialize agents from YAML
  try {
    const agentConfigs = loadConfig<AgentConfig[]>('agents');
    await AgentRegistry.initialize(agentConfigs);
    const agents = AgentRegistry.list();
    logger.info("Agents initialized", { count: agents.length, names: agents.map(a => a.name) });
  } catch (e) {
    logger.warn('No agents config, using default echo agent');
    await AgentRegistry.initialize([
      {
        name: 'echo-agent',
        enabled: true,
        description: 'Echo agent for testing',
        model: 'default',
        skills: [],
        tools: [],
      },
    ]);
  }

  // 5. Load feature flags and apply to agents
  const flagsConfig = loadConfigOptional<FeatureFlagsConfig>('feature-flags', { flags: {} });
  _featureFlags = new FeatureFlagService(flagsConfig);
  const flagCount = _featureFlags.listFlags().length;
  logger.info("Feature flags loaded", { count: flagCount });

  // Apply feature flags to agents
  for (const agent of AgentRegistry.list()) {
    if (agent.config.featureFlag) {
      const isEnabled = _featureFlags.isEnabled(agent.config.featureFlag);
      if (!isEnabled) {
        agent.setEnabled(false);
        logger.info(`Agent disabled by feature flag`, { agent: agent.name, flag: agent.config.featureFlag });
      }
    }
  }

  // 6. Initialize router
  const routingConfig = loadConfigOptional<RoutingConfig>('routing-rules', {
    rules: [],
    fallback: 'echo-agent',
  });
  _router = new AgentRouter(routingConfig);
  logger.info("Router initialized", { rules: routingConfig.rules.length, fallback: routingConfig.fallback });

  // 7. Crash recovery: mark stale executions as timeout (GSD-2 pattern)
  try {
    const { recoverStaleExecutions } = await import('./store/execution-state.js');
    const recovered = recoverStaleExecutions(10);
    if (recovered > 0) {
      logger.warn("Recovered stale executions from previous crash", { count: recovered });
    }
  } catch {
    // execution_state table may not exist yet on first run
  }

  // 8. PostgreSQL initialization (if DATABASE_URL is set)
  try {
    const { isPostgresAvailable, initPgTables } = await import('./store/pg.js');
    if (isPostgresAvailable()) {
      await initPgTables();
      logger.info("PostgreSQL initialized (conversations, messages, cost_entries)");
    } else {
      logger.info("PostgreSQL not configured — using SQLite for legacy stores");
    }
  } catch (e) {
    logger.warn("PostgreSQL init failed, continuing with SQLite", {
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

let _router: AgentRouter | null = null;
let _featureFlags: FeatureFlagService | null = null;

export function getFeatureFlags(): FeatureFlagService {
  if (!_featureFlags) {
    _featureFlags = new FeatureFlagService({ flags: {} });
  }
  return _featureFlags;
}

export function getRouter(): AgentRouter {
  if (!_router) {
    // Lazy init with defaults if bootstrap hasn't run
    _router = new AgentRouter({ rules: [], fallback: 'echo-agent' });
  }
  return _router;
}

function registerBuiltInTools(): void {
  // Echo tool (for testing)
  ToolRegistry.register('echo', {
    description: 'Echoes back the input',
    inputSchema: z.object({ message: z.string() }),
    execute: async (input: unknown) => {
      const { message } = input as { message: string };
      return { echo: message };
    },
  });

  // Timestamp tool
  ToolRegistry.register('getTimestamp', {
    description: 'Returns current date and time in ISO format and Korean readable format',
    inputSchema: z.object({}),
    execute: async () => {
      const now = new Date();
      return {
        iso: now.toISOString(),
        korean: now.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
        unix: Math.floor(now.getTime() / 1000),
      };
    },
  });

  // Calculator tool - safe math evaluation
  ToolRegistry.register('calculate', {
    description: 'Evaluate a mathematical expression. Supports +, -, *, /, %, **, parentheses, and Math functions (sqrt, abs, round, ceil, floor, min, max, PI, E).',
    inputSchema: z.object({
      expression: z.string().describe('Math expression like "2 + 3 * 4" or "Math.sqrt(144)"'),
    }),
    execute: async (input: unknown) => {
      const { expression } = input as { expression: string };
      // Whitelist safe math operations only
      const sanitized = expression.replace(/[^0-9+\-*/%.() ,Matheqrsqtabceiloufndmxinp_PI]/g, '');
      if (sanitized !== expression) {
        return { error: 'Invalid characters in expression' };
      }
      try {
        // Safe eval using Function constructor with no globals access
        const fn = new Function('Math', `"use strict"; return (${expression})`);
        const result = fn(Math);
        if (typeof result !== 'number' || !isFinite(result)) {
          return { error: 'Expression did not produce a finite number' };
        }
        return { expression, result };
      } catch (e) {
        return { error: `Evaluation failed: ${e instanceof Error ? e.message : 'unknown'}` };
      }
    },
  });

  // JSON formatter tool
  ToolRegistry.register('formatJson', {
    description: 'Pretty-print or minify a JSON string. Validates JSON and returns formatted output.',
    inputSchema: z.object({
      json: z.string().describe('JSON string to format'),
      minify: z.boolean().optional().describe('If true, minify instead of pretty-print'),
    }),
    execute: async (input: unknown) => {
      const { json, minify } = input as { json: string; minify?: boolean };
      try {
        const parsed = JSON.parse(json);
        const formatted = minify
          ? JSON.stringify(parsed)
          : JSON.stringify(parsed, null, 2);
        return {
          formatted,
          valid: true,
          keys: typeof parsed === 'object' && parsed !== null ? Object.keys(parsed).length : 0,
        };
      } catch (e) {
        return { valid: false, error: `Invalid JSON: ${e instanceof Error ? e.message : 'unknown'}` };
      }
    },
  });

  // HTTP fetch tool (for retrieving data from URLs)
  ToolRegistry.register('httpGet', {
    description: 'Fetch data from a URL via HTTP GET. Returns status, headers, and body text (max 10KB).',
    inputSchema: z.object({
      url: z.string().url().describe('URL to fetch'),
      headers: z.record(z.string()).optional().describe('Optional request headers'),
    }),
    execute: async (input: unknown) => {
      const { url, headers } = input as { url: string; headers?: Record<string, string> };
      // Block internal/private/metadata URLs (SSRF protection)
      try {
        const parsed = new URL(url);
        const h = parsed.hostname.replace(/^\[|\]$/g, ''); // strip IPv6 brackets

        // Protocol check
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          return { error: 'Only HTTP/HTTPS URLs are allowed' };
        }

        // Check for private/internal hostnames
        const isPrivateHost =
          h === 'localhost' ||
          h === '0.0.0.0' ||
          h === '::1' ||
          h === '::ffff:127.0.0.1' ||
          h.startsWith('127.') ||
          h.startsWith('10.') ||
          h.startsWith('192.168.') ||
          h.startsWith('169.254.') ||       // AWS metadata / link-local
          (h.startsWith('172.') && (() => {  // 172.16-31.x (parenthesized for correct precedence)
            const second = parseInt(h.split('.')[1], 10);
            return second >= 16 && second <= 31;
          })()) ||
          h.startsWith('fc00:') || h.startsWith('fd') || // IPv6 ULA
          h.startsWith('fe80:') ||           // IPv6 link-local
          h.endsWith('.internal') ||
          h.endsWith('.local') ||
          h.endsWith('.localhost');

        if (isPrivateHost) {
          return { error: 'Internal URLs are not allowed' };
        }
      } catch {
        return { error: 'Invalid URL' };
      }

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);
        const res = await fetch(url, {
          headers: headers || {},
          signal: controller.signal,
          redirect: 'manual', // Don't follow redirects (SSRF prevention)
        });
        clearTimeout(timeout);

        const text = await res.text();
        return {
          status: res.status,
          contentType: res.headers.get('content-type') || 'unknown',
          body: text.slice(0, 10_000),
          truncated: text.length > 10_000,
        };
      } catch (e) {
        return { error: `Fetch failed: ${e instanceof Error ? e.message : 'unknown'}` };
      }
    },
  });

  // System info tool
  ToolRegistry.register('getSystemInfo', {
    description: 'Get information about the Airflux platform: registered agents, skills, tools count',
    inputSchema: z.object({}),
    execute: async () => {
      return {
        platform: 'Airflux Agent Platform',
        version: '0.1.0',
        phase: 'Phase 0 - Local Development',
        agents: AgentRegistry.list().map(a => ({
          name: a.name,
          enabled: a.isEnabled(),
        })),
        skills: SkillRegistry.list().map(s => s.name),
        tools: ToolRegistry.list(),
      };
    },
  });

  // Korean time expression normalizer
  ToolRegistry.register('normalizeTime', {
    description: '한국어 시간 표현을 날짜 범위로 변환 (오늘, 어제, 지난주, 최근 N일, 이번 달 등)',
    inputSchema: z.object({
      expression: z.string().describe('시간 표현 (예: "지난주", "최근 7일", "어제")'),
    }),
    execute: async (input: unknown) => {
      const { expression } = input as { expression: string };
      const result = normalizeKoreanTime(expression);
      if (!result) {
        return { error: `인식할 수 없는 시간 표현: "${expression}"` };
      }
      return result;
    },
  });

  // Extract all time expressions from text
  ToolRegistry.register('extractTimeFromQuery', {
    description: '쿼리에서 모든 한국어 시간 표현을 자동 추출하여 날짜 범위로 변환',
    inputSchema: z.object({
      query: z.string().describe('시간 표현이 포함된 질문'),
    }),
    execute: async (input: unknown) => {
      const { query } = input as { query: string };
      const ranges = extractTimeExpressions(query);
      return {
        found: ranges.length,
        ranges,
      };
    },
  });

  // Domain glossary tool
  const glossaryConfig = loadConfigOptional<GlossaryConfig>('domain-glossary', { terms: {} });
  const glossary = new DomainGlossary(glossaryConfig);

  ToolRegistry.register('lookupTerm', {
    description: '도메인 용어를 조회합니다. 약어, 한국어 표현을 표준 용어로 변환 (DAU, 리텐션, 전환율 등)',
    inputSchema: z.object({
      term: z.string().describe('조회할 용어 (예: "DAU", "리텐션", "전환율")'),
    }),
    execute: async (input: unknown) => {
      const { term } = input as { term: string };
      const resolved = glossary.resolve(term);
      if (!resolved) {
        return { found: false, term, suggestion: '도메인 용어 사전에 없는 용어입니다.' };
      }
      return { found: true, ...resolved };
    },
  });

  ToolRegistry.register('findTermsInQuery', {
    description: '쿼리에서 도메인 용어를 자동으로 찾아 표준 용어와 설명을 반환합니다',
    inputSchema: z.object({
      query: z.string().describe('분석할 질문'),
    }),
    execute: async (input: unknown) => {
      const { query } = input as { query: string };
      const terms = glossary.resolveAll(query);
      return { found: terms.length, terms };
    },
  });

  // Semantic layer tools
  const semanticConfig = loadConfigOptional<SemanticLayerConfig>('semantic-layer', {
    database: '', schema: '', tables: {}, metrics: {},
  });
  const semanticLayer = new SemanticLayer(semanticConfig);

  ToolRegistry.register('getSemanticLayer', {
    description: '데이터 웨어하우스의 테이블/메트릭 스키마를 조회합니다. SQL 생성에 필요한 컨텍스트를 제공합니다.',
    inputSchema: z.object({}),
    execute: async () => ({
      database: semanticConfig.database,
      schema: semanticConfig.schema,
      tables: semanticLayer.listTables(),
      metrics: semanticLayer.listMetrics(),
      context: semanticLayer.toPromptContext(),
    }),
  });

  ToolRegistry.register('getTableSchema', {
    description: '특정 테이블의 컬럼 정보를 조회합니다',
    inputSchema: z.object({
      table: z.string().describe('테이블 이름 (예: "events", "users", "apps")'),
    }),
    execute: async (input: unknown) => {
      const { table } = input as { table: string };
      const def = semanticLayer.getTable(table);
      if (!def) return { found: false, error: `테이블 "${table}" 없음. 사용 가능: ${semanticLayer.listTables().join(', ')}` };
      return { found: true, table, ...def };
    },
  });

  ToolRegistry.register('getMetricSQL', {
    description: '메트릭의 SQL 템플릿을 조회합니다 (DAU, MAU, revenue 등)',
    inputSchema: z.object({
      metric: z.string().describe('메트릭 이름 (예: "DAU", "MAU", "revenue")'),
    }),
    execute: async (input: unknown) => {
      const { metric } = input as { metric: string };
      const def = semanticLayer.getMetric(metric);
      if (!def) return { found: false, error: `메트릭 "${metric}" 없음. 사용 가능: ${semanticLayer.listMetrics().join(', ')}` };
      return { found: true, metric, ...def };
    },
  });

  logger.info("Tools registered", { count: ToolRegistry.list().length });
  logger.info("Domain glossary loaded", { terms: glossary.listTerms().length });
  logger.info("Semantic layer loaded", { tables: semanticLayer.listTables().length, metrics: semanticLayer.listMetrics().length });
}
