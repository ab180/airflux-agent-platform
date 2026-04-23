import { beforeEach, describe, expect, it } from 'vitest';
import {
  markClaudeOAuthThrottled,
  clearClaudeOAuthThrottle,
  isClaudeOAuthThrottled,
  getClaudeOAuthThrottleState,
} from '../llm/claude-throttle.js';

describe('claude oauth throttle', () => {
  beforeEach(() => clearClaudeOAuthThrottle());

  it('starts not throttled', () => {
    expect(isClaudeOAuthThrottled(Date.now())).toBe(false);
    expect(getClaudeOAuthThrottleState()).toBeNull();
  });

  it('mark then check with retryAfterSec', () => {
    markClaudeOAuthThrottled({ reason: 'http_429', retryAfterSec: 60, now: 1_000_000 });
    expect(isClaudeOAuthThrottled(1_000_000)).toBe(true);
    expect(isClaudeOAuthThrottled(1_000_000 + 59_000)).toBe(true);
    expect(isClaudeOAuthThrottled(1_000_000 + 61_000)).toBe(false);
  });

  it('resetAt takes priority over retryAfterSec and default', () => {
    // resetAt is 10 minutes out — should win even though retryAfterSec says 60
    markClaudeOAuthThrottled({
      reason: 'header_throttled_7d',
      retryAfterSec: 60,
      resetAt: 1_000_000 + 10 * 60_000,
      window: '7d',
      now: 1_000_000,
    });
    const s = getClaudeOAuthThrottleState()!;
    expect(s.retryUntil).toBe(1_000_000 + 10 * 60_000);
    expect(s.window).toBe('7d');
  });

  it('falls back to default 5min when neither resetAt nor retryAfterSec given', () => {
    markClaudeOAuthThrottled({ reason: 'unknown', now: 2_000_000 });
    const s = getClaudeOAuthThrottleState()!;
    expect(s.retryUntil).toBe(2_000_000 + 5 * 60_000);
  });

  it('ignores resetAt in the past, falls through to retryAfterSec', () => {
    markClaudeOAuthThrottled({
      reason: 'stale_reset',
      retryAfterSec: 30,
      resetAt: 999, // earlier than now
      now: 5_000,
    });
    const s = getClaudeOAuthThrottleState()!;
    expect(s.retryUntil).toBe(5_000 + 30_000);
  });

  it('clearClaudeOAuthThrottle resets state', () => {
    markClaudeOAuthThrottled({ reason: 'x', now: 0 });
    expect(isClaudeOAuthThrottled(0)).toBe(true);
    clearClaudeOAuthThrottle();
    expect(isClaudeOAuthThrottled(0)).toBe(false);
  });

  it('getClaudeOAuthThrottleState reports full shape', () => {
    markClaudeOAuthThrottled({
      reason: 'header_throttled_5h',
      resetAt: 10_000 + 60_000,
      window: '5h',
      now: 10_000,
    });
    const s = getClaudeOAuthThrottleState()!;
    expect(s.reason).toBe('header_throttled_5h');
    expect(s.throttledAt).toBe(10_000);
    expect(s.retryUntil).toBe(10_000 + 60_000);
    expect(s.window).toBe('5h');
  });
});
