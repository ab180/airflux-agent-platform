import { beforeEach, describe, expect, it } from 'vitest';
import {
  markCodexThrottled,
  clearCodexThrottle,
  isCodexThrottled,
  getCodexThrottleState,
} from '../llm/codex-throttle.js';

describe('codex throttle', () => {
  beforeEach(() => clearCodexThrottle());

  it('starts not throttled', () => {
    expect(isCodexThrottled(Date.now())).toBe(false);
    expect(getCodexThrottleState()).toBeNull();
  });

  it('mark then check', () => {
    markCodexThrottled({ reason: 'rate_limit_error', retryAfterSec: 60, now: 1_000_000 });
    expect(isCodexThrottled(1_000_000)).toBe(true);
    expect(isCodexThrottled(1_000_000 + 59_000)).toBe(true);
    expect(isCodexThrottled(1_000_000 + 61_000)).toBe(false); // expired
  });

  it('defaults retryAfter to 5 minutes when header missing', () => {
    markCodexThrottled({ reason: 'quota_exceeded', now: 1_000_000 });
    const state = getCodexThrottleState()!;
    expect(state.retryUntil).toBe(1_000_000 + 5 * 60_000);
  });

  it('clearCodexThrottle resets state', () => {
    markCodexThrottled({ reason: 'x', now: 0 });
    expect(isCodexThrottled(0)).toBe(true);
    clearCodexThrottle();
    expect(isCodexThrottled(0)).toBe(false);
  });

  it('getCodexThrottleState reports reason + since', () => {
    markCodexThrottled({ reason: 'rate_limit_error', retryAfterSec: 30, now: 5_000 });
    const s = getCodexThrottleState()!;
    expect(s.reason).toBe('rate_limit_error');
    expect(s.throttledAt).toBe(5_000);
    expect(s.retryUntil).toBe(5_000 + 30_000);
  });
});
