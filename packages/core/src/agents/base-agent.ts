import type { AgentConfig, AgentContext, AgentResult, AgentTool, AgentAutonomy } from '../types/agent.js';

export abstract class BaseAgent {
  readonly name: string;
  readonly config: AgentConfig;
  protected tools: Record<string, AgentTool>;
  private _enabledOverride: boolean | null = null;

  constructor(config: AgentConfig, tools: Record<string, AgentTool>) {
    this.name = config.name;
    this.config = config;
    this.tools = tools;
  }

  abstract execute(context: AgentContext): Promise<AgentResult>;

  isEnabled(): boolean {
    return this._enabledOverride ?? this.config.enabled;
  }

  setEnabled(enabled: boolean): void {
    this._enabledOverride = enabled;
  }

  canHandleSource(source: string): boolean {
    if (!this.config.sources || this.config.sources.length === 0) return true;
    return this.config.sources.includes(source as AgentContext['source']);
  }

  getToolNames(): string[] {
    return Object.keys(this.tools);
  }

  getAutonomy(): AgentAutonomy {
    return this.config.autonomy || 'auto-read';
  }

  toJSON() {
    return {
      name: this.name,
      enabled: this.isEnabled(),
      description: this.config.description,
      model: this.config.model,
      skills: this.config.skills,
      tools: this.getToolNames(),
      schedule: this.config.schedule,
      autonomy: this.getAutonomy(),
      advisor: this.config.advisor || null,
    };
  }
}
