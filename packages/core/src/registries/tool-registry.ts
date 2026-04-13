import type { AgentTool } from '../types/agent.js';
import { ToolNotFoundError } from '../types/errors.js';

export class ToolRegistry {
  private static tools = new Map<string, AgentTool>();

  static register(name: string, tool: AgentTool): void {
    this.tools.set(name, tool);
  }

  static get(name: string): AgentTool {
    const tool = this.tools.get(name);
    if (!tool) throw new ToolNotFoundError(name);
    return tool;
  }

  static getOptional(name: string): AgentTool | undefined {
    return this.tools.get(name);
  }

  static getMany(names: string[]): Record<string, AgentTool> {
    const result: Record<string, AgentTool> = {};
    for (const name of names) {
      const tool = this.tools.get(name);
      if (tool) result[name] = tool;
    }
    return result;
  }

  static has(name: string): boolean {
    return this.tools.has(name);
  }

  static list(): string[] {
    return Array.from(this.tools.keys());
  }

  static clear(): void {
    this.tools.clear();
  }
}
