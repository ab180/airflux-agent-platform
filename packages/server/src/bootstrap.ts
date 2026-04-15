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
  const settingsDir = settingsPath || process.env.SETTINGS_DIR || resolve(process.cwd(), '../../settings');
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
    logger.warn('No agents config, using default airflux agent');
    await AgentRegistry.initialize([
      {
        name: 'airflux-agent',
        enabled: true,
        description: 'Airflux AI Assistant',
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
  // ─── Airflux-specific tools ────────────────────────────────────

  // Data query tool — routes to optimal table based on cost tier
  ToolRegistry.register('queryData', {
    description: '데이터 카탈로그 기반 테이블 라우팅 + SQL 생성. 비용 티어(tens→billions) 자동 선택. 질문에 맞는 최적 테이블과 SQL을 제안합니다.',
    inputSchema: z.object({
      question: z.string().describe('데이터 관련 질문 (예: "앱 123의 DAU 추이")'),
      appId: z.string().optional().describe('앱 ID (billions 테이블 필요 시 필수)'),
      dateRange: z.string().optional().describe('날짜 범위 (예: "최근 7일", "2026-04-01~2026-04-07")'),
    }),
    execute: async (input: unknown) => {
      const { question, appId, dateRange } = input as { question: string; appId?: string; dateRange?: string };
      // Route to optimal table tier
      const needsBillions = /이벤트|event|client_events/i.test(question);
      const needsMillions = /API|inference|log/i.test(question);
      if ((needsBillions || needsMillions) && !appId) {
        return { error: '역질의 필요: billions/millions 테이블 사용을 위해 app_id를 지정해주세요.', suggestion: '예: "앱 123의 DAU 추이"' };
      }
      const tier = needsBillions ? 'billions' : needsMillions ? 'millions' : 'tens/hundreds';
      return {
        routing: { tier, requiresAppId: needsBillions || needsMillions, dateRange: dateRange || '미지정' },
        recommendation: `${tier} 테이블을 사용하여 "${question}" 분석을 수행합니다.`,
        note: 'Snowflake 연결 시 실제 SQL이 실행됩니다. 현재는 라우팅 결과만 반환합니다.',
      };
    },
  });

  // Document search tool
  ToolRegistry.register('searchDocs', {
    description: 'Airflux 설계 문서, 스키마 파일, CLAUDE.md를 검색합니다.',
    inputSchema: z.object({
      query: z.string().describe('검색 키워드 (예: "text-to-sql", "guardrail", "routing")'),
    }),
    execute: async (input: unknown) => {
      const { query } = input as { query: string };
      const { execSync } = await import('child_process');
      try {
        const results = execSync(
          `grep -rl "${query}" docs/design/ settings/ CLAUDE.md 2>/dev/null | head -10`,
          { encoding: 'utf-8', timeout: 5000, cwd: process.cwd() + '/../..' },
        ).trim();
        const files = results ? results.split('\n') : [];
        return { query, matchedFiles: files, count: files.length };
      } catch {
        return { query, matchedFiles: [], count: 0 };
      }
    },
  });

  // Agent/tool/skill info tool
  ToolRegistry.register('getAgentInfo', {
    description: '등록된 에이전트, 도구, 스킬의 현재 상태를 조회합니다.',
    inputSchema: z.object({}),
    execute: async () => ({
      agents: AgentRegistry.list().map(a => ({ name: a.name, enabled: a.isEnabled(), model: a.config.model, tools: a.getToolNames().length })),
      tools: ToolRegistry.list(),
      skills: SkillRegistry.list().map(s => ({ name: s.name, description: s.description })),
    }),
  });

  // Chart data generator
  ToolRegistry.register('generateChartData', {
    description: 'recharts 호환 차트 데이터를 생성합니다. 프론트엔드에서 바로 렌더링됩니다.',
    inputSchema: z.object({
      type: z.enum(['line', 'bar', 'pie']).describe('차트 유형'),
      title: z.string().optional().describe('차트 제목'),
      data: z.array(z.record(z.unknown())).describe('데이터 배열 (예: [{date: "4/1", value: 100}])'),
      xKey: z.string().describe('X축 키'),
      yKeys: z.array(z.string()).describe('Y축 키(들)'),
    }),
    execute: async (input: unknown) => {
      const { type, title, data, xKey, yKeys } = input as { type: string; title?: string; data: unknown[]; xKey: string; yKeys: string[] };
      return { type, title, data, xKey, yKeys };
    },
  });

  // ─── Tools from ab180/agent ──────────────────────────────────────

  // Chart rendering via QuickChart.io (from ab180/agent render_chart)
  ToolRegistry.register('renderChart', {
    description: 'QuickChart.io를 사용하여 차트 이미지 URL을 생성합니다. bar/line/pie/doughnut/radar 지원.',
    inputSchema: z.object({
      chartType: z.enum(['bar', 'line', 'pie', 'doughnut', 'area', 'radar']).describe('차트 유형'),
      title: z.string().describe('차트 제목'),
      labels: z.array(z.string()).describe('X축 라벨 (예: ["1월","2월","3월"])'),
      datasets: z.array(z.object({
        label: z.string(),
        data: z.array(z.number()),
      })).describe('데이터셋 (예: [{"label":"MAU","data":[100,200,300]}])'),
      width: z.number().optional().describe('이미지 너비 (기본 600)'),
      height: z.number().optional().describe('이미지 높이 (기본 400)'),
    }),
    execute: async (input: unknown) => {
      const { chartType, title, labels, datasets, width = 600, height = 400 } = input as {
        chartType: string; title: string; labels: string[]; datasets: { label: string; data: number[] }[];
        width?: number; height?: number;
      };
      const colors = ['#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6', '#ec4899'];
      const config = {
        type: chartType === 'area' ? 'line' : chartType,
        data: {
          labels,
          datasets: datasets.map((ds, i) => ({
            ...ds,
            backgroundColor: chartType === 'pie' || chartType === 'doughnut' ? colors : colors[i % colors.length] + '80',
            borderColor: colors[i % colors.length],
            fill: chartType === 'area',
          })),
        },
        options: {
          title: { display: true, text: title },
          plugins: { legend: { display: datasets.length > 1 } },
        },
      };
      const chartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(config))}&w=${width}&h=${height}&bkg=%230a0a0f`;
      return { chartUrl, title, chartType, dataPoints: labels.length };
    },
  });

  // File operations (from ab180/agent read_file, write_file, list_files)
  ToolRegistry.register('readFile', {
    description: '프로젝트 내 파일을 읽습니다. 설정 파일, 스키마, 문서 등을 확인할 때 사용합니다.',
    inputSchema: z.object({
      path: z.string().describe('파일 경로 (프로젝트 루트 기준, 예: "settings/agents.yaml")'),
      maxLines: z.number().optional().describe('최대 읽을 줄 수 (기본 200)'),
    }),
    execute: async (input: unknown) => {
      const { path: filePath, maxLines = 200 } = input as { path: string; maxLines?: number };
      const { readFileSync, realpathSync } = await import('fs');
      const { resolve, relative, isAbsolute } = await import('path');
      const projectRoot = resolve(process.cwd(), '../..');
      const fullPath = resolve(projectRoot, filePath);
      const rel = relative(projectRoot, fullPath);
      if (rel.startsWith('..') || isAbsolute(rel)) return { error: 'Path traversal blocked' };
      try {
        // Resolve symlinks and re-check
        const realPath = realpathSync(fullPath);
        const relReal = relative(projectRoot, realPath);
        if (relReal.startsWith('..') || isAbsolute(relReal)) return { error: 'Path traversal blocked' };
        const content = readFileSync(realPath, 'utf-8');
        const lines = content.split('\n').slice(0, maxLines);
        return { path: filePath, lines: lines.length, content: lines.join('\n') };
      } catch (e) {
        return { error: `File not found: ${filePath}` };
      }
    },
  });

  ToolRegistry.register('listFiles', {
    description: '디렉토리 내 파일 목록을 조회합니다.',
    inputSchema: z.object({
      path: z.string().optional().describe('디렉토리 경로 (기본: 프로젝트 루트)'),
    }),
    execute: async (input: unknown) => {
      const { path: dirPath = '.' } = input as { path?: string };
      const { readdirSync, statSync } = await import('fs');
      const { resolve, relative, isAbsolute } = await import('path');
      const projectRoot = resolve(process.cwd(), '../..');
      const fullPath = resolve(projectRoot, dirPath);
      const rel = relative(projectRoot, fullPath);
      if (rel.startsWith('..') || isAbsolute(rel)) return { error: 'Path traversal blocked' };
      try {
        const entries = readdirSync(fullPath).map(name => {
          try {
            const stat = statSync(resolve(fullPath, name));
            return { name, type: stat.isDirectory() ? 'dir' : 'file', size: stat.size };
          } catch { return { name, type: 'unknown', size: 0 }; }
        });
        return { path: dirPath, entries };
      } catch {
        return { error: `Directory not found: ${dirPath}` };
      }
    },
  });

  // Confirm action (from ab180/agent confirm_action)
  ToolRegistry.register('confirmAction', {
    description: '위험한 작업 실행 전 확인을 요청합니다. 데이터 삭제, 대량 쿼리 등에 사용.',
    inputSchema: z.object({
      action: z.string().describe('실행하려는 작업 설명'),
      risk: z.enum(['low', 'medium', 'high']).describe('위험 수준'),
      details: z.string().optional().describe('추가 상세'),
    }),
    execute: async (input: unknown) => {
      const { action, risk, details } = input as { action: string; risk: string; details?: string };
      return {
        confirmation_required: true,
        action,
        risk,
        details,
        message: `⚠️ ${risk.toUpperCase()} 위험 작업: ${action}. 계속하시겠습니까?`,
      };
    },
  });

  // Schedule management (from ab180/agent create/list/delete_schedule)
  ToolRegistry.register('manageSchedule', {
    description: '에이전트 자동 실행 스케줄을 관리합니다 (생성/목록/삭제).',
    inputSchema: z.object({
      action: z.enum(['create', 'list', 'delete']).describe('작업 유형'),
      name: z.string().optional().describe('스케줄 이름 (create/delete 시)'),
      cron: z.string().optional().describe('Cron 표현식 (create 시, 예: "0 9 * * *")'),
      question: z.string().optional().describe('실행할 질문 (create 시)'),
    }),
    execute: async (input: unknown) => {
      const { action, name, cron, question } = input as {
        action: string; name?: string; cron?: string; question?: string;
      };
      if (action === 'list') {
        return { schedules: [], note: '스케줄 기능은 cron-reports.yaml 설정으로 관리됩니다.' };
      }
      if (action === 'create') {
        return { created: false, note: `스케줄 "${name}" (${cron}): settings/cron-reports.yaml에 추가해주세요.`, example: { name, cron, question }, schema: '{ name, cron, query, enabled, format, channel }' };
      }
      return { action, note: '스케줄 관리는 settings/cron-reports.yaml을 통해 수행됩니다.' };
    },
  });

  // Web search (simplified version, uses httpGet internally)
  ToolRegistry.register('webSearch', {
    description: '웹 검색을 수행합니다. 외부 정보가 필요할 때 사용합니다.',
    inputSchema: z.object({
      query: z.string().describe('검색 쿼리'),
    }),
    execute: async (input: unknown) => {
      const { query } = input as { query: string };
      return {
        note: '직접 웹 검색은 현재 지원되지 않습니다. httpGet으로 특정 URL을 조회하거나, searchDocs로 내부 문서를 검색하세요.',
        suggestion: `httpGet 도구로 관련 문서 URL을 직접 조회해보세요.`,
        query,
      };
    },
  });

  // ─── External service tools (graceful when unconfigured) ────────

  // GitHub code search
  ToolRegistry.register('searchGitHub', {
    description: 'GitHub 코드/파일 검색. GITHUB_TOKEN 환경변수 설정 시 동작.',
    inputSchema: z.object({
      query: z.string().describe('검색 쿼리 (예: "function handleQuery lang:typescript")'),
      repo: z.string().optional().describe('레포 제한 (예: "ab180/airflux-agent-platform")'),
    }),
    execute: async (input: unknown) => {
      const { query, repo } = input as { query: string; repo?: string };
      const token = process.env.GITHUB_TOKEN;
      if (!token) return { error: 'GITHUB_TOKEN 환경변수가 설정되지 않았습니다. GitHub 검색을 사용하려면 설정해주세요.' };
      const q = repo ? `${query} repo:${repo}` : query;
      try {
        const res = await fetch(`https://api.github.com/search/code?q=${encodeURIComponent(q)}&per_page=10`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
        });
        if (!res.ok) return { error: `GitHub API ${res.status}` };
        const data = await res.json() as { total_count: number; items: { name: string; path: string; repository: { full_name: string }; html_url: string }[] };
        return { totalCount: data.total_count, results: data.items.map(i => ({ file: i.path, repo: i.repository.full_name, url: i.html_url })) };
      } catch (e) { return { error: e instanceof Error ? e.message : 'GitHub search failed' }; }
    },
  });

  // Bash command execution (sandboxed)
  ToolRegistry.register('runCommand', {
    description: '안전한 쉘 명령을 실행합니다. 읽기 전용 명령만 허용 (ls, cat, grep, wc, head, tail, find, jq, curl).',
    inputSchema: z.object({
      command: z.string().describe('실행할 명령 (예: "ls -la settings/", "wc -l packages/server/src/**/*.ts")'),
    }),
    execute: async (input: unknown) => {
      const { command } = input as { command: string };
      const allowedPrefixes = ['ls', 'cat', 'grep', 'wc', 'head', 'tail', 'find', 'jq', 'echo', 'date', 'pwd'];
      const firstWord = command.trim().split(/\s/)[0];
      if (!allowedPrefixes.includes(firstWord)) {
        return { error: `명령 "${firstWord}"은 허용되지 않습니다. 허용: ${allowedPrefixes.join(', ')}` };
      }
      if (/[;&|`$]/.test(command)) {
        return { error: '파이프, 체인, 변수 대입은 보안상 차단됩니다.' };
      }
      const { execSync } = await import('child_process');
      try {
        const { resolve } = await import('path');
        const output = execSync(command, { encoding: 'utf-8', timeout: 10_000, cwd: resolve(process.cwd(), '../..'), maxBuffer: 512 * 1024 });
        return { command, output: output.slice(0, 5000), truncated: output.length > 5000 };
      } catch (e) { return { error: e instanceof Error ? e.message.slice(0, 500) : 'Command failed' }; }
    },
  });

  // Jira search (via Atlassian API or MCP)
  ToolRegistry.register('searchJira', {
    description: 'Jira 이슈를 검색합니다. JIRA_API_TOKEN + JIRA_BASE_URL 환경변수 필요.',
    inputSchema: z.object({
      jql: z.string().describe('JQL 쿼리 (예: "project = AIRFLUX AND status = Open")'),
      maxResults: z.number().optional().describe('최대 결과 수 (기본 10)'),
    }),
    execute: async (input: unknown) => {
      const { jql, maxResults = 10 } = input as { jql: string; maxResults?: number };
      const token = process.env.JIRA_API_TOKEN;
      const baseUrl = process.env.JIRA_BASE_URL;
      if (!token || !baseUrl) return { error: 'JIRA_API_TOKEN 및 JIRA_BASE_URL 환경변수가 필요합니다.' };
      try {
        const res = await fetch(`${baseUrl}/rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=${maxResults}`, {
          headers: { Authorization: `Basic ${Buffer.from(`email:${token}`).toString('base64')}`, Accept: 'application/json' },
        });
        if (!res.ok) return { error: `Jira API ${res.status}` };
        const data = await res.json() as { total: number; issues: { key: string; fields: { summary: string; status: { name: string } } }[] };
        return { total: data.total, issues: data.issues.map(i => ({ key: i.key, summary: i.fields.summary, status: i.fields.status.name })) };
      } catch (e) { return { error: e instanceof Error ? e.message : 'Jira search failed' }; }
    },
  });

  // Linear issue search
  ToolRegistry.register('searchLinear', {
    description: 'Linear 이슈를 검색합니다. LINEAR_API_KEY 환경변수 필요.',
    inputSchema: z.object({
      query: z.string().describe('검색 키워드'),
    }),
    execute: async (input: unknown) => {
      const { query } = input as { query: string };
      const apiKey = process.env.LINEAR_API_KEY;
      if (!apiKey) return { error: 'LINEAR_API_KEY 환경변수가 필요합니다.' };
      try {
        const res = await fetch('https://api.linear.app/graphql', {
          method: 'POST',
          headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: `{ issueSearch(query: "${query}", first: 10) { nodes { identifier title state { name } url } } }` }),
        });
        const data = await res.json() as { data?: { issueSearch?: { nodes: { identifier: string; title: string; state: { name: string }; url: string }[] } } };
        const issues = data.data?.issueSearch?.nodes || [];
        return { count: issues.length, issues: issues.map(i => ({ id: i.identifier, title: i.title, status: i.state.name, url: i.url })) };
      } catch (e) { return { error: e instanceof Error ? e.message : 'Linear search failed' }; }
    },
  });

  // Slack message search
  ToolRegistry.register('searchSlack', {
    description: 'Slack 메시지를 검색합니다. SLACK_BOT_TOKEN 환경변수 필요.',
    inputSchema: z.object({
      query: z.string().describe('검색 키워드'),
      channel: z.string().optional().describe('채널 ID (특정 채널 한정)'),
    }),
    execute: async (input: unknown) => {
      const { query, channel } = input as { query: string; channel?: string };
      const token = process.env.SLACK_BOT_TOKEN;
      if (!token) return { error: 'SLACK_BOT_TOKEN 환경변수가 필요합니다.' };
      const q = channel ? `${query} in:<#${channel}>` : query;
      try {
        const res = await fetch(`https://slack.com/api/search.messages?query=${encodeURIComponent(q)}&count=10`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json() as { ok: boolean; messages?: { matches: { text: string; channel: { name: string }; ts: string; permalink: string }[] } };
        if (!data.ok) return { error: 'Slack API error' };
        return { count: data.messages?.matches?.length || 0, messages: (data.messages?.matches || []).map(m => ({ text: m.text.slice(0, 200), channel: m.channel.name, url: m.permalink })) };
      } catch (e) { return { error: e instanceof Error ? e.message : 'Slack search failed' }; }
    },
  });

  // Git operations (read-only)
  ToolRegistry.register('gitInfo', {
    description: 'Git 저장소 정보를 조회합니다 (status, log, diff). 읽기 전용.',
    inputSchema: z.object({
      action: z.enum(['status', 'log', 'diff', 'branch']).describe('Git 명령'),
      args: z.string().optional().describe('추가 인자 (예: log의 경우 "--oneline -10")'),
    }),
    execute: async (input: unknown) => {
      const { action, args = '' } = input as { action: string; args?: string };
      const { spawnSync } = await import('child_process');
      const { resolve } = await import('path');
      // Reject shell metacharacters in args to prevent injection
      if (args && /[;&|`$"'<>\\{}()!]/.test(args)) {
        return { error: '허용되지 않는 인자 문자입니다.' };
      }
      const safeArgs = args.trim() ? args.trim().split(/\s+/).filter(Boolean) : [];
      const gitCmds: Record<string, string[]> = {
        status: ['status', '--short'],
        log: ['log', '--oneline', ...(safeArgs.length ? safeArgs : ['-10'])],
        diff: ['diff', '--stat', ...safeArgs],
        branch: ['branch', '-a'],
      };
      const gitArgs = gitCmds[action];
      if (!gitArgs) return { error: 'Unknown git action' };
      try {
        const result = spawnSync('git', gitArgs, { encoding: 'utf-8', timeout: 5000, cwd: resolve(process.cwd(), '../..') });
        if (result.error) return { error: result.error.message.slice(0, 200) };
        return { action, output: ((result.stdout || '') + (result.stderr || '')).slice(0, 3000) };
      } catch (e) { return { error: e instanceof Error ? e.message.slice(0, 200) : 'Git command failed' }; }
    },
  });

  // ─── Creative & productivity tools ──────────────────────────────

  // AI image generation
  ToolRegistry.register('generateImage', {
    description: 'AI로 이미지를 생성합니다. 텍스트 프롬프트로 새 이미지를 만들거나, URL의 이미지를 수정합니다.',
    inputSchema: z.object({
      prompt: z.string().describe('이미지 설명 (예: "A dashboard showing DAU metrics, modern design")'),
      aspectRatio: z.enum(['1:1', '16:9', '9:16', '4:3']).optional().describe('비율 (기본 1:1)'),
    }),
    execute: async (input: unknown) => {
      const { prompt, aspectRatio = '1:1' } = input as { prompt: string; aspectRatio?: string };
      return {
        note: '이미지 생성 API(OpenAI DALL-E, Gemini 등) 연결 시 동작합니다.',
        prompt,
        aspectRatio,
        alternative: 'renderChart 도구로 데이터 차트를 생성하거나, httpGet으로 외부 이미지를 가져올 수 있습니다.',
      };
    },
  });

  // Write file
  ToolRegistry.register('writeFile', {
    description: '프로젝트 내 파일을 작성/수정합니다. settings/ 디렉토리만 허용.',
    inputSchema: z.object({
      path: z.string().describe('파일 경로 (settings/ 하위만, 예: "settings/agents.yaml")'),
      content: z.string().describe('파일 내용'),
    }),
    execute: async (input: unknown) => {
      const { path: filePath, content } = input as { path: string; content: string };
      if (!filePath.startsWith('settings/')) return { error: 'settings/ 디렉토리만 쓰기가 허용됩니다.' };
      const { writeFileSync } = await import('fs');
      const { resolve, relative, isAbsolute } = await import('path');
      const projectRoot = resolve(process.cwd(), '../..');
      const fullPath = resolve(projectRoot, filePath);
      const rel = relative(projectRoot, fullPath);
      if (rel.startsWith('..') || isAbsolute(rel)) return { error: 'Path traversal blocked' };
      try {
        writeFileSync(fullPath, content, 'utf-8');
        return { path: filePath, written: true, bytes: content.length };
      } catch (e) { return { error: e instanceof Error ? e.message : 'Write failed' }; }
    },
  });

  // Workspace info
  ToolRegistry.register('getWorkspace', {
    description: '현재 작업 디렉토리 및 프로젝트 구조 정보를 반환합니다.',
    inputSchema: z.object({}),
    execute: async () => {
      const { resolve } = await import('path');
      const { readdirSync } = await import('fs');
      const root = resolve(process.cwd(), '../..');
      const topLevel = readdirSync(root).filter(f => !f.startsWith('.') && f !== 'node_modules');
      return { root, topLevel, packages: ['core', 'server'], apps: ['dashboard'], settings: readdirSync(resolve(root, 'settings')).filter(f => f.endsWith('.yaml') || f.endsWith('.md')) };
    },
  });

  // Google Calendar (read-only)
  ToolRegistry.register('calendarEvents', {
    description: 'Google Calendar 이벤트를 조회합니다. 구글 캘린더 MCP 연결 시 동작.',
    inputSchema: z.object({
      date: z.string().optional().describe('날짜 (예: "2026-04-14", 기본: 오늘)'),
    }),
    execute: async (input: unknown) => {
      const { date } = input as { date?: string };
      return { note: 'Google Calendar MCP 서버 연결 시 동작합니다. mcp__google-calendar__list-events 도구를 직접 사용하세요.', date: date || 'today' };
    },
  });

  // Create PR
  ToolRegistry.register('createPR', {
    description: 'GitHub Pull Request를 생성합니다. GITHUB_TOKEN 환경변수 필요.',
    inputSchema: z.object({
      title: z.string().describe('PR 제목'),
      body: z.string().describe('PR 설명'),
      head: z.string().describe('소스 브랜치'),
      base: z.string().optional().describe('타겟 브랜치 (기본: main)'),
      repo: z.string().optional().describe('레포 (기본: ab180/airflux-agent-platform)'),
    }),
    execute: async (input: unknown) => {
      const { title, body, head, base = 'main', repo = 'ab180/airflux-agent-platform' } = input as { title: string; body: string; head: string; base?: string; repo?: string };
      const token = process.env.GITHUB_TOKEN;
      if (!token) return { error: 'GITHUB_TOKEN 환경변수가 필요합니다.' };
      try {
        const res = await fetch(`https://api.github.com/repos/${repo}/pulls`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, body, head, base }),
        });
        if (!res.ok) return { error: `GitHub API ${res.status}: ${await res.text()}` };
        const pr = await res.json() as { number: number; html_url: string };
        return { created: true, number: pr.number, url: pr.html_url };
      } catch (e) { return { error: e instanceof Error ? e.message : 'PR creation failed' }; }
    },
  });

  // ─── Utility tools ──────────────────────────────────────────────

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
