import { readdirSync, readFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import type { SkillDefinition } from '../types/agent.js';
import { parseFrontmatter } from './frontmatter.js';

interface SkillFrontmatter {
  name?: string;
  description?: string;
  requiredTools?: string[];
  guardrails?: string[];
  triggers?: string[];
}

/**
 * Load skill definitions from a directory of markdown files.
 *
 * Each `*.md` file:
 *   - YAML frontmatter with `name`, `description`, `requiredTools`, `guardrails`
 *     (required) + optional `triggers`
 *   - Markdown body → stored as `instructions` on the SkillDefinition
 *
 * This is additive: it does not replace the existing YAML skills loader.
 * Callers decide whether to register the returned skills alongside
 * YAML-loaded ones.
 */
export function loadSkillsFromMarkdownDir(dir: string): SkillDefinition[] {
  const entries = readdirSync(dir);
  const skills: SkillDefinition[] = [];
  for (const entry of entries) {
    if (extname(entry).toLowerCase() !== '.md') continue;
    const raw = readFileSync(join(dir, entry), 'utf-8');
    const { data, body } = parseFrontmatter<SkillFrontmatter>(raw);

    if (!data.name) {
      throw new Error(`Skill ${entry} is missing required 'name' in frontmatter`);
    }
    if (!data.description) {
      throw new Error(`Skill ${entry} is missing required 'description' in frontmatter`);
    }
    if (!Array.isArray(data.requiredTools)) {
      throw new Error(`Skill ${entry} must declare 'requiredTools' as an array`);
    }
    if (!Array.isArray(data.guardrails)) {
      throw new Error(`Skill ${entry} must declare 'guardrails' as an array`);
    }

    skills.push({
      name: data.name,
      description: data.description,
      requiredTools: data.requiredTools,
      guardrails: data.guardrails,
      triggers: data.triggers,
      instructions: body.trim() === '' ? '' : body,
    });
  }
  return skills;
}
