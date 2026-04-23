import { describe, it, expect } from 'vitest';
import { parseFrontmatter } from '../frontmatter.js';

describe('parseFrontmatter', () => {
  it('parses frontmatter + body', () => {
    const raw = `---
id: sql-analyst
triggers:
  - DAU
  - 쿼리
---
# Body

Instructions here.`;
    const r = parseFrontmatter<{ id: string; triggers: string[] }>(raw);
    expect(r.data.id).toBe('sql-analyst');
    expect(r.data.triggers).toEqual(['DAU', '쿼리']);
    expect(r.body.trim()).toBe('# Body\n\nInstructions here.');
  });

  it('returns empty data when no frontmatter delimiter', () => {
    const raw = `Just a plain body.`;
    const r = parseFrontmatter(raw);
    expect(r.data).toEqual({});
    expect(r.body).toBe('Just a plain body.');
  });

  it('handles empty frontmatter block', () => {
    const raw = `---
---
body`;
    const r = parseFrontmatter(raw);
    expect(r.data).toEqual({});
    expect(r.body.trim()).toBe('body');
  });

  it('throws on malformed YAML frontmatter', () => {
    const raw = `---
key: : : broken
---
body`;
    expect(() => parseFrontmatter(raw)).toThrow();
  });

  it('handles trailing newline quirks', () => {
    const raw = `---\nid: x\n---\n`;
    const r = parseFrontmatter<{ id: string }>(raw);
    expect(r.data.id).toBe('x');
    expect(r.body).toBe('');
  });
});
