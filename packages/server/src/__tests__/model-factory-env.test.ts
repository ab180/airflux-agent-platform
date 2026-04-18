import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getModelCredentialSource } from '../llm/model-factory.js';
import { resetEnvironmentCache } from '../runtime/environment.js';

describe('model-factory credential source (environment-aware)', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    resetEnvironmentCache();
  });

  it('uses claude-code credential in local mode', () => {
    vi.stubEnv('AGENT_API_URL', '');
    vi.stubEnv('AWS_LAMBDA_FUNCTION_NAME', '');
    expect(getModelCredentialSource()).toBe('claude-code');
  });

  it('uses internal-api in production with AGENT_API_URL', () => {
    vi.stubEnv('AGENT_API_URL', 'https://agent.internal.airbridge.io');
    expect(getModelCredentialSource()).toBe('internal-api');
  });

  it('uses bedrock in production on Lambda without AGENT_API_URL', () => {
    vi.stubEnv('AWS_LAMBDA_FUNCTION_NAME', 'airflux-agent');
    vi.stubEnv('AGENT_API_URL', '');
    expect(getModelCredentialSource()).toBe('bedrock');
  });
});
