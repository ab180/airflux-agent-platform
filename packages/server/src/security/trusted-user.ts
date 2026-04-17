import { createHmac, timingSafeEqual } from 'crypto';

const HEADER_USER_ID = 'x-airflux-user-id';
const HEADER_TIMESTAMP = 'x-airflux-user-ts';
const HEADER_SIGNATURE = 'x-airflux-user-sig';
const MAX_SKEW_MS = 5 * 60 * 1000;

function getSecret(): string | null {
  return process.env.DASHBOARD_PROXY_SECRET || process.env.ADMIN_API_KEY || null;
}

function buildPayload(userId: string, timestamp: string): string {
  return `${userId}.${timestamp}`;
}

export function signTrustedUser(userId: string, timestamp: string): string {
  const secret = getSecret();
  if (!secret) throw new Error('DASHBOARD_PROXY_SECRET or ADMIN_API_KEY must be set');
  return createHmac('sha256', secret).update(buildPayload(userId, timestamp)).digest('hex');
}

export function verifyTrustedUserHeaders(headers: Headers): string | null {
  const userId = headers.get(HEADER_USER_ID);
  const timestamp = headers.get(HEADER_TIMESTAMP);
  const signature = headers.get(HEADER_SIGNATURE);
  if (!userId || !timestamp || !signature) return null;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return null;
  if (Math.abs(Date.now() - ts) > MAX_SKEW_MS) return null;

  const expected = signTrustedUser(userId, timestamp);
  if (expected.length !== signature.length) return null;
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;
  return userId;
}

export function resolveTrustedUserId(headers: Headers, fallback = 'anonymous'): string {
  return verifyTrustedUserHeaders(headers) || fallback;
}

export function requireTrustedUserId(headers: Headers): string | null {
  return verifyTrustedUserHeaders(headers);
}
