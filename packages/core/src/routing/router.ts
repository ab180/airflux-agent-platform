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
}

export class AgentRouter {
  private rules: RoutingRule[];
  private fallback: string;
  private compiledPatterns: Map<string, RegExp[]>;

  constructor(config: RoutingConfig) {
    this.rules = config.rules.sort((a, b) => b.priority - a.priority);
    this.fallback = config.fallback;
    this.compiledPatterns = new Map();

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

  route(query: string): { agent: string; matchedRule: string | null } {
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
