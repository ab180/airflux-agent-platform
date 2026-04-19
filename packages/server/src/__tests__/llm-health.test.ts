import { describe, expect, it } from 'vitest';
import { evaluateLLMHealth } from '../llm/health.js';

const NOW = 1_800_000_000_000; // arbitrary fixed "now"
const HOUR_MS = 3_600_000;

describe('evaluateLLMHealth', () => {
  it('healthy when ANTHROPIC_API_KEY is set (direct API)', () => {
    const r = evaluateLLMHealth(
      { apiKey: 'sk-ant-xxx', authTokenPresent: false, creds: null, now: NOW },
    );
    expect(r.healthy).toBe(true);
    expect(r.source).toBe('api-key');
    expect(r.expired).toBe(false);
  });

  it('unknown-health when only env ANTHROPIC_AUTH_TOKEN is present (cannot verify)', () => {
    const r = evaluateLLMHealth({
      apiKey: null,
      authTokenPresent: true,
      creds: null,
      now: NOW,
    });
    // We cannot tell if the env token is fresh — treat as "healthy but unverified".
    expect(r.healthy).toBe(true);
    expect(r.source).toBe('env-auth-token');
    expect(r.verified).toBe(false);
  });

  it('healthy + verified when credentials.json is present and not expired', () => {
    const r = evaluateLLMHealth({
      apiKey: null,
      authTokenPresent: false,
      creds: { accessToken: 't', expiresAt: NOW + 2 * HOUR_MS },
      now: NOW,
    });
    expect(r.healthy).toBe(true);
    expect(r.source).toBe('claude-oauth');
    expect(r.verified).toBe(true);
    expect(r.expired).toBe(false);
  });

  it('unhealthy + expired when credentials.json is past expiresAt', () => {
    const r = evaluateLLMHealth({
      apiKey: null,
      authTokenPresent: false,
      creds: { accessToken: 't', expiresAt: NOW - 10 * HOUR_MS },
      now: NOW,
    });
    expect(r.healthy).toBe(false);
    expect(r.expired).toBe(true);
    expect(r.hoursExpired).toBeGreaterThan(9);
    expect(r.source).toBe('claude-oauth');
  });

  it('unhealthy none when no source at all', () => {
    const r = evaluateLLMHealth({
      apiKey: null,
      authTokenPresent: false,
      creds: null,
      now: NOW,
    });
    expect(r.healthy).toBe(false);
    expect(r.source).toBe('none');
  });

  it('treats near-expiry (< 60s) as expired', () => {
    const r = evaluateLLMHealth({
      apiKey: null,
      authTokenPresent: false,
      creds: { accessToken: 't', expiresAt: NOW + 30_000 },
      now: NOW,
    });
    expect(r.healthy).toBe(false);
    expect(r.expired).toBe(true);
  });
});
