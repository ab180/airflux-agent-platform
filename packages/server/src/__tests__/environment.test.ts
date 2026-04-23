import { beforeEach, describe, expect, it, vi } from 'vitest';
import { detectEnvironment, resetEnvironmentCache } from '../runtime/environment.js';

describe('detectEnvironment', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    resetEnvironmentCache();
    // Clear every env var the resolver reads so isolated expectations
    // aren't poisoned by leftover stubs from neighbouring test files.
    vi.stubEnv('AIROPS_MODE', '');
    vi.stubEnv('AGENT_API_URL', '');
    vi.stubEnv('AWS_LAMBDA_FUNCTION_NAME', '');
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('NODE_ENV', 'test');
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

  describe('runMode / deployment (v2 axes)', () => {
    it('default is runMode=local, deployment=dev on a laptop', () => {
      vi.stubEnv('AGENT_API_URL', '');
      vi.stubEnv('AWS_LAMBDA_FUNCTION_NAME', '');
      vi.stubEnv('AIROPS_MODE', '');
      const env = detectEnvironment();
      expect(env.runMode).toBe('local');
      expect(env.deployment).toBe('dev');
    });

    it('AIROPS_MODE=team switches to team runMode', () => {
      vi.stubEnv('AIROPS_MODE', 'team');
      vi.stubEnv('AGENT_API_URL', '');
      vi.stubEnv('AWS_LAMBDA_FUNCTION_NAME', '');
      vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test');
      const env = detectEnvironment();
      expect(env.runMode).toBe('team');
      expect(env.credentialStrategy).toBe('api-key');
      expect(env.authStrategy).toBe('oidc');
    });

    it('team runMode without API key still sets api-key strategy (fails loud at call time)', () => {
      vi.stubEnv('AIROPS_MODE', 'team');
      vi.stubEnv('AGENT_API_URL', '');
      vi.stubEnv('AWS_LAMBDA_FUNCTION_NAME', '');
      vi.stubEnv('ANTHROPIC_API_KEY', '');
      vi.stubEnv('OPENAI_API_KEY', '');
      const env = detectEnvironment();
      expect(env.runMode).toBe('team');
      expect(env.credentialStrategy).toBe('api-key');
    });

    it('Lambda → deployment=container, runMode=team', () => {
      vi.stubEnv('AWS_LAMBDA_FUNCTION_NAME', 'airflux-agent');
      vi.stubEnv('AGENT_API_URL', '');
      const env = detectEnvironment();
      expect(env.runMode).toBe('team');
      expect(env.deployment).toBe('container');
      expect(env.credentialStrategy).toBe('bedrock');
    });

    it('legacy mode derives from runMode', () => {
      vi.stubEnv('AIROPS_MODE', 'team');
      vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test');
      expect(detectEnvironment().mode).toBe('production');

      resetEnvironmentCache();
      vi.stubEnv('AIROPS_MODE', 'local');
      expect(detectEnvironment().mode).toBe('local');
    });
  });
});
