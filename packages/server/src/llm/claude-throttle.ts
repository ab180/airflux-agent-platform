/**
 * Claude OAuth throttle state — observed from 429 / 402 responses or from
 * Anthropic's `anthropic-ratelimit-unified-*-status: throttled` headers.
 *
 * Symmetric to codex-throttle.ts: once we see the Max subscription pool is
 * exhausted, mark Claude OAuth as unavailable for a cool-down window and
 * let the router steer new requests to ANTHROPIC_API_KEY or Codex until
 * the window elapses.
 *
 * Unlike Codex, Anthropic ships the precise reset timestamp in response
 * headers, so we prefer that over a fixed cool-down. Priority:
 *   resetAt (from header) > retryAfterSec (from 429 Retry-After) > default 5min.
 */

export interface ClaudeOAuthThrottleState {
  reason: string;
  throttledAt: number;
  retryUntil: number;
  window?: '5h' | '7d';
}

const DEFAULT_RETRY_MS = 5 * 60_000;

let state: ClaudeOAuthThrottleState | null = null;

export interface MarkInput {
  reason: string;
  retryAfterSec?: number;
  resetAt?: number;
  window?: '5h' | '7d';
  now: number;
}

export function markClaudeOAuthThrottled(input: MarkInput): void {
  let retryUntil: number;
  if (typeof input.resetAt === 'number' && input.resetAt > input.now) {
    retryUntil = input.resetAt;
  } else if (typeof input.retryAfterSec === 'number') {
    retryUntil = input.now + Math.max(0, input.retryAfterSec) * 1000;
  } else {
    retryUntil = input.now + DEFAULT_RETRY_MS;
  }
  state = {
    reason: input.reason,
    throttledAt: input.now,
    retryUntil,
    ...(input.window ? { window: input.window } : {}),
  };
}

export function clearClaudeOAuthThrottle(): void {
  state = null;
}

export function isClaudeOAuthThrottled(now: number): boolean {
  if (!state) return false;
  if (now > state.retryUntil) {
    state = null;
    return false;
  }
  return true;
}

export function getClaudeOAuthThrottleState(): ClaudeOAuthThrottleState | null {
  return state;
}
