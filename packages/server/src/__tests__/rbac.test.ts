import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { rbac, type Role } from '../middleware/rbac.js';
import { requireUserId, runWithRequestContext } from '../runtime/request-context.js';

function makeApp(role?: Role) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('userId', 'u1');
    c.set('role', role);
    await next();
  });
  app.use('/admin/*', rbac('admin'));
  app.get('/admin/things', (c) => c.text('ok'));
  app.use('/user/*', rbac('user'));
  app.get('/user/things', (c) => c.text('ok'));
  return app;
}

describe('rbac middleware', () => {
  it('allows admin on admin route', async () => {
    const res = await makeApp('admin').request('/admin/things');
    expect(res.status).toBe(200);
  });

  it('forbids user on admin route', async () => {
    const res = await makeApp('user').request('/admin/things');
    expect(res.status).toBe(403);
  });

  it('forbids missing role on admin route', async () => {
    const res = await makeApp(undefined).request('/admin/things');
    expect(res.status).toBe(403);
  });

  it('admin satisfies user-required route', async () => {
    const res = await makeApp('admin').request('/user/things');
    expect(res.status).toBe(200);
  });

  it('user satisfies user-required route', async () => {
    const res = await makeApp('user').request('/user/things');
    expect(res.status).toBe(200);
  });
});

describe('requireUserId', () => {
  it('returns userId when set', async () => {
    await runWithRequestContext(
      { userId: 'u1', sessionId: 's', source: 'test' },
      async () => {
        expect(requireUserId()).toBe('u1');
      },
    );
  });

  it('throws when context is missing entirely', () => {
    expect(() => requireUserId()).toThrow(/userId/);
  });

  it('throws when userId is empty', async () => {
    await runWithRequestContext(
      { userId: '', sessionId: 's', source: 'test' },
      async () => {
        expect(() => requireUserId()).toThrow(/userId/);
      },
    );
  });
});
