import { createMiddleware } from 'hono/factory';
import type { Context, Next } from 'hono';
import { timingSafeEqual } from 'crypto';

/**
 * Security headers middleware.
 * Prevents MIME sniffing, clickjacking, and enforces HTTPS referrer policy.
 */
export const securityHeaders = createMiddleware(async (c: Context, next: Next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('X-XSS-Protection', '0');
  c.header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'");
  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
});

/**
 * Request ID middleware. Adds a unique ID to each request for audit logging.
 */
export const requestId = createMiddleware(async (c: Context, next: Next) => {
  const id = c.req.header('x-request-id') || crypto.randomUUID();
  c.set('requestId', id);
  await next();
  c.header('X-Request-Id', id);
});

/**
 * Body size limit check. Rejects bodies larger than maxBytes.
 */
export function bodyLimit(maxBytes: number) {
  return createMiddleware(async (c: Context, next: Next) => {
    const contentLength = c.req.header('content-length');
    if (contentLength && parseInt(contentLength, 10) > maxBytes) {
      return c.json({ success: false, error: 'Request body too large' }, 413);
    }
    await next();
  });
}

/** Constant-time string comparison to prevent timing attacks. */
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Admin auth guard.
 * In Phase 0, uses a simple API key from env. Later: SSO/JWT.
 */
export const adminAuth = createMiddleware(async (c: Context, next: Next) => {
  const adminKey = process.env.ADMIN_API_KEY;

  // If no key configured, allow access in development
  if (!adminKey) {
    if (process.env.NODE_ENV === 'production') {
      return c.json({ success: false, error: 'Admin API key not configured' }, 500);
    }
    await next();
    return;
  }

  const authHeader = c.req.header('authorization');
  const providedKey = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : c.req.header('x-admin-key');

  if (!providedKey || !safeCompare(providedKey, adminKey)) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }

  await next();
});
