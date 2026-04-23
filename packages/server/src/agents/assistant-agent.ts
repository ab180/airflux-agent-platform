import { generateText, streamText, stepCountIs } from 'ai';
import { BaseAgent } from '@airflux/core';
import type { AgentContext, AgentResult, AgentConfig, AgentTool } from '@airflux/core';
import { getAgentInstructions } from './instructions.js';
import { createModelAsync, createModelForProvider } from '../llm/model-factory.js';
import { isClaudeCliAvailable, callClaudeCli } from '../llm/claude-cli-provider.js';
import { isCodexCliAvailable, callCodexCli } from '../llm/codex-cli-provider.js';
import { buildAdvisorToolDef, buildAdvisorSystemPrompt, extractAdvisorUsage, recordAdvisorCost } from '../llm/advisor.js';

export interface AgentStreamResult {
  fullStream: AsyncIterable<unknown>;
  modelTier: string;
  agentName: string;
}

export class AssistantAgent extends BaseAgent {
  constructor(config: AgentConfig, tools: Record<string, AgentTool>) {
    super(config, tools);
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    const startTime = performance.now();
    const modelTier = (this.config.model as 'fast' | 'default' | 'powerful') || 'default';

    try {
      const systemPrompt = this.buildSystemPrompt(context.sessionHistory);

      // Try AI SDK with provider selection, fallback to CLI
      const provider = this.config.provider || 'claude';
      let model;
      try {
        model = await createModelForProvider(provider, modelTier);
      } catch {
        // SDK unavailable — try CLI fallback
        if (provider === 'openai' && isCodexCliAvailable()) {
          return this.executeViaCli(context, systemPrompt, startTime, 'codex');
        }
        if (isClaudeCliAvailable()) {
          return this.executeViaCli(context, systemPrompt, startTime, 'claude');
        }
        throw new Error('No LLM available. Set API key or run `claude login` / `codex login`.');
      }

      // Convert registered tools to AI SDK tool format.
      // AI SDK v6 renamed the schema field `parameters` → `inputSchema`.
      // Before this fix, v6 ignored the old `parameters` key, passed no
      // schema to the provider, and every tool-call came back with
      // input:{} because the LLM couldn't see what arguments to produce.
      const aiTools: Record<string, { description: string; inputSchema: unknown; execute: (input: unknown) => Promise<unknown> }> = {};
      for (const [name, t] of Object.entries(this.tools)) {
        aiTools[name] = {
          description: t.description,
          inputSchema: t.inputSchema,
          execute: async (input: unknown) => t.execute(input),
        };
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await generateText({
        model,
        system: systemPrompt,
        prompt: context.question,
        tools: aiTools as any,
        stopWhen: stepCountIs(this.config.maxSteps || 5),
        // Extended thinking requires temperature: 1 (Anthropic constraint)
        temperature: 0,
      });

      const durationMs = Math.round(performance.now() - startTime);

      // Track advisor cost separately if advisor was used
      const iterations = ((result as unknown as Record<string, unknown>).usage as Record<string, unknown>)?.iterations;
      let advisorCalls = 0;
      if (this.config.advisor && Array.isArray(iterations)) {
        const advisorUsage = extractAdvisorUsage(iterations);
        advisorCalls = advisorUsage.advisorCalls;
        if (advisorUsage.advisorModel) {
          recordAdvisorCost(this.name, advisorUsage.advisorModel, advisorUsage.advisorTokens, durationMs);
        }
      }

      // Extract reasoning text from extended thinking (undefined in CLI/non-thinking mode)
      const thinking = (result as unknown as { reasoningText?: string }).reasoningText || undefined;

      return {
        success: true,
        text: result.text,
        metadata: {
          agent: this.name,
          model: modelTier,
          durationMs,
          steps: result.steps.length,
          toolCalls: result.steps.flatMap(s => s.toolCalls || []).map(tc => tc.toolName),
          advisorCalls,
          advisorModel: this.config.advisor?.model || null,
          thinking,
          usage: {
            inputTokens: (result.usage as unknown as Record<string, number>).promptTokens ?? result.usage.inputTokens ?? 0,
            outputTokens: (result.usage as unknown as Record<string, number>).completionTokens ?? result.usage.outputTokens ?? 0,
          },
        },
      };
    } catch (e) {
      const durationMs = Math.round(performance.now() - startTime);
      const message = e instanceof Error ? e.message : 'Unknown LLM error';
      // LLM error logged via metadata in response

      return {
        success: false,
        error: `Agent execution failed: ${message}`,
        metadata: { agent: this.name, durationMs },
      };
    }
  }

  /**
   * Streaming variant of execute(). Returns the AI SDK streamText result so
   * the HTTP route can pipe `fullStream` into SSE. Text + tool-call events
   * surface incrementally for a token-by-token playground feel.
   *
   * Bypasses the CLI fallbacks — streaming requires the AI SDK path. If
   * the model can't be built, the caller should fall back to execute().
   */
  async streamExecute(
    context: AgentContext,
    override?: { provider?: 'claude' | 'openai'; tier?: AgentConfig['model'] },
  ): Promise<AgentStreamResult> {
    const modelTier =
      (override?.tier as 'fast' | 'default' | 'powerful') ||
      (this.config.model as 'fast' | 'default' | 'powerful') ||
      'default';
    const systemPrompt = this.buildSystemPrompt(context.sessionHistory);
    const provider = override?.provider || this.config.provider || 'claude';
    const model = await createModelForProvider(provider, modelTier);

    // AI SDK v6: schema field is `inputSchema`, not `parameters`.
    const aiTools: Record<string, { description: string; inputSchema: unknown; execute: (input: unknown) => Promise<unknown> }> = {};
    for (const [name, t] of Object.entries(this.tools)) {
      aiTools[name] = {
        description: t.description,
        inputSchema: t.inputSchema,
        execute: async (input: unknown) => t.execute(input),
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = streamText({
      model,
      system: systemPrompt,
      prompt: context.question,
      tools: aiTools as any,
      stopWhen: stepCountIs(this.config.maxSteps || 5),
      temperature: 0,
    });

    return {
      fullStream: result.fullStream as AsyncIterable<unknown>,
      modelTier,
      agentName: this.name,
    };
  }

  /**
   * Fallback: execute via CLI when no API key is available.
   * Supports both Claude CLI and Codex CLI. No tool calling — text only.
   */
  private executeViaCli(
    context: AgentContext,
    systemPrompt: string,
    startTime: number,
    backend: 'claude' | 'codex' = 'claude',
  ): AgentResult {
    const modelTier = (this.config.model as string) || 'default';
    let text: string;
    let providerName: string;

    if (backend === 'codex') {
      const CODEX_MODELS: Record<string, string> = { fast: 'gpt-4.1-mini', default: 'gpt-5.4', powerful: 'o3' };
      text = callCodexCli(context.question, systemPrompt, CODEX_MODELS[modelTier] || 'gpt-5.4');
      providerName = 'codex-cli';
    } else {
      const CLAUDE_MODELS: Record<string, string> = { fast: 'claude-haiku-4-5', default: 'claude-sonnet-4-6', powerful: 'claude-opus-4-6' };
      text = callClaudeCli(context.question, systemPrompt, CLAUDE_MODELS[modelTier] || 'claude-sonnet-4-6');
      providerName = 'claude-cli';
    }

    const durationMs = Math.round(performance.now() - startTime);

    return {
      success: true,
      text,
      metadata: {
        agent: this.name,
        model: modelTier,
        provider: providerName,
        durationMs,
        steps: 0,
        toolCalls: [],
        usage: { inputTokens: 0, outputTokens: 0 },
      },
    };
  }

  private buildSystemPrompt(sessionHistory?: string): string {
    // DB prompt_versions (current) → filesystem instructions/{agent-name}.md fallback.
    const instructions = getAgentInstructions(this.name);

    // GSD-2 pattern: structured context injection with tool metadata
    const toolDescriptions = Object.entries(this.tools)
      .map(([name, t]) => `- ${name}: ${t.description}`)
      .join('\n');

    const basePrompt = instructions || `당신은 Airflux Agent Platform의 AI 어시스턴트입니다.
사용자의 질문에 도움이 되는 답변을 제공합니다.
필요하면 도구를 적극적으로 사용하세요.
한국어로 간결하고 정확하게 답변하세요.`;

    let prompt = basePrompt;
    prompt += `\n\n## 사용 가능한 도구\n${toolDescriptions}`;

    // Inject advisor guidance when advisor is configured
    if (this.config.advisor) {
      prompt += `\n\n${buildAdvisorSystemPrompt()}`;
    }

    // GSD-2 pattern: inject compressed session context (last 5 turns only)
    if (sessionHistory) {
      const lines = sessionHistory.split('\n').filter(l => l.trim());
      const recentLines = lines.slice(-10); // last 5 Q&A pairs
      if (recentLines.length > 0) {
        prompt += `\n\n## 최근 대화 컨텍스트\n${recentLines.join('\n')}`;
      }
    }

    return prompt;
  }
}
