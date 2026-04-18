/**
 * Role-based access control middleware.
 *
 * Reads the caller's role from Hono context (c.get('role')) and rejects
 * with 403 if it doesn't meet the required role. Role source is deliberately
 * decoupled from this middleware — an upstream middleware (e.g. trusted-user
 * signer, SSO adapter, or dev-mode defaulter) must set c.set('role', ...).
 *
 * Role hierarchy: admin > user. Routes that require 'user' accept 'admin' too.
 */

import { createMiddleware } from 'hono/factory';

export type Role = 'admin' | 'user';

export function rbac(required: Role) {
  return createMiddleware(async (c, next) => {
    const role = c.get('role') as Role | undefined;
    const ok = role === required || (required === 'user' && role === 'admin');
    if (!ok) {
      return c.json({ success: false, error: 'Forbidden' }, 403);
    }
    await next();
  });
}
