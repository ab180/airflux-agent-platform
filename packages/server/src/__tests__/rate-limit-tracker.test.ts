import { beforeEach, describe, expect, it } from 'vitest';
import {
  parseRateLimitHeaders,
  recordRateLimit,
  getRateLimitState,
  resetRateLimitForTest,
  shouldPreferApiKey,
} from '../llm/rate-limit.js';

function mkHeaders(obj: Record<string, string>): Headers {
  const h = new Headers();
  for (const [k, v] of Object.entries(obj)) h.set(k, v);
  return h;
}

describe('parseRateLimitHeaders', () => {
  beforeEach(() => resetRateLimitForTest());

  it('returns null when no ratelimit headers are present', () => {
    expect(parseRateLimitHeaders(mkHeaders({}))).toBeNull();
    expect(parseRateLimitHeaders(mkHeaders({ 'content-type': 'application/json' }))).toBeNull();
  });

  it('parses 5h + 7d utilization and reset', () => {
    const h = mkHeaders({
      'anthropic-ratelimit-unified-5h-status': 'allowed',
      'anthropic-ratelimit-unified-5h-utilization': '0.24',
      'anthropic-ratelimit-unified-5h-reset': '1776668400',
      'anthropic-ratelimit-unified-7d-status': 'allowed',
      'anthropic-ratelimit-unified-7d-utilization': '0.29',
      'anthropic-ratelimit-unified-7d-reset': '1776981600',
    });
    const r = parseRateLimitHeaders(h);
    expect(r).not.toBeNull();
    expect(r!.fiveHour).toEqual({
      status: 'allowed',
      utilization: 0.24,
      resetAt: 1776668400 * 1000,
    });
    expect(r!.sevenDay).toEqual({
      status: 'allowed',
      utilization: 0.29,
      resetAt: 1776981600 * 1000,
    });
  });

  it('partial headers still parse what is present', () => {
    const h = mkHeaders({
      'anthropic-ratelimit-unified-5h-status': 'throttled',
      'anthropic-ratelimit-unified-5h-utilization': '1.0',
    });
    const r = parseRateLimitHeaders(h);
    expect(r!.fiveHour!.status).toBe('throttled');
    expect(r!.sevenDay).toBeUndefined();
  });
});

describe('recordRateLimit + getRateLimitState', () => {
  beforeEach(() => resetRateLimitForTest());

  it('returns null before any response', () => {
    expect(getRateLimitState()).toBeNull();
  });

  it('stores the latest observed state', () => {
    recordRateLimit(
      mkHeaders({
        'anthropic-ratelimit-unified-5h-utilization': '0.10',
        'anthropic-ratelimit-unified-5h-status': 'allowed',
      }),
    );
    recordRateLimit(
      mkHeaders({
        'anthropic-ratelimit-unified-5h-utilization': '0.50',
        'anthropic-ratelimit-unified-5h-status': 'allowed',
      }),
    );
    const s = getRateLimitState();
    expect(s!.fiveHour!.utilization).toBe(0.5);
    expect(s!.observedAt).toBeGreaterThan(0);
  });

  it('silently ignores responses without ratelimit headers', () => {
    recordRateLimit(
      mkHeaders({
        'anthropic-ratelimit-unified-5h-utilization': '0.10',
        'anthropic-ratelimit-unified-5h-status': 'allowed',
      }),
    );
    recordRateLimit(mkHeaders({}));
    expect(getRateLimitState()!.fiveHour!.utilization).toBe(0.1);
  });
});

describe('shouldPreferApiKey', () => {
  beforeEach(() => resetRateLimitForTest());

  it('returns false when we never observed a rate limit response', () => {
    expect(shouldPreferApiKey(0.8)).toBe(false);
  });

  it('returns false below threshold', () => {
    recordRateLimit(
      mkHeaders({
        'anthropic-ratelimit-unified-5h-utilization': '0.5',
        'anthropic-ratelimit-unified-5h-status': 'allowed',
      }),
    );
    expect(shouldPreferApiKey(0.8)).toBe(false);
  });

  it('returns true at/above threshold', () => {
    recordRateLimit(
      mkHeaders({
        'anthropic-ratelimit-unified-5h-utilization': '0.85',
        'anthropic-ratelimit-unified-5h-status': 'allowed',
      }),
    );
    expect(shouldPreferApiKey(0.8)).toBe(true);
  });

  it('returns true when status is throttled regardless of util', () => {
    recordRateLimit(
      mkHeaders({
        'anthropic-ratelimit-unified-5h-utilization': '0.1',
        'anthropic-ratelimit-unified-5h-status': 'throttled',
      }),
    );
    expect(shouldPreferApiKey(0.95)).toBe(true);
  });
});
