import { beforeEach, describe, expect, it } from 'vitest';
import { signTrustedUser, verifyTrustedUserHeaders } from '../security/trusted-user.js';

describe('trusted user headers', () => {
  beforeEach(() => {
    process.env.DASHBOARD_PROXY_SECRET = 'test-proxy-secret';
  });

  it('verifies signed headers', () => {
    const timestamp = Date.now().toString();
    const headers = new Headers({
      'x-airflux-user-id': 'alice@example.com',
      'x-airflux-user-ts': timestamp,
      'x-airflux-user-sig': signTrustedUser('alice@example.com', timestamp),
    });

    expect(verifyTrustedUserHeaders(headers)).toBe('alice@example.com');
  });

  it('rejects invalid signature', () => {
    const headers = new Headers({
      'x-airflux-user-id': 'alice@example.com',
      'x-airflux-user-ts': Date.now().toString(),
      'x-airflux-user-sig': 'bad-signature',
    });

    expect(verifyTrustedUserHeaders(headers)).toBeNull();
  });
});
