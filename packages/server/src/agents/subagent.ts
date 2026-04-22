/**
 * Subagent pattern — Agent-as-Tool (from ab180/agent).
 *
 * Main agent delegates domain-specific tasks to specialized subagents.
 * Each subagent runs as a separate LLM call with its own prompt and tool subset.
 * The main agent invokes subagents as regular tools.
 *
 * Execution priority:
 *   1. AI SDK (OAuth/API key) — full tool calling support
 *   2. Claude CLI fallback — text-only, no tool calling
 */

import { generateText, stepCountIs } from 'ai';
import type { SubagentConfig, AgentTool } from '@airflux/core';
import { ToolRegistry } from '@airflux/core';
import { createModelAsync } from '../llm/model-factory.js';
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
 * Tries AI SDK first (with real tool calling), falls back to CLI.
 */
async function executeSubagent(config: SubagentConfig, query: string): Promise<unknown> {
  const startTime = performance.now();

  // Resolve actual tools from registry
  const subagentTools: Record<string, AgentTool> = {};
  for (const name of config.tools) {
    const tool = ToolRegistry.getOptional(name);
    if (tool) subagentTools[name] = tool;
  }

  const toolDescriptions = Object.entries(subagentTools)
    .map(([name, t]) => `- ${name}: ${t.description}`)
    .join('\n');

  const systemPrompt = `${config.prompt}\n\n사용 가능한 도구:\n${toolDescriptions}`;
  const modelTier = config.model || 'default';

  try {
    // Try AI SDK first — enables real tool calling
    const model = await createModelAsync(modelTier as 'fast' | 'default' | 'powerful');

    // Convert tools to AI SDK format (same pattern as assistant-agent.ts).
    // AI SDK v6: schema field is `inputSchema`, not `parameters`.
    const aiTools: Record<string, { description: string; inputSchema: unknown; execute: (input: unknown) => Promise<unknown> }> = {};
    for (const [name, t] of Object.entries(subagentTools)) {
      aiTools[name] = {
        description: t.description,
        inputSchema: t.inputSchema,
        execute: async (input: unknown) => t.execute(input),
      };
    }

    const result = await generateText({
      model,
      system: systemPrompt,
      prompt: query,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: aiTools as any,
      stopWhen: stepCountIs(config.maxSteps || 5),
      temperature: 0,
    });

    const durationMs = Math.round(performance.now() - startTime);
    const toolCalls = result.steps.flatMap(s => s.toolCalls || []).map(tc => tc.toolName);

    recordCost({
      timestamp: new Date().toISOString(),
      agent: `subagent:${config.name}`,
      model: modelTier,
      inputTokens: result.usage?.inputTokens ?? 0,
      outputTokens: result.usage?.outputTokens ?? 0,
      durationMs,
    });

    logger.info('Subagent executed (AI SDK)', {
      subagent: config.name,
      model: modelTier,
      toolCalls,
      steps: result.steps.length,
      durationMs,
    });

    return { response: result.text, subagent: config.name, toolCalls, durationMs };
  } catch (sdkError) {
    // AI SDK failed — try CLI fallback (text-only, no tool calling)
    logger.info('Subagent AI SDK unavailable, trying CLI', {
      subagent: config.name,
      error: sdkError instanceof Error ? sdkError.message : String(sdkError),
    });

    try {
      if (!isClaudeCliAvailable()) {
        return { error: 'LLM not available for subagent execution' };
      }

      const cliModel = TIER_TO_CLI_MODEL[modelTier] || TIER_TO_CLI_MODEL['default'];
      const response = callClaudeCli(query, systemPrompt, cliModel);
      const durationMs = Math.round(performance.now() - startTime);

      recordCost({
        timestamp: new Date().toISOString(),
        agent: `subagent:${config.name}`,
        model: modelTier,
        inputTokens: 0,
        outputTokens: 0,
        durationMs,
      });

      logger.info('Subagent executed (CLI fallback)', {
        subagent: config.name,
        model: modelTier,
        durationMs,
      });

      return { response, subagent: config.name, durationMs };
    } catch (cliError) {
      const message = cliError instanceof Error ? cliError.message : 'Unknown error';
      logger.warn('Subagent execution failed', { subagent: config.name, error: message });
      return { error: `Subagent ${config.name} failed: ${message}` };
    }
  }
}
