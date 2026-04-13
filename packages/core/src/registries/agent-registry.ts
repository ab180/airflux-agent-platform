import type { AgentConfig, AgentContext, AgentResult } from '../types/agent.js';
import type { BaseAgent } from '../agents/base-agent.js';
import { AgentNotFoundError, AgentDisabledError } from '../types/errors.js';
import { ToolRegistry } from './tool-registry.js';
import { SkillRegistry } from './skill-registry.js';

type AgentFactory = (config: AgentConfig, tools: Record<string, unknown>) => BaseAgent;

export class AgentRegistry {
  private static agents = new Map<string, BaseAgent>();
  private static factories = new Map<string, AgentFactory>();
  private static defaultFactory: AgentFactory | null = null;

  static registerFactory(name: string, factory: AgentFactory): void {
    this.factories.set(name, factory);
  }

  static setDefaultFactory(factory: AgentFactory): void {
    this.defaultFactory = factory;
  }

  static async initialize(configs: AgentConfig[]): Promise<void> {
    for (const config of configs) {
      const skillTools = SkillRegistry.getToolsForSkills(config.skills || []);
      const directTools = config.tools || [];
      const allToolNames = [...new Set([...skillTools, ...directTools])];
      const tools = ToolRegistry.getMany(allToolNames);

      const factory = this.factories.get(config.name) || this.defaultFactory;
      if (!factory) {
        console.warn(`No factory registered for agent: ${config.name}, skipping`);
        continue;
      }

      const agent = factory(config, tools);
      this.agents.set(config.name, agent);
    }
  }

  static get(name: string): BaseAgent {
    const agent = this.agents.get(name);
    if (!agent) throw new AgentNotFoundError(name);
    return agent;
  }

  static getOptional(name: string): BaseAgent | undefined {
    return this.agents.get(name);
  }

  static async execute(name: string, context: AgentContext): Promise<AgentResult> {
    const agent = this.get(name);
    if (!agent.isEnabled()) throw new AgentDisabledError(name);
    if (!agent.canHandleSource(context.source)) {
      return {
        success: false,
        error: `Agent ${name} does not accept requests from ${context.source}`,
      };
    }
    return agent.execute(context);
  }

  static list(): BaseAgent[] {
    return Array.from(this.agents.values());
  }

  static listEnabled(): BaseAgent[] {
    return this.list().filter(a => a.isEnabled());
  }

  static has(name: string): boolean {
    return this.agents.has(name);
  }

  static remove(name: string): boolean {
    return this.agents.delete(name);
  }

  /**
   * Execute multiple agents in parallel (GSD-2 parallel dispatch pattern).
   * Each task gets an independent session. Results are collected via Promise.allSettled.
   */
  static async executeParallel(
    tasks: { agent: string; context: AgentContext }[],
  ): Promise<{ agent: string; result: AgentResult; durationMs: number }[]> {
    const promises = tasks.map(async ({ agent, context }) => {
      const start = performance.now();
      try {
        const result = await this.execute(agent, context);
        return { agent, result, durationMs: Math.round(performance.now() - start) };
      } catch (e) {
        return {
          agent,
          result: { success: false, error: e instanceof Error ? e.message : 'Unknown error' } as AgentResult,
          durationMs: Math.round(performance.now() - start),
        };
      }
    });

    const settled = await Promise.allSettled(promises);
    return settled
      .filter((s): s is PromiseFulfilledResult<{ agent: string; result: AgentResult; durationMs: number }> => s.status === 'fulfilled')
      .map(s => s.value);
  }

  static clear(): void {
    this.agents.clear();
    this.factories.clear();
    this.defaultFactory = null;
  }
}
