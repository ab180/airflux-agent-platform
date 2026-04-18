import { createHmac, timingSafeEqual } from 'crypto';

const HEADER_USER_ID = 'x-airflux-user-id';
const HEADER_TIMESTAMP = 'x-airflux-user-ts';
const HEADER_SIGNATURE = 'x-airflux-user-sig';
const HEADER_ROLE = 'x-airflux-user-role';
const MAX_SKEW_MS = 5 * 60 * 1000;

export type TrustedRole = 'admin' | 'user';

export interface TrustedUser {
  userId: string;
  role: TrustedRole | null;
}

function getSecret(): string | null {
  return process.env.DASHBOARD_PROXY_SECRET || process.env.ADMIN_API_KEY || null;
}

function buildPayload(userId: string, timestamp: string, role?: string): string {
  // v1 (no role): `${userId}.${timestamp}` — backward compatible.
  // v2 (with role): `${userId}.${role}.${timestamp}` — role is covered by
  // HMAC so a client cannot add a role header after signing.
  return role ? `${userId}.${role}.${timestamp}` : `${userId}.${timestamp}`;
}

export function signTrustedUser(userId: string, timestamp: string, role?: string): string {
  const secret = getSecret();
  if (!secret) throw new Error('DASHBOARD_PROXY_SECRET or ADMIN_API_KEY must be set');
  return createHmac('sha256', secret).update(buildPayload(userId, timestamp, role)).digest('hex');
}

function isValidRole(v: string | null): v is TrustedRole {
  return v === 'admin' || v === 'user';
}

function checkSignature(expected: string, provided: string): boolean {
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

/**
 * Verify trusted user HMAC headers and return the full identity.
 * - Returns { userId, role } when signatures match.
 * - role is null when the v1 format (no role header) was used.
 * - If a role header is present, it MUST be covered by the HMAC;
 *   otherwise verification fails (prevents role-spoofing).
 */
export function verifyTrustedUserHeadersFull(headers: Headers): TrustedUser | null {
  const userId = headers.get(HEADER_USER_ID);
  const timestamp = headers.get(HEADER_TIMESTAMP);
  const signature = headers.get(HEADER_SIGNATURE);
  const roleHeader = headers.get(HEADER_ROLE);
  if (!userId || !timestamp || !signature) return null;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return null;
  if (Math.abs(Date.now() - ts) > MAX_SKEW_MS) return null;

  if (roleHeader !== null) {
    if (!isValidRole(roleHeader)) return null;
    const expected = signTrustedUser(userId, timestamp, roleHeader);
    if (!checkSignature(expected, signature)) return null;
    return { userId, role: roleHeader };
  }

  const expected = signTrustedUser(userId, timestamp);
  if (!checkSignature(expected, signature)) return null;
  return { userId, role: null };
}

/** Back-compat: returns just userId. */
export function verifyTrustedUserHeaders(headers: Headers): string | null {
  return verifyTrustedUserHeadersFull(headers)?.userId ?? null;
}

export function resolveTrustedUserId(headers: Headers, fallback = 'anonymous'): string {
  return verifyTrustedUserHeaders(headers) || fallback;
}

export function requireTrustedUserId(headers: Headers): string | null {
  return verifyTrustedUserHeaders(headers);
}
