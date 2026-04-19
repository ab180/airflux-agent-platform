import { beforeEach, describe, expect, it } from 'vitest';
import {
  signTrustedUser,
  verifyTrustedUserHeaders,
  verifyTrustedUserHeadersFull,
} from '../security/trusted-user.js';

function makeHeaders(
  userId: string,
  timestamp: string,
  signature: string,
  role?: string,
): Headers {
  const h = new Headers();
  h.set('x-airflux-user-id', userId);
  h.set('x-airflux-user-ts', timestamp);
  h.set('x-airflux-user-sig', signature);
  if (role) h.set('x-airflux-user-role', role);
  return h;
}

describe('trusted-user role extension', () => {
  beforeEach(() => {
    process.env.DASHBOARD_PROXY_SECRET = 'test-proxy-secret';
  });

  it('verifies v1 format (no role) — backward compatibility', () => {
    const ts = Date.now().toString();
    const sig = signTrustedUser('alice@example.com', ts);
    const h = makeHeaders('alice@example.com', ts, sig);
    expect(verifyTrustedUserHeaders(h)).toBe('alice@example.com');

    const full = verifyTrustedUserHeadersFull(h);
    expect(full).toEqual({ userId: 'alice@example.com', role: null });
  });

  it('verifies v2 format with role (role in HMAC payload)', () => {
    const ts = Date.now().toString();
    const sig = signTrustedUser('bob@example.com', ts, 'admin');
    const h = makeHeaders('bob@example.com', ts, sig, 'admin');

    const full = verifyTrustedUserHeadersFull(h);
    expect(full).toEqual({ userId: 'bob@example.com', role: 'admin' });
  });

  it('rejects tampered role (valid v1 sig + spoofed role header)', () => {
    const ts = Date.now().toString();
    const sig = signTrustedUser('carol@example.com', ts); // v1, no role
    // Attacker adds role=admin header without re-signing
    const h = makeHeaders('carol@example.com', ts, sig, 'admin');

    const full = verifyTrustedUserHeadersFull(h);
    // When role header is present, v2 verification kicks in — sig mismatches.
    expect(full).toBeNull();
  });

  it('rejects v2 with wrong role (role substitution attack)', () => {
    const ts = Date.now().toString();
    const sig = signTrustedUser('dan@example.com', ts, 'user');
    // Attacker changes role header after signing
    const h = makeHeaders('dan@example.com', ts, sig, 'admin');
    expect(verifyTrustedUserHeadersFull(h)).toBeNull();
  });

  it('rejects expired timestamp even with valid sig', () => {
    const oldTs = (Date.now() - 10 * 60 * 1000).toString();
    const sig = signTrustedUser('eve@example.com', oldTs, 'user');
    const h = makeHeaders('eve@example.com', oldTs, sig, 'user');
    expect(verifyTrustedUserHeadersFull(h)).toBeNull();
  });
});
