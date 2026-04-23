import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSkillsFromMarkdownDir } from '../skill-md-loader.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'airflux-skill-md-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function writeMd(name: string, content: string) {
  writeFileSync(join(dir, name), content);
}

describe('loadSkillsFromMarkdownDir', () => {
  it('loads a single skill markdown file', () => {
    writeMd('sql-analyst.md', `---
name: sql-analyst
description: Answer SQL questions
requiredTools:
  - runSql
guardrails:
  - read-only
triggers:
  - DAU
  - 쿼리
---
# SQL Analyst

Ask me about metrics.`);
    const skills = loadSkillsFromMarkdownDir(dir);
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('sql-analyst');
    expect(skills[0].requiredTools).toEqual(['runSql']);
    expect(skills[0].guardrails).toEqual(['read-only']);
    expect(skills[0].triggers).toEqual(['DAU', '쿼리']);
    expect(skills[0].instructions).toMatch(/# SQL Analyst/);
  });

  it('loads multiple skills, skips non-md files', () => {
    writeMd('a.md', `---\nname: a\ndescription: A\nrequiredTools: []\nguardrails: []\n---\nabody`);
    writeMd('b.md', `---\nname: b\ndescription: B\nrequiredTools: []\nguardrails: []\n---\nbbody`);
    writeFileSync(join(dir, 'ignore.txt'), 'nope');
    const skills = loadSkillsFromMarkdownDir(dir);
    const names = skills.map(s => s.name).sort();
    expect(names).toEqual(['a', 'b']);
  });

  it('returns [] for empty dir', () => {
    expect(loadSkillsFromMarkdownDir(dir)).toEqual([]);
  });

  it('throws when required field missing', () => {
    writeMd('broken.md', `---\ndescription: No name\nrequiredTools: []\nguardrails: []\n---\nbody`);
    expect(() => loadSkillsFromMarkdownDir(dir)).toThrow(/name/);
  });

  it('throws on non-existent directory', () => {
    expect(() => loadSkillsFromMarkdownDir(join(dir, 'does-not-exist'))).toThrow();
  });

  it('defaults optional fields', () => {
    writeMd('m.md', `---\nname: m\ndescription: Minimal\nrequiredTools: []\nguardrails: []\n---\n`);
    const s = loadSkillsFromMarkdownDir(dir)[0];
    expect(s.triggers).toBeUndefined();
    expect(s.instructions).toBe('');
  });
});
