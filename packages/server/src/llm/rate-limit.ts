/**
 * Claude Max OAuth rate-limit observer.
 *
 * Anthropic returns per-response headers describing the subscription
 * quota state for the token that made the call:
 *
 *   anthropic-ratelimit-unified-5h-status       "allowed" | "throttled"
 *   anthropic-ratelimit-unified-5h-utilization  0.0 .. 1.0+
 *   anthropic-ratelimit-unified-5h-reset        unix seconds
 *   anthropic-ratelimit-unified-7d-*            same shape, rolling 7-day
 *
 * This module captures those headers after every LLM call, exposes the
 * latest snapshot via getRateLimitState(), and decides when the server
 * should prefer ANTHROPIC_API_KEY (if configured) over the OAuth path
 * so the user's interactive Claude Code usage doesn't compete for the
 * last bit of quota.
 */

export type RateLimitStatus = 'allowed' | 'throttled' | 'unknown';

export interface RateLimitWindow {
  status: RateLimitStatus;
  /** 0.0 .. ~1.0. Higher = closer to quota exhaustion. */
  utilization?: number;
  /** epoch ms when the quota window resets. */
  resetAt?: number;
}

export interface RateLimitState {
  fiveHour?: RateLimitWindow;
  sevenDay?: RateLimitWindow;
  /** epoch ms when this snapshot was recorded. */
  observedAt: number;
}

let state: RateLimitState | null = null;

function parseWindow(headers: Headers, prefix: string): RateLimitWindow | undefined {
  const status = headers.get(`${prefix}-status`);
  const utilization = headers.get(`${prefix}-utilization`);
  const reset = headers.get(`${prefix}-reset`);
  if (!status && !utilization && !reset) return undefined;

  let statusTyped: RateLimitStatus = 'unknown';
  if (status === 'allowed' || status === 'throttled') statusTyped = status;

  const w: RateLimitWindow = { status: statusTyped };
  if (utilization) {
    const n = Number(utilization);
    if (Number.isFinite(n)) w.utilization = n;
  }
  if (reset) {
    const n = Number(reset);
    if (Number.isFinite(n)) w.resetAt = n * 1000;
  }
  return w;
}

export function parseRateLimitHeaders(headers: Headers): Omit<RateLimitState, 'observedAt'> | null {
  const fiveHour = parseWindow(headers, 'anthropic-ratelimit-unified-5h');
  const sevenDay = parseWindow(headers, 'anthropic-ratelimit-unified-7d');
  if (!fiveHour && !sevenDay) return null;
  return {
    ...(fiveHour ? { fiveHour } : {}),
    ...(sevenDay ? { sevenDay } : {}),
  };
}

export function recordRateLimit(headers: Headers): void {
  const parsed = parseRateLimitHeaders(headers);
  if (!parsed) return;
  state = { ...parsed, observedAt: Date.now() };
}

export function getRateLimitState(): RateLimitState | null {
  return state;
}

export function resetRateLimitForTest(): void {
  state = null;
}

/**
 * Decide whether the server should route the next Anthropic call via an
 * ANTHROPIC_API_KEY (if set) instead of the OAuth subscription path.
 *
 * true when:
 *   - the most recent response reported status === 'throttled', OR
 *   - a numeric threshold was supplied AND 5h utilization crossed it.
 *
 * Threshold is OPTIONAL — pass undefined to defer to observed throttle
 * signal only (availability-first routing). Never true before we've seen
 * any response; caller decides the bootstrap behavior (typically OAuth).
 */
export function shouldPreferApiKey(utilizationThreshold: number | undefined): boolean {
  if (!state) return false;
  const fh = state.fiveHour;
  if (!fh) return false;
  if (fh.status === 'throttled') return true;
  if (
    typeof utilizationThreshold === 'number' &&
    typeof fh.utilization === 'number' &&
    fh.utilization >= utilizationThreshold
  ) {
    return true;
  }
  return false;
}
