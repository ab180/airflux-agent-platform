/**
 * Subagent pattern — Agent-as-Tool (from ab180/agent).
 *
 * Main agent delegates domain-specific tasks to specialized subagents.
 * Each subagent runs as a separate LLM call with its own prompt and tool subset.
 * The main agent invokes subagents as regular tools.
 *
 * Usage in agents.yaml:
 *   - name: main-agent
 *     model: powerful
 *     subagents:
 *       - name: data-analyst
 *         description: "데이터 분석 전문 서브에이전트"
 *         prompt: "데이터 분석 전문가로서 질문에 답변하세요."
 *         model: default
 *         tools: [getSemanticLayer, getTableSchema, calculate]
 */

import type { SubagentConfig, AgentTool } from '@airflux/core';
import { ToolRegistry } from '@airflux/core';
import { isClaudeCliAvailable, callClaudeCli } from '../llm/claude-cli-provider.js';
import { logger } from '../lib/logger.js';
import { recordCost } from '../llm/cost-tracker.js';

const TIER_TO_CLI_MODEL: Record<string, string> = {
  fast: 'claude-haiku-4-5',
  default: 'claude-sonnet-4-6',
  powerful: 'claude-opus-4-6',
};

/**
 * Create tool definitions for subagents.
 * Each subagent becomes a callable tool for the main agent.
 */
export function createSubagentTools(configs: SubagentConfig[]): Record<string, AgentTool> {
  const tools: Record<string, AgentTool> = {};

  for (const config of configs) {
    tools[config.name] = {
      description: config.description,
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '서브에이전트에게 위임할 질문' },
        },
        required: ['query'],
      } as unknown as import('zod').ZodType,
      execute: async (input: unknown) => {
        const { query } = input as { query: string };
        return executeSubagent(config, query);
      },
    };
  }

  return tools;
}

/**
 * Execute a subagent with its own prompt, model, and tool subset.
 * Currently uses Claude CLI as the execution backend.
 */
async function executeSubagent(config: SubagentConfig, query: string): Promise<unknown> {
  const startTime = performance.now();

  // Build context with available tool descriptions
  const toolDescriptions = config.tools
    .map(name => {
      const tool = ToolRegistry.getOptional(name);
      return tool ? `- ${name}: ${tool.description}` : null;
    })
    .filter(Boolean)
    .join('\n');

  const systemPrompt = `${config.prompt}\n\n사용 가능한 도구:\n${toolDescriptions}`;

  try {
    if (!isClaudeCliAvailable()) {
      return { error: 'LLM not available for subagent execution' };
    }

    const cliModel = TIER_TO_CLI_MODEL[config.model] || TIER_TO_CLI_MODEL['default'];
    const response = callClaudeCli(query, systemPrompt, cliModel);
    const durationMs = Math.round(performance.now() - startTime);

    // Track subagent cost separately
    recordCost({
      timestamp: new Date().toISOString(),
      agent: `subagent:${config.name}`,
      model: config.model,
      inputTokens: 0, // CLI doesn't report tokens
      outputTokens: 0,
      durationMs,
    });

    logger.info('Subagent executed', {
      subagent: config.name,
      model: config.model,
      durationMs,
    });

    return { response, subagent: config.name, durationMs };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    logger.warn('Subagent execution failed', { subagent: config.name, error: message });
    return { error: `Subagent ${config.name} failed: ${message}` };
  }
}
