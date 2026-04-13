import { describe, it, expect } from 'vitest';
import { validateQueryBody } from '../middleware/validation.js';

describe('validateQueryBody', () => {
  it('accepts valid query', () => {
    const result = validateQueryBody({ query: 'hello' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.query).toBe('hello');
      expect(result.data.userId).toBe('anonymous');
    }
  });

  it('trims whitespace from query', () => {
    const result = validateQueryBody({ query: '  hello  ' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.query).toBe('hello');
    }
  });

  it('rejects missing query', () => {
    const result = validateQueryBody({ userId: 'test' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('query is required');
    }
  });

  it('rejects empty query', () => {
    const result = validateQueryBody({ query: '   ' });
    expect(result.ok).toBe(false);
  });

  it('rejects query over 2000 chars', () => {
    const result = validateQueryBody({ query: 'x'.repeat(2001) });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('2000');
    }
  });

  it('accepts valid agent name', () => {
    const result = validateQueryBody({ query: 'test', agent: 'echo-agent' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.agent).toBe('echo-agent');
    }
  });

  it('rejects agent name with path traversal', () => {
    const result = validateQueryBody({ query: 'test', agent: '../etc' });
    expect(result.ok).toBe(false);
  });

  it('rejects agent name with uppercase', () => {
    const result = validateQueryBody({ query: 'test', agent: 'EchoAgent' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-string query', () => {
    const result = validateQueryBody({ query: 123 });
    expect(result.ok).toBe(false);
  });

  it('rejects non-object body', () => {
    expect(validateQueryBody(null).ok).toBe(false);
    expect(validateQueryBody('string').ok).toBe(false);
    expect(validateQueryBody(undefined).ok).toBe(false);
  });

  it('accepts optional metadata', () => {
    const result = validateQueryBody({
      query: 'test',
      metadata: { key: 'value' },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.metadata).toEqual({ key: 'value' });
    }
  });

  it('rejects oversized metadata', () => {
    const bigMeta: Record<string, string> = {};
    for (let i = 0; i < 200; i++) {
      bigMeta[`key${i}`] = 'x'.repeat(30);
    }
    const result = validateQueryBody({ query: 'test', metadata: bigMeta });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('metadata too large');
    }
  });
});
