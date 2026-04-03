/**
 * Credential Caching with TTL
 *
 * Montgomery src/utils/secrets.ts에서 직접 가져온 패턴.
 * 5분 TTL로 AWS Secrets Manager 호출 최소화.
 */

import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const secretsManager = new SecretsManagerClient();

// ── Generic Secret Cache ──

interface CachedSecret {
  value: Record<string, any>;
  expiresAt: number;
}

const secretCache = new Map<string, CachedSecret>();
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

async function getSecret(secretId: string): Promise<Record<string, any>> {
  const cached = secretCache.get(secretId);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.value;
  }

  const command = new GetSecretValueCommand({ SecretId: secretId });
  const response = await secretsManager.send(command);

  if (!response.SecretString) {
    throw new Error(`Secret value is empty: ${secretId}`);
  }

  const value = JSON.parse(response.SecretString);
  secretCache.set(secretId, { value, expiresAt: Date.now() + CACHE_DURATION_MS });
  return value;
}

// ── Slack Token ──

export async function getSlackBotToken(): Promise<string> {
  const secretId = process.env.SLACK_BOT_TOKEN_SECRET_ID || 'airflux/dev/slack-bot-token';
  const secret = await getSecret(secretId);
  const token = secret.bot_user_oauth_token;
  if (!token) throw new Error('bot_user_oauth_token not found');
  return token;
}

export async function getSlackSigningSecret(): Promise<string> {
  const secretId = process.env.SLACK_SIGNING_SECRET_ID || 'airflux/dev/slack-signing-secret';
  const secret = await getSecret(secretId);
  return secret.signing_secret;
}

// ── LLM API Key ──

export async function getLLMApiKey(): Promise<string> {
  const secretId = process.env.LLM_API_KEY_SECRET_ID || 'airflux/dev/anthropic-api-key';
  const secret = await getSecret(secretId);
  return secret.api_key;
}

// ── Snowflake Credentials ──

export interface SnowflakeCredentials {
  account: string;
  username: string;
  password: string;
  warehouse: string;
  database: string;
}

export async function getSnowflakeCredentials(): Promise<SnowflakeCredentials> {
  const secretId = process.env.SNOWFLAKE_SECRET_ID || 'airflux/dev/snowflake';
  const secret = await getSecret(secretId);
  return {
    account: secret.account,
    username: secret.username,
    password: secret.password,
    warehouse: secret.warehouse || 'AIRFLUX_XS',
    database: secret.database || 'AIRFLUX_PROD',
  };
}

// ── Druid Credentials (Montgomery 호환) ──

export async function getDruidCredentials(): Promise<{ id: string; password: string }> {
  const secretId = process.env.DRUID_SECRET_ID || 'prod/druid/api';
  const secret = await getSecret(secretId);
  return { id: secret.id, password: secret.password };
}

// ── DB Credentials (Montgomery 호환) ──

export async function getDBCredentials(): Promise<{ username: string; password: string }> {
  const secretId = process.env.DB_SECRET_ID || 'prod/rds/maindb/api_read';
  const secret = await getSecret(secretId);
  return { username: secret.username, password: secret.password };
}
