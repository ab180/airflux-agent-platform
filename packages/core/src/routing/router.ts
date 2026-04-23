import { AgentRegistry } from '../registries/agent-registry.js';
import type { NetworkState } from './network-state.js';

export interface RoutingRule {
  agent: string;
  priority: number;
  keywords?: string[];
  patterns?: string[];
}

export interface RoutingConfig {
  rules: RoutingRule[];
  fallback: string;
  llmRouterEnabled?: boolean;
}

export interface RoutingCandidate {
  name: string;
  description?: string;
}

export interface LLMRouteDecision {
  agent: string;
  reason?: string | null;
}

export interface RouteResult {
  agent: string;
  matchedRule: string | null;
  llmRouted?: boolean;
  reason?: string | null;
}

export interface AgentRouterOptions {
  llmRouter?: (
    query: string,
    candidates: RoutingCandidate[],
    state?: NetworkState,
  ) => Promise<LLMRouteDecision | null>;
}

export class AgentRouter {
  private rules: RoutingRule[];
  private fallback: string;
  private compiledPatterns: Map<string, RegExp[]>;
  private llmRouter?: AgentRouterOptions['llmRouter'];

  constructor(config: RoutingConfig, options: AgentRouterOptions = {}) {
    this.rules = config.rules.sort((a, b) => b.priority - a.priority);
    this.fallback = config.fallback;
    this.compiledPatterns = new Map();
    this.llmRouter = config.llmRouterEnabled === false ? undefined : options.llmRouter;

    for (const rule of this.rules) {
      if (rule.patterns) {
        const compiled = rule.patterns.map(p => {
          try {
            return new RegExp(p, 'i');
          } catch {
            console.warn(`[Router] Invalid pattern for ${rule.agent}: ${p}`);
            return null;
          }
        }).filter((r): r is RegExp => r !== null);
        this.compiledPatterns.set(rule.agent, compiled);
      }
    }
  }

  async route(query: string, state?: NetworkState): Promise<RouteResult> {
    const lowerQuery = query.toLowerCase();

    for (const rule of this.rules) {
      const agent = AgentRegistry.getOptional(rule.agent);
      if (!agent || !agent.isEnabled()) continue;

      if (rule.keywords) {
        for (const kw of rule.keywords) {
          if (lowerQuery.includes(kw.toLowerCase())) {
            const reason = `keyword:${kw}`;
            state?.pushAgent(rule.agent, reason);
            return { agent: rule.agent, matchedRule: reason };
          }
        }
      }

      const patterns = this.compiledPatterns.get(rule.agent);
      if (patterns) {
        for (const pattern of patterns) {
          if (pattern.test(query)) {
            const reason = `pattern:${pattern.source}`;
            state?.pushAgent(rule.agent, reason);
            return { agent: rule.agent, matchedRule: reason };
          }
        }
      }
    }

    if (this.llmRouter) {
      const candidates = AgentRegistry.listEnabled().map(agent => ({
        name: agent.name,
        description: agent.config.description,
      }));

      if (candidates.length > 0) {
        const decision = await this.llmRouter(query, candidates, state);
        if (decision?.agent) {
          const selected = AgentRegistry.getOptional(decision.agent);
          if (selected?.isEnabled()) {
            state?.pushAgent(decision.agent, `llm:${decision.reason ?? 'selected'}`);
            return {
              agent: decision.agent,
              matchedRule: null,
              llmRouted: true,
              reason: decision.reason ?? null,
            };
          }
        }
      }
    }

    const fallbackAgent = AgentRegistry.getOptional(this.fallback);
    if (fallbackAgent?.isEnabled()) {
      state?.pushAgent(this.fallback, 'fallback');
      return { agent: this.fallback, matchedRule: null };
    }

    const enabled = AgentRegistry.listEnabled();
    if (enabled.length > 0) {
      state?.pushAgent(enabled[0].name, 'first-enabled');
      return { agent: enabled[0].name, matchedRule: null };
    }

    return { agent: this.fallback, matchedRule: null };
  }
}
