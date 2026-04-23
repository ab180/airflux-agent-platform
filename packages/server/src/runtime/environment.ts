/**
 * Environment detection layer — single source of truth for runtime mode.
 *
 * Every credential / storage / auth adapter selection MUST route through this
 * module. No other file should read AWS_LAMBDA_FUNCTION_NAME, AGENT_API_URL,
 * AIROPS_MODE, or DATABASE_URL directly for mode-switching decisions.
 *
 * Two axes (per v2 design Round 34):
 * - `runMode`   : 'local' (single-user, Keychain/file creds)
 *                 | 'team' (multi-user, API keys + RBAC required)
 * - `deployment`: 'dev' (host-native, default on laptop)
 *                 | 'container' (Docker / Lambda / K8s)
 *
 * The legacy `mode: 'local' | 'production'` is still exported for backward
 * compatibility during the migration — derived from the two new axes.
 */

export type RunMode = 'local' | 'team';
export type Deployment = 'dev' | 'container';

/** @deprecated use `runMode` + `deployment` instead. */
export type EnvironmentMode = 'local' | 'production';

export type CredentialStrategy = 'claude-code' | 'bedrock' | 'internal-api' | 'api-key';
export type StorageStrategy = 'sqlite' | 'postgres';
export type AuthStrategy = 'nextauth-google' | 'oidc' | 'shared-secret';

export interface Environment {
  runMode: RunMode;
  deployment: Deployment;
  /** Derived from `runMode`. Legacy consumers. */
  mode: EnvironmentMode;
  credentialStrategy: CredentialStrategy;
  storageStrategy: StorageStrategy;
  authStrategy: AuthStrategy;
}

function resolveRunMode(): RunMode {
  const explicit = process.env.AIROPS_MODE?.toLowerCase();
  if (explicit === 'team') return 'team';
  if (explicit === 'local') return 'local';
  // Default: team when we see production-shaped signals, otherwise local.
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) return 'team';
  if (process.env.AGENT_API_URL) return 'team';
  if (process.env.DATABASE_URL && process.env.NODE_ENV === 'production') return 'team';
  return 'local';
}

function resolveDeployment(): Deployment {
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) return 'container';
  try {
    if (process.platform === 'linux') {
      // crude container detection — only Linux containers expose /proc/1/cgroup
      // with docker/containerd/kubepods substrings. Anything else → dev.
      // We read synchronously on first call; the result is cached below.
      const { readFileSync, existsSync } = require('node:fs') as typeof import('node:fs');
      if (existsSync('/proc/1/cgroup')) {
        const cg = readFileSync('/proc/1/cgroup', 'utf-8');
        if (cg.includes('docker') || cg.includes('containerd') || cg.includes('kubepods')) {
          return 'container';
        }
      }
    }
  } catch {
    // ignore — treat as dev
  }
  return 'dev';
}

export function detectEnvironment(): Environment {
  const runMode = resolveRunMode();
  const deployment = resolveDeployment();
  const hasDatabaseUrl = !!process.env.DATABASE_URL;
  const hasAgentApi = !!process.env.AGENT_API_URL;
  const onLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME;

  let credentialStrategy: CredentialStrategy;
  if (runMode === 'team') {
    if (hasAgentApi) credentialStrategy = 'internal-api';
    else if (onLambda) credentialStrategy = 'bedrock';
    else credentialStrategy = 'api-key'; // ANTHROPIC_API_KEY / OPENAI_API_KEY expected
  } else {
    credentialStrategy = 'claude-code';
  }

  const storageStrategy: StorageStrategy = hasDatabaseUrl ? 'postgres' : 'sqlite';
  const authStrategy: AuthStrategy = runMode === 'team' ? 'oidc' : 'nextauth-google';

  const legacyMode: EnvironmentMode = runMode === 'team' ? 'production' : 'local';

  return {
    runMode,
    deployment,
    mode: legacyMode,
    credentialStrategy,
    storageStrategy,
    authStrategy,
  };
}

let cached: Environment | null = null;

export function getEnvironment(): Environment {
  if (!cached) cached = detectEnvironment();
  return cached;
}

export function resetEnvironmentCache(): void {
  cached = null;
}
