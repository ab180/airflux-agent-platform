import { createMiddleware } from 'hono/factory';
import type { Context, Next } from 'hono';

/**
 * Response timing middleware.
 * Adds Server-Timing header with processing duration.
 */
export const serverTiming = createMiddleware(async (c: Context, next: Next) => {
  const start = performance.now();
  await next();
  const duration = performance.now() - start;
  c.header('Server-Timing', `total;dur=${duration.toFixed(1)}`);
});
