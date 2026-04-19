import { beforeEach, describe, expect, it } from 'vitest';
import { logAudit, queryAudit } from '../store/audit-log.js';
import { getDb } from '../store/db.js';

describe('audit log', () => {
  beforeEach(() => {
    try {
      getDb().exec('DELETE FROM audit_log');
    } catch {
      // table may not exist yet — logAudit will create it
    }
  });

  it('writes and reads back an event', () => {
    logAudit({
      userId: 'alice',
      action: 'admin.auth',
      resource: '/api/admin',
      outcome: 'success',
      ip: '127.0.0.1',
    });
    const { events, total } = queryAudit({ userId: 'alice' });
    expect(total).toBe(1);
    expect(events[0].action).toBe('admin.auth');
    expect(events[0].outcome).toBe('success');
    expect(events[0].resource).toBe('/api/admin');
  });

  it('filters by action', () => {
    logAudit({ userId: 'a', action: 'mcp.token.create', outcome: 'success' });
    logAudit({ userId: 'a', action: 'admin.auth', outcome: 'success' });
    logAudit({ userId: 'b', action: 'admin.auth', outcome: 'failure' });

    const auth = queryAudit({ action: 'admin.auth' });
    expect(auth.total).toBe(2);

    const failures = queryAudit({ outcome: 'failure' });
    expect(failures.total).toBe(1);
    expect(failures.events[0].userId).toBe('b');
  });

  it('preserves metadata as parsed object', () => {
    logAudit({
      userId: 'x',
      action: 'prompt.rollback',
      outcome: 'success',
      metadata: { agent: 'chief-agent', versionId: 3 },
    });
    const { events } = queryAudit({ action: 'prompt.rollback' });
    expect(events[0].metadata).toEqual({ agent: 'chief-agent', versionId: 3 });
  });

  it('returns events in descending timestamp order', () => {
    logAudit({ userId: 'u', action: 'first', outcome: 'success' });
    logAudit({ userId: 'u', action: 'second', outcome: 'success' });
    logAudit({ userId: 'u', action: 'third', outcome: 'success' });
    const { events } = queryAudit({});
    expect(events[0].action).toBe('third');
    expect(events[2].action).toBe('first');
  });

  it('swallows write errors silently (best-effort)', () => {
    // Induce a crash by passing circular metadata that JSON.stringify chokes on.
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    // Should not throw even though JSON.stringify fails.
    expect(() =>
      logAudit({
        userId: 'u',
        action: 'weird',
        outcome: 'success',
        metadata: circular,
      }),
    ).not.toThrow();
  });
});
