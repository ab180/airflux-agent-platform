import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { getSettingsDir } from './loader.js';

/**
 * Load freeform markdown instructions for an agent.
 * Looks for settings/instructions/{agentName}.md
 * Returns the content or empty string if not found.
 */
export function loadAgentInstructions(agentName: string): string {
  const filePath = join(getSettingsDir(), 'instructions', `${agentName}.md`);
  if (!existsSync(filePath)) return '';

  try {
    return readFileSync(filePath, 'utf-8').trim();
  } catch {
    return '';
  }
}

/**
 * List all agents that have instruction files.
 */
export function listAgentInstructions(): string[] {
  const dir = join(getSettingsDir(), 'instructions');
  if (!existsSync(dir)) return [];

  try {
    return readdirSync(dir)
      .filter((f: string) => f.endsWith('.md'))
      .map((f: string) => f.replace('.md', ''));
  } catch {
    return [];
  }
}
