/**
 * Environment detection layer — single source of truth for local vs production.
 *
 * Every credential / storage / auth adapter selection MUST route through this
 * module. No other file should read AWS_LAMBDA_FUNCTION_NAME, AGENT_API_URL,
 * or DATABASE_URL directly for mode-switching decisions.
 *
 * See docs/local-vs-prod-matrix.md for the full matrix and the rule about
 * adding new subsystems.
 */

export type EnvironmentMode = 'local' | 'production';
export type CredentialStrategy = 'claude-code' | 'bedrock' | 'internal-api';
export type StorageStrategy = 'sqlite' | 'postgres';
export type AuthStrategy = 'nextauth-google' | 'oidc' | 'shared-secret';

export interface Environment {
  mode: EnvironmentMode;
  credentialStrategy: CredentialStrategy;
  storageStrategy: StorageStrategy;
  authStrategy: AuthStrategy;
}

export function detectEnvironment(): Environment {
  const onLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME;
  const hasAgentApi = !!process.env.AGENT_API_URL;
  const hasDatabaseUrl = !!process.env.DATABASE_URL;

  const mode: EnvironmentMode = onLambda || hasAgentApi ? 'production' : 'local';

  let credentialStrategy: CredentialStrategy;
  if (mode === 'production') {
    credentialStrategy = hasAgentApi ? 'internal-api' : 'bedrock';
  } else {
    credentialStrategy = 'claude-code';
  }

  const storageStrategy: StorageStrategy = hasDatabaseUrl ? 'postgres' : 'sqlite';
  const authStrategy: AuthStrategy = 'nextauth-google';

  return { mode, credentialStrategy, storageStrategy, authStrategy };
}

let cached: Environment | null = null;

export function getEnvironment(): Environment {
  if (!cached) cached = detectEnvironment();
  return cached;
}

export function resetEnvironmentCache(): void {
  cached = null;
}
