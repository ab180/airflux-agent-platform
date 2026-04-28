import { describe, it, expect } from 'vitest';
import {
  piiFilter,
  readOnlySql,
  queryLength,
  rowLimit,
  outputSanitizer,
} from '../guardrails/built-in.js';
import type { GuardrailInput } from '../guardrails/types.js';

const make = (
  text: string,
  type: GuardrailInput['type'],
  metadata?: Record<string, unknown>,
): GuardrailInput => ({ text, type, metadata });

describe('built-in guardrails — coverage gaps', () => {
  describe('queryLength', () => {
    it('passes a short query under the default limit', () => {
      const result = queryLength.check(make('hello', 'input'));
      expect(result.pass).toBe(true);
      expect(result.guardrail).toBe('query-length');
    });

    it('blocks a query exceeding the default 5000 char limit', () => {
      const text = 'a'.repeat(5001);
      const result = queryLength.check(make(text, 'input'));
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('5000');
    });

    it('honors a custom maxLength via metadata', () => {
      const result = queryLength.check(make('abcdefghij', 'input', { maxLength: 5 }));
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('5');
    });

    it('treats exactly maxLength as passing (boundary)', () => {
      const result = queryLength.check(make('abcde', 'input', { maxLength: 5 }));
      expect(result.pass).toBe(true);
    });

    it('falls back to default limit when metadata.maxLength is missing', () => {
      const text = 'x'.repeat(5000);
      const result = queryLength.check(make(text, 'input', {}));
      expect(result.pass).toBe(true);
    });

    it('applies regardless of input.type', () => {
      const text = 'y'.repeat(11);
      const result = queryLength.check(make(text, 'sql', { maxLength: 10 }));
      expect(result.pass).toBe(false);
    });
  });

  describe('outputSanitizer', () => {
    it('skips inputs that are not type=output', () => {
      const apiKey = 'sk-' + 'a'.repeat(32);
      expect(outputSanitizer.check(make(apiKey, 'input')).pass).toBe(true);
      expect(outputSanitizer.check(make(apiKey, 'sql')).pass).toBe(true);
    });

    it('blocks Anthropic/OpenAI-style API keys (sk-...)', () => {
      const result = outputSanitizer.check(make('token sk-' + 'a'.repeat(32), 'output'));
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('API');
    });

    it('blocks AWS access key IDs (AKIA...)', () => {
      const result = outputSanitizer.check(make('key=AKIA' + 'B'.repeat(16), 'output'));
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('API');
    });

    it('blocks GitHub personal access tokens (ghp_...)', () => {
      const result = outputSanitizer.check(make('ghp_' + 'c'.repeat(36), 'output'));
      expect(result.pass).toBe(false);
    });

    it('blocks internal corporate URLs (.internal/.local/.corp/.private)', () => {
      for (const host of ['app.internal', 'svc.local', 'admin.corp', 'db.private']) {
        const result = outputSanitizer.check(make(`see https://${host}/x`, 'output'));
        expect(result.pass).toBe(false);
        expect(result.reason).toContain('내부');
      }
    });

    it('blocks DB connection strings with credentials', () => {
      for (const conn of [
        'postgres://user:pw@host:5432/db',
        'mysql://u:p@h/d',
        'mongodb://u:p@cluster/db',
        'redis://u:p@host:6379',
      ]) {
        const result = outputSanitizer.check(make(conn, 'output'));
        expect(result.pass).toBe(false);
        expect(result.reason).toContain('연결');
      }
    });

    it('blocks RFC 1918 internal IPs', () => {
      for (const ip of ['10.0.0.1', '192.168.1.1', '172.16.5.5', '172.31.99.99']) {
        const result = outputSanitizer.check(make(`host=${ip}`, 'output'));
        expect(result.pass).toBe(false);
        expect(result.reason).toContain('내부 IP');
      }
    });

    it('does not flag public IPs (e.g. 8.8.8.8, 172.15.x outside RFC 1918)', () => {
      expect(outputSanitizer.check(make('host=8.8.8.8', 'output')).pass).toBe(true);
      expect(outputSanitizer.check(make('host=172.15.0.1', 'output')).pass).toBe(true);
      expect(outputSanitizer.check(make('host=172.32.0.1', 'output')).pass).toBe(true);
    });

    it('blocks JWT-shaped tokens', () => {
      const jwt = 'eyJ' + 'a'.repeat(30) + '.eyJ' + 'b'.repeat(30) + '.' + 'c'.repeat(30);
      const result = outputSanitizer.check(make(`auth=${jwt}`, 'output'));
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('JWT');
    });

    it('passes clean responses', () => {
      const result = outputSanitizer.check(make('Yesterday DAU was 12,345.', 'output'));
      expect(result.pass).toBe(true);
      expect(result.guardrail).toBe('output-sanitizer');
    });
  });

  describe('piiFilter — email coverage gap', () => {
    it('blocks email addresses (no existing test covered this)', () => {
      const result = piiFilter.check(make('contact me at user@example.com', 'input'));
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('이메일');
    });

    it('also runs on output and sql types (not gated by type)', () => {
      expect(piiFilter.check(make('a@b.co', 'output')).pass).toBe(false);
      expect(piiFilter.check(make('a@b.co', 'sql')).pass).toBe(false);
    });
  });

  describe('readOnlySql — branch coverage', () => {
    it('detects writes case-insensitively', () => {
      expect(readOnlySql.check(make('insert into t values(1)', 'sql')).pass).toBe(false);
      expect(readOnlySql.check(make('Update t set x=1', 'sql')).pass).toBe(false);
      expect(readOnlySql.check(make('TRUNCATE t', 'sql')).pass).toBe(false);
    });

    it('flags bare INTO clauses (e.g. SELECT … INTO new_table)', () => {
      const result = readOnlySql.check(make('SELECT * INTO bak FROM t LIMIT 1', 'sql'));
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('INTO');
    });

    it('does not flag the substring "create" inside an identifier', () => {
      const result = readOnlySql.check(make('SELECT created_at FROM t LIMIT 1', 'sql'));
      expect(result.pass).toBe(true);
    });
  });

  describe('rowLimit — branch coverage', () => {
    it('skips non-sql types', () => {
      expect(rowLimit.check(make('hello', 'input')).pass).toBe(true);
      expect(rowLimit.check(make('hello', 'output')).pass).toBe(true);
    });

    it('matches LIMIT case-insensitively', () => {
      expect(rowLimit.check(make('select * from t limit 10', 'sql')).pass).toBe(true);
    });
  });
});
