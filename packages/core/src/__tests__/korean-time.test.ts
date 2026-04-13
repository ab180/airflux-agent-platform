import { describe, it, expect } from 'vitest';
import { normalizeKoreanTime, extractTimeExpressions } from '../utils/korean-time.js';

// Fixed reference date: 2026-04-04 (Friday)
const NOW = new Date(2026, 3, 4); // month is 0-indexed

describe('normalizeKoreanTime', () => {
  it('오늘', () => {
    const r = normalizeKoreanTime('오늘', NOW);
    expect(r?.start).toBe('2026-04-04');
    expect(r?.end).toBe('2026-04-04');
  });

  it('어제', () => {
    const r = normalizeKoreanTime('어제', NOW);
    expect(r?.start).toBe('2026-04-03');
  });

  it('그저께', () => {
    const r = normalizeKoreanTime('그저께', NOW);
    expect(r?.start).toBe('2026-04-02');
  });

  it('최근 7일', () => {
    const r = normalizeKoreanTime('최근 7일', NOW);
    expect(r?.start).toBe('2026-03-28');
    expect(r?.end).toBe('2026-04-04');
  });

  it('최근 3개월', () => {
    const r = normalizeKoreanTime('최근 3개월', NOW);
    expect(r?.start).toBe('2026-01-04');
    expect(r?.end).toBe('2026-04-04');
  });

  it('3일 전', () => {
    const r = normalizeKoreanTime('3일 전', NOW);
    expect(r?.start).toBe('2026-04-01');
  });

  it('이번 주 (금요일 기준)', () => {
    const r = normalizeKoreanTime('이번 주', NOW);
    // 2026-04-04 is Friday. Week starts Monday 03-30.
    expect(r?.start).toBe('2026-03-30');
    expect(r?.end).toBe('2026-04-05');
  });

  it('지난주', () => {
    const r = normalizeKoreanTime('지난주', NOW);
    expect(r?.start).toBe('2026-03-23');
    expect(r?.end).toBe('2026-03-29');
  });

  it('이번 달', () => {
    const r = normalizeKoreanTime('이번 달', NOW);
    expect(r?.start).toBe('2026-04-01');
    expect(r?.end).toBe('2026-04-30');
  });

  it('지난달', () => {
    const r = normalizeKoreanTime('지난달', NOW);
    expect(r?.start).toBe('2026-03-01');
    expect(r?.end).toBe('2026-03-31');
  });

  it('올해', () => {
    const r = normalizeKoreanTime('올해', NOW);
    expect(r?.start).toBe('2026-01-01');
    expect(r?.end).toBe('2026-04-04');
  });

  it('작년', () => {
    const r = normalizeKoreanTime('작년', NOW);
    expect(r?.start).toBe('2025-01-01');
    expect(r?.end).toBe('2025-12-31');
  });

  it('returns null for unrecognized', () => {
    expect(normalizeKoreanTime('foo bar', NOW)).toBeNull();
  });
});

describe('extractTimeExpressions', () => {
  it('extracts multiple expressions from a query', () => {
    const results = extractTimeExpressions('지난주 DAU와 오늘 DAU를 비교해줘', NOW);
    expect(results).toHaveLength(2);
    expect(results.map(r => r.label)).toContain('지난주');
    expect(results.map(r => r.label)).toContain('오늘');
  });

  it('extracts dynamic pattern', () => {
    const results = extractTimeExpressions('최근 30일 매출 추이', NOW);
    expect(results).toHaveLength(1);
    expect(results[0].label).toBe('최근 30일');
  });

  it('returns empty for no time expressions', () => {
    const results = extractTimeExpressions('앱 123의 DAU', NOW);
    expect(results).toHaveLength(0);
  });
});
