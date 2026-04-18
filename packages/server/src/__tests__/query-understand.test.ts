import { beforeAll, describe, expect, it } from 'vitest';
import { resolve } from 'path';
import { setSettingsDir, DomainGlossary, type GlossaryConfig } from '@airflux/core';
import { loadConfigOptional } from '@airflux/core';
import { understandQuery } from '../routes/query-understand.js';

describe('understandQuery', () => {
  beforeAll(() => {
    setSettingsDir(resolve(import.meta.dirname, '../../../..', 'settings'));
  });

  function glossary() {
    const cfg = loadConfigOptional<GlossaryConfig>('domain-glossary', { terms: {} });
    return new DomainGlossary(cfg);
  }

  it('extracts Korean time range ("지난주")', () => {
    const result = understandQuery('지난주 매출 보여줘', glossary());
    expect(result.timeRanges.length).toBeGreaterThan(0);
    const r = result.timeRanges[0] as Record<string, unknown>;
    expect(typeof r.start).toBe('string');
    expect(typeof r.end).toBe('string');
  });

  it('resolves domain terms (DAU → canonical name)', () => {
    const result = understandQuery('DAU와 리텐션 비교', glossary());
    expect(result.terms.length).toBeGreaterThan(0);
    // Glossary returns canonical English names for Korean/abbreviated inputs.
    const canonicals = result.terms.map((t) => String((t as Record<string, unknown>).canonical ?? '')).join(' ');
    expect(canonicals.toLowerCase()).toContain('daily active users');
  });

  it('returns empty time but possibly-matching terms for random latin text', () => {
    const result = understandQuery('xyz qqqq', glossary());
    expect(result.timeRanges).toEqual([]);
    // Glossary matches on substring aliases — "xyz qqqq" has no aliases.
    expect(result.terms).toEqual([]);
  });

  it('handles both time + terms in one query', () => {
    const result = understandQuery('지난주 DAU 추이', glossary());
    expect(result.timeRanges.length).toBeGreaterThan(0);
    expect(result.terms.length).toBeGreaterThan(0);
  });

  it('returns empty arrays for empty input', () => {
    const result = understandQuery('', glossary());
    expect(result).toEqual({ timeRanges: [], terms: [] });
  });
});
