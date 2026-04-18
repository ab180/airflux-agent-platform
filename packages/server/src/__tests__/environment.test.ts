import { beforeEach, describe, expect, it, vi } from 'vitest';
import { detectEnvironment, resetEnvironmentCache } from '../runtime/environment.js';

describe('detectEnvironment', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    resetEnvironmentCache();
  });

  it('returns local when no AGENT_API_URL and no AWS_LAMBDA_FUNCTION_NAME', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('AGENT_API_URL', '');
    vi.stubEnv('AWS_LAMBDA_FUNCTION_NAME', '');
    expect(detectEnvironment().mode).toBe('local');
  });

  it('returns production when AGENT_API_URL is set', () => {
    vi.stubEnv('AGENT_API_URL', 'https://agent.internal.airbridge.io');
    const env = detectEnvironment();
    expect(env.mode).toBe('production');
    expect(env.credentialStrategy).toBe('internal-api');
  });

  it('returns production when running on Lambda (no AGENT_API_URL)', () => {
    vi.stubEnv('AWS_LAMBDA_FUNCTION_NAME', 'airflux-agent');
    vi.stubEnv('AGENT_API_URL', '');
    const env = detectEnvironment();
    expect(env.mode).toBe('production');
    expect(env.credentialStrategy).toBe('bedrock');
  });

  it('local mode uses claude-code credential strategy by default', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('AGENT_API_URL', '');
    vi.stubEnv('AWS_LAMBDA_FUNCTION_NAME', '');
    expect(detectEnvironment().credentialStrategy).toBe('claude-code');
  });

  it('local mode uses sqlite storage by default', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('AGENT_API_URL', '');
    vi.stubEnv('AWS_LAMBDA_FUNCTION_NAME', '');
    expect(detectEnvironment().storageStrategy).toBe('sqlite');
  });

  it('uses postgres when DATABASE_URL is set (production)', () => {
    vi.stubEnv('AGENT_API_URL', 'https://agent.internal.airbridge.io');
    vi.stubEnv('DATABASE_URL', 'postgres://u:p@h/db');
    expect(detectEnvironment().storageStrategy).toBe('postgres');
  });

  it('uses postgres when DATABASE_URL is set (local mode still picks pg)', () => {
    vi.stubEnv('DATABASE_URL', 'postgres://u:p@h/db');
    vi.stubEnv('AGENT_API_URL', '');
    vi.stubEnv('AWS_LAMBDA_FUNCTION_NAME', '');
    const env = detectEnvironment();
    expect(env.mode).toBe('local');
    expect(env.storageStrategy).toBe('postgres');
  });
});
