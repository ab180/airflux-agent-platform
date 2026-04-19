import { AgentRegistry } from '../registries/agent-registry.js';

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
  llmRouter?: (query: string, candidates: RoutingCandidate[]) => Promise<LLMRouteDecision | null>;
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

  async route(query: string): Promise<RouteResult> {
    const lowerQuery = query.toLowerCase();

    for (const rule of this.rules) {
      // Check if agent exists and is enabled
      const agent = AgentRegistry.getOptional(rule.agent);
      if (!agent || !agent.isEnabled()) continue;

      // Check keywords
      if (rule.keywords) {
        for (const kw of rule.keywords) {
          if (lowerQuery.includes(kw.toLowerCase())) {
            return { agent: rule.agent, matchedRule: `keyword:${kw}` };
          }
        }
      }

      // Check regex patterns
      const patterns = this.compiledPatterns.get(rule.agent);
      if (patterns) {
        for (const pattern of patterns) {
          if (pattern.test(query)) {
            return { agent: rule.agent, matchedRule: `pattern:${pattern.source}` };
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
        const decision = await this.llmRouter(query, candidates);
        if (decision?.agent) {
          const selected = AgentRegistry.getOptional(decision.agent);
          if (selected?.isEnabled()) {
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

    // Fallback
    const fallbackAgent = AgentRegistry.getOptional(this.fallback);
    if (fallbackAgent?.isEnabled()) {
      return { agent: this.fallback, matchedRule: null };
    }

    // Last resort: first enabled agent
    const enabled = AgentRegistry.listEnabled();
    if (enabled.length > 0) {
      return { agent: enabled[0].name, matchedRule: null };
    }

    return { agent: this.fallback, matchedRule: null };
  }
}
