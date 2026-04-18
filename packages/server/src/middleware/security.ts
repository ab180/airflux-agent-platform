import { createMiddleware } from 'hono/factory';
import type { Context, Next } from 'hono';
import { timingSafeEqual } from 'crypto';
import { verifyTrustedUserHeadersFull } from '../security/trusted-user.js';

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
 * Populate userId + role from a trusted-user HMAC if present.
 * Never rejects — downstream middleware decides policy. Safe to apply broadly.
 */
export const trustedUserContext = createMiddleware(async (c: Context, next: Next) => {
  const identity = verifyTrustedUserHeadersFull(new Headers(c.req.raw.headers));
  if (identity) {
    c.set('userId', identity.userId);
    if (identity.role) c.set('role', identity.role);
  }
  await next();
});

/**
 * Admin auth guard.
 * Accepts either:
 *   1. ADMIN_API_KEY shared secret (legacy / machine-to-machine), OR
 *   2. Trusted-user HMAC with role='admin' (dashboard-signed per-user).
 * Sets c.set('role', 'admin') on success so downstream rbac middlewares agree.
 * Phase 2: replace with SSO/JWT.
 */
export const adminAuth = createMiddleware(async (c: Context, next: Next) => {
  const adminKey = process.env.ADMIN_API_KEY;

  // If no key configured, allow access in development.
  if (!adminKey) {
    if (process.env.NODE_ENV === 'production') {
      return c.json({ success: false, error: 'Admin API key not configured' }, 500);
    }
    c.set('role', 'admin');
    await next();
    return;
  }

  const authHeader = c.req.header('authorization');
  const providedKey = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : c.req.header('x-admin-key');

  if (providedKey && safeCompare(providedKey, adminKey)) {
    c.set('role', 'admin');
    await next();
    return;
  }

  // Fallback: trusted-user with admin role (dashboard-signed).
  const identity = verifyTrustedUserHeadersFull(new Headers(c.req.raw.headers));
  if (identity?.role === 'admin') {
    c.set('userId', identity.userId);
    c.set('role', 'admin');
    await next();
    return;
  }

  return c.json({ success: false, error: 'Unauthorized' }, 401);
});
