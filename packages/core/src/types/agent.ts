import type { z } from 'zod';

export type AgentSource = 'slack' | 'api' | 'cron' | 'webhook' | 'mcp';

export interface AgentContext {
  question: string;
  userId: string;
  sessionId: string;
  source: AgentSource;
  responseChannel: ResponseChannel;
  sessionHistory?: string;
  metadata: Record<string, unknown>;
}

export interface ResponseChannel {
  type: string;
  send(result: AgentResult): Promise<void>;
}

export interface AgentResult {
  success: boolean;
  data?: unknown;
  text?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentTool {
  description: string;
  inputSchema: z.ZodType;
  outputSchema?: z.ZodType;
  execute: (input: unknown) => Promise<unknown>;
}

export interface SkillDefinition {
  name: string;
  description: string;
  requiredTools: string[];
  guardrails: string[];
}

/**
 * Agent autonomy level (inspired by Codex CLI's 3-tier model):
 * - suggest: Agent proposes actions, user must approve before execution
 * - auto-read: Agent can read/query freely, write actions need approval
 * - full-auto: Agent executes everything autonomously (for scheduled/cron tasks)
 */
export type AgentAutonomy = 'suggest' | 'auto-read' | 'full-auto';

export interface AgentConfig {
  name: string;
  enabled: boolean;
  description?: string;
  model: string;
  fallbackModel?: string;
  promptVersion?: string;
  skills: string[];
  tools: string[];
  maxSteps?: number;
  temperature?: number;
  costLimitPerRequest?: number;
  dailyBudget?: number;
  sources?: AgentSource[];
  schedule?: ScheduleConfig[];
  featureFlag?: string;
  autonomy?: AgentAutonomy;
  /** Post-execution verification commands (GSD-2 verification gate pattern) */
  verificationCommands?: string[];
  /** Max auto-fix retries on verification failure (default 0 = no retry) */
  verificationMaxRetries?: number;
  /** Advisor model configuration (Claude Advisor tool pattern) */
  advisor?: AdvisorConfig;
  /** MCP servers this agent can connect to (ab180/agent pattern) */
  mcpServers?: MCPServerConfig[];
  /** Subagents this agent can delegate to (Agent-as-Tool pattern) */
  subagents?: SubagentConfig[];
}

/**
 * MCP server configuration for connecting to external data sources.
 * Supports HTTP (SSE) and stdio transports.
 */
export interface MCPServerConfig {
  /** Unique name for this MCP server */
  name: string;
  /** Transport type */
  transport: 'http' | 'stdio';
  /** URL for HTTP transport */
  url?: string;
  /** Command + args for stdio transport (e.g. ["npx", "@discourse/mcp"]) */
  command?: string[];
  /** Auth headers for HTTP transport */
  headers?: Record<string, string>;
  /** Environment variables for stdio transport */
  env?: Record<string, string>;
}

/**
 * Subagent configuration — Agent-as-Tool pattern from ab180/agent.
 * Main agent delegates domain-specific tasks to specialized subagents.
 */
export interface SubagentConfig {
  /** Subagent name (used as tool name) */
  name: string;
  /** Description shown to the main agent */
  description: string;
  /** System prompt for the subagent */
  prompt: string;
  /** Model tier for the subagent (typically cheaper than main) */
  model: ModelTier;
  /** Subset of tools the subagent can use */
  tools: string[];
  /** Max execution steps */
  maxSteps?: number;
}

/**
 * Advisor configuration — pairs a cheaper executor with a smarter advisor model.
 * The advisor provides strategic guidance while the executor handles bulk generation.
 */
export interface AdvisorConfig {
  /** Advisor model tier (must be >= executor tier). Default: 'powerful' */
  model: ModelTier;
  /** Max advisor calls per request. Default: 3 */
  maxUses?: number;
  /** Enable prompt caching for advisor (saves cost on 3+ calls). Default: false */
  caching?: boolean;
}

export interface ScheduleConfig {
  name: string;
  cron: string;
  question: string;
  channels: string[];
  enabled?: boolean;
}

export type ModelTier = 'fast' | 'default' | 'powerful';

export interface LLMProvider {
  getModel(tier: ModelTier): string;
  getName(): string;
}
