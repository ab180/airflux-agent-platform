/**
 * Codex throttle state — observed from 429 / quota responses.
 *
 * The ChatGPT Codex backend does not ship Anthropic-style unified-rate
 * headers per response, and /api/codex/usage is gated behind a login
 * splash rather than returning JSON. Policy: detect throttling via HTTP
 * status + error body, mark Codex as unavailable for a cool-down window,
 * and let the router steer every new request to Claude until the window
 * elapses. Symmetric to how Claude falls back to ANTHROPIC_API_KEY when
 * its 5h utilization crosses the threshold — both live in the same
 * "observe + route" story.
 */

export interface CodexThrottleState {
  reason: string;
  throttledAt: number;
  retryUntil: number;
}

const DEFAULT_RETRY_MS = 5 * 60_000;

let state: CodexThrottleState | null = null;

export interface MarkInput {
  reason: string;
  retryAfterSec?: number;
  now: number;
}

export function markCodexThrottled(input: MarkInput): void {
  const retryMs = typeof input.retryAfterSec === 'number'
    ? Math.max(0, input.retryAfterSec) * 1000
    : DEFAULT_RETRY_MS;
  state = {
    reason: input.reason,
    throttledAt: input.now,
    retryUntil: input.now + retryMs,
  };
}

export function clearCodexThrottle(): void {
  state = null;
}

export function isCodexThrottled(now: number): boolean {
  if (!state) return false;
  if (now > state.retryUntil) {
    state = null;
    return false;
  }
  return true;
}

export function getCodexThrottleState(): CodexThrottleState | null {
  return state;
}
