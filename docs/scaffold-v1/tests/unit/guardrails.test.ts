import { describe, it, expect } from 'vitest';
import { runGuardrails, GuardrailContext } from '../../src/core/guardrails';

const defaultContext: GuardrailContext = {
  userId: 'U_TEST',
  userRole: 'analyst',
};

describe('Guardrails', () => {
  describe('read-only', () => {
    it('should block DELETE statements', () => {
      const result = runGuardrails('DELETE FROM events.raw_events', defaultContext);
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('DELETE');
    });

    it('should block DROP TABLE', () => {
      const result = runGuardrails('DROP TABLE events.raw_events', defaultContext);
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('DROP');
    });

    it('should block INSERT', () => {
      const result = runGuardrails("INSERT INTO events VALUES ('a')", defaultContext);
      expect(result.pass).toBe(false);
    });

    it('should allow SELECT statements', () => {
      const result = runGuardrails('SELECT * FROM events.daily_active_users LIMIT 10', defaultContext);
      expect(result.pass).toBe(true);
    });

    it('should not false-positive on CREATED_AT column', () => {
      const result = runGuardrails('SELECT created_at FROM apps LIMIT 10', defaultContext);
      expect(result.pass).toBe(true);
    });
  });

  describe('time-range', () => {
    it('should block queries exceeding 90 days', () => {
      const sql = "SELECT * FROM events WHERE date >= DATEADD(day, -180, CURRENT_DATE()) LIMIT 100";
      const result = runGuardrails(sql, defaultContext);
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('90일');
    });

    it('should allow queries within 90 days', () => {
      const sql = "SELECT * FROM events WHERE date >= DATEADD(day, -30, CURRENT_DATE()) LIMIT 100";
      const result = runGuardrails(sql, defaultContext);
      expect(result.pass).toBe(true);
    });
  });

  describe('row-limit', () => {
    it('should fail non-aggregation queries without LIMIT', () => {
      const sql = "SELECT user_id FROM events.raw_events WHERE date >= DATEADD(day, -7, CURRENT_DATE())";
      const result = runGuardrails(sql, defaultContext);
      // autoFix should add LIMIT
      expect(result.autoFix).toContain('LIMIT 1000');
    });

    it('should allow aggregation queries without LIMIT', () => {
      const sql = "SELECT date, COUNT(*) FROM events GROUP BY date";
      const result = runGuardrails(sql, defaultContext);
      expect(result.pass).toBe(true);
    });

    it('should block excessive LIMIT', () => {
      const sql = "SELECT * FROM events WHERE date >= DATEADD(day, -7, CURRENT_DATE()) LIMIT 50000";
      const result = runGuardrails(sql, defaultContext);
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('너무 큽니다');
    });
  });

  describe('pii-filter', () => {
    it('should block direct email access', () => {
      const sql = "SELECT email FROM users LIMIT 10";
      const result = runGuardrails(sql, defaultContext);
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('개인정보');
    });

    it('should allow COUNT of email', () => {
      const sql = "SELECT COUNT(DISTINCT email) FROM users";
      const result = runGuardrails(sql, defaultContext);
      expect(result.pass).toBe(true);
    });

    it('should block phone column', () => {
      const sql = "SELECT phone FROM users LIMIT 10";
      const result = runGuardrails(sql, defaultContext);
      expect(result.pass).toBe(false);
    });
  });

  describe('combined', () => {
    it('should pass a well-formed query', () => {
      const sql = `
        SELECT date, app_name, dau
        FROM events.daily_active_users
        WHERE date >= DATEADD(day, -7, CURRENT_DATE())
          AND app_name = 'coupang'
        ORDER BY date
      `;
      const result = runGuardrails(sql, defaultContext);
      expect(result.pass).toBe(true);
    });

    it('should catch SQL injection attempts', () => {
      const sql = "SELECT * FROM events WHERE app_name = 'x'; DROP TABLE events;--' LIMIT 10";
      const result = runGuardrails(sql, defaultContext);
      expect(result.pass).toBe(false);
    });
  });
});
