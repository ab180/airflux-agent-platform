import type { SkillDefinition } from '../types/agent.js';

export class SkillRegistry {
  private static skills = new Map<string, SkillDefinition>();

  static register(skill: SkillDefinition): void {
    this.skills.set(skill.name, skill);
  }

  static get(name: string): SkillDefinition | undefined {
    return this.skills.get(name);
  }

  static list(): SkillDefinition[] {
    return Array.from(this.skills.values());
  }

  static getToolsForSkills(skillNames: string[]): string[] {
    const tools = new Set<string>();
    for (const name of skillNames) {
      const skill = this.skills.get(name);
      if (skill) {
        for (const tool of skill.requiredTools) {
          tools.add(tool);
        }
      }
    }
    return Array.from(tools);
  }

  static clear(): void {
    this.skills.clear();
  }
}
