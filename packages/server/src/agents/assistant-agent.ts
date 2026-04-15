import { generateText, stepCountIs } from 'ai';
import { BaseAgent, loadAgentInstructions } from '@airflux/core';
import type { AgentContext, AgentResult, AgentConfig, AgentTool } from '@airflux/core';
import { createModelAsync } from '../llm/model-factory.js';
import { isClaudeCliAvailable, callClaudeCli } from '../llm/claude-cli-provider.js';
import { buildAdvisorToolDef, buildAdvisorSystemPrompt, extractAdvisorUsage, recordAdvisorCost } from '../llm/advisor.js';

export class AssistantAgent extends BaseAgent {
  constructor(config: AgentConfig, tools: Record<string, AgentTool>) {
    super(config, tools);
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    const startTime = performance.now();
    const modelTier = (this.config.model as 'fast' | 'default' | 'powerful') || 'default';

    try {
      const systemPrompt = this.buildSystemPrompt(context.sessionHistory);

      // Try AI SDK (API key or OAuth auto-refresh), fallback to Claude CLI
      let model;
      try {
        model = await createModelAsync(modelTier);
      } catch {
        // No API key/OAuth — try Claude CLI fallback
        if (isClaudeCliAvailable()) {
          return this.executeViaCli(context, systemPrompt, startTime);
        }
        throw new Error('No LLM available. Set ANTHROPIC_API_KEY or run `claude login`.');
      }

      // Convert registered tools to AI SDK tool format
      const aiTools: Record<string, { description: string; parameters: unknown; execute: (input: unknown) => Promise<unknown> }> = {};
      for (const [name, t] of Object.entries(this.tools)) {
        aiTools[name] = {
          description: t.description,
          parameters: t.inputSchema,
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
   * Fallback: execute via `claude --print` CLI when no API key is available.
   * Uses the user's Claude Code subscription. No tool calling — text only.
   */
  private executeViaCli(context: AgentContext, systemPrompt: string, startTime: number): AgentResult {
    const TIER_TO_MODEL: Record<string, string> = {
      fast: 'claude-haiku-4-5',
      default: 'claude-sonnet-4-6',
      powerful: 'claude-opus-4-6',
    };
    const modelTier = (this.config.model as string) || 'default';
    const cliModel = TIER_TO_MODEL[modelTier] || TIER_TO_MODEL['default'];

    const text = callClaudeCli(context.question, systemPrompt, cliModel);
    const durationMs = Math.round(performance.now() - startTime);

    return {
      success: true,
      text,
      metadata: {
        agent: this.name,
        model: modelTier,
        provider: 'claude-cli',
        durationMs,
        steps: 0,
        toolCalls: [],
        usage: { inputTokens: 0, outputTokens: 0 },
      },
    };
  }

  private buildSystemPrompt(sessionHistory?: string): string {
    // Load freeform instructions from settings/instructions/{agent-name}.md
    const instructions = loadAgentInstructions(this.name);

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
