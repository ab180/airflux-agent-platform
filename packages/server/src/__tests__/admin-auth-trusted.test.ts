import { beforeEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { adminAuth, trustedUserContext } from '../middleware/security.js';
import { signTrustedUser } from '../security/trusted-user.js';

function makeApp() {
  const app = new Hono();
  app.use('*', trustedUserContext);
  app.use('/admin/*', adminAuth);
  app.get('/admin/ping', (c) => {
    const role = c.get('role') as string | undefined;
    const userId = c.get('userId') as string | undefined;
    return c.json({ ok: true, role, userId });
  });
  return app;
}

describe('adminAuth — multi-credential', () => {
  beforeEach(() => {
    process.env.DASHBOARD_PROXY_SECRET = 'test-secret';
    process.env.ADMIN_API_KEY = 'legacy-admin-key';
    process.env.NODE_ENV = 'production';
  });

  it('accepts legacy ADMIN_API_KEY via x-admin-key header', async () => {
    const res = await makeApp().request('/admin/ping', {
      headers: { 'x-admin-key': 'legacy-admin-key' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.role).toBe('admin');
  });

  it('accepts trusted-user HMAC with role=admin', async () => {
    const ts = Date.now().toString();
    const sig = signTrustedUser('alice@example.com', ts, 'admin');
    const res = await makeApp().request('/admin/ping', {
      headers: {
        'x-airflux-user-id': 'alice@example.com',
        'x-airflux-user-ts': ts,
        'x-airflux-user-sig': sig,
        'x-airflux-user-role': 'admin',
      },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.role).toBe('admin');
    expect(body.userId).toBe('alice@example.com');
  });

  it('rejects trusted-user HMAC with role=user', async () => {
    const ts = Date.now().toString();
    const sig = signTrustedUser('bob@example.com', ts, 'user');
    const res = await makeApp().request('/admin/ping', {
      headers: {
        'x-airflux-user-id': 'bob@example.com',
        'x-airflux-user-ts': ts,
        'x-airflux-user-sig': sig,
        'x-airflux-user-role': 'user',
      },
    });
    expect(res.status).toBe(401);
  });

  it('rejects when neither credential is provided', async () => {
    const res = await makeApp().request('/admin/ping');
    expect(res.status).toBe(401);
  });

  it('rejects role spoofing (v1 sig with added role=admin header)', async () => {
    const ts = Date.now().toString();
    // Sign without role (v1 format), then attacker adds admin role header.
    const sig = signTrustedUser('carol@example.com', ts);
    const res = await makeApp().request('/admin/ping', {
      headers: {
        'x-airflux-user-id': 'carol@example.com',
        'x-airflux-user-ts': ts,
        'x-airflux-user-sig': sig,
        'x-airflux-user-role': 'admin',
      },
    });
    expect(res.status).toBe(401);
  });
});
