import { describe, expect, it } from 'vitest';
import { evaluateCodexAuth } from '../llm/codex-auth.js';

describe('evaluateCodexAuth', () => {
  it('returns unavailable when file missing', () => {
    const r = evaluateCodexAuth({ authFile: null, apiKeyEnv: null, now: 0 });
    expect(r.available).toBe(false);
    expect(r.source).toBe('none');
    expect(r.hint).toContain('codex login');
  });

  it('returns available via api-key env', () => {
    const r = evaluateCodexAuth({
      authFile: null,
      apiKeyEnv: 'sk-proj-abc',
      now: Date.now(),
    });
    expect(r.available).toBe(true);
    expect(r.source).toBe('openai-api-key');
  });

  it('returns available via ChatGPT OAuth when tokens present', () => {
    const r = evaluateCodexAuth({
      authFile: {
        auth_mode: 'ChatGPT',
        tokens: {
          access_token: 'eyJ…',
          refresh_token: 'rt_…',
          account_id: 'acc_1',
        },
        last_refresh: new Date().toISOString(),
      },
      apiKeyEnv: null,
      now: Date.now(),
    });
    expect(r.available).toBe(true);
    expect(r.source).toBe('codex-chatgpt-oauth');
    expect(r.accountId).toBe('acc_1');
  });

  it('flags stale refresh warning when last_refresh is old', () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString();
    const r = evaluateCodexAuth({
      authFile: {
        auth_mode: 'ChatGPT',
        tokens: { access_token: 'x', refresh_token: 'y', account_id: 'a' },
        last_refresh: tenDaysAgo,
      },
      apiKeyEnv: null,
      now: Date.now(),
    });
    expect(r.available).toBe(true);
    expect(r.daysSinceRefresh).toBeGreaterThanOrEqual(9);
    expect(r.hint).toBeDefined();
  });

  it('prefers api-key over oauth in source when both present', () => {
    const r = evaluateCodexAuth({
      authFile: {
        auth_mode: 'ApiKey',
        tokens: { access_token: '', refresh_token: '', account_id: '' },
        OPENAI_API_KEY: 'sk-file',
      },
      apiKeyEnv: 'sk-env',
      now: Date.now(),
    });
    expect(r.source).toBe('openai-api-key');
  });
});
