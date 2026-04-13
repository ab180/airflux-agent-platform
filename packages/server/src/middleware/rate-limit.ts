import { createMiddleware } from 'hono/factory';
import type { Context, Next } from 'hono';

/**
 * In-memory sliding window rate limiter.
 * No Redis needed — suitable for single-instance Phase 0-1.
 * For production (multi-instance), replace with Redis-based limiter.
 */

interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

// Cleanup old entries every 5 minutes (unref to not block process exit)
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    entry.timestamps = entry.timestamps.filter(t => now - t < 120_000);
    if (entry.timestamps.length === 0) store.delete(key);
  }
}, 300_000);
cleanupTimer.unref();

export function rateLimit(opts: {
  windowMs?: number;
  max?: number;
  keyFn?: (c: Context) => string;
} = {}) {
  const windowMs = opts.windowMs || 60_000; // 1 minute default
  const max = opts.max || 60; // 60 requests per window default

  return createMiddleware(async (c: Context, next: Next) => {
    const key = opts.keyFn
      ? opts.keyFn(c)
      : c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'anonymous';

    const now = Date.now();
    let entry = store.get(key);
    if (!entry) {
      entry = { timestamps: [] };
      store.set(key, entry);
    }

    // Remove timestamps outside the window
    entry.timestamps = entry.timestamps.filter(t => now - t < windowMs);

    if (entry.timestamps.length >= max) {
      const retryAfter = Math.ceil((entry.timestamps[0] + windowMs - now) / 1000);
      c.header('X-RateLimit-Limit', String(max));
      c.header('X-RateLimit-Remaining', '0');
      c.header('X-RateLimit-Reset', String(Math.ceil((now + retryAfter * 1000) / 1000)));
      c.header('Retry-After', String(retryAfter));
      return c.json({
        success: false,
        error: `Rate limit exceeded. Max ${max} requests per ${windowMs / 1000}s. Retry after ${retryAfter}s.`,
      }, 429);
    }

    entry.timestamps.push(now);

    // Set rate limit headers
    c.header('X-RateLimit-Limit', String(max));
    c.header('X-RateLimit-Remaining', String(max - entry.timestamps.length));

    await next();
  });
}
