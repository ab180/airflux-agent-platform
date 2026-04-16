import { createAnthropic } from '@ai-sdk/anthropic';
import { readFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { homedir } from 'os';
import type { ModelTier, ProviderName } from '@airflux/core';
import { isClaudeCliAvailable } from './claude-cli-provider.js';
import { isCodexCliAvailable } from './codex-cli-provider.js';
import { logger } from '../lib/logger.js';

const TIER_MODELS: Record<ModelTier, string> = {
  fast: 'claude-haiku-4-5-20251001',
  default: 'claude-sonnet-4-6',
  powerful: 'claude-opus-4-6',
};

const OPENAI_TIER_MODELS: Record<ModelTier, string> = {
  fast: 'gpt-4.1-mini',
  default: 'gpt-5.4',
  powerful: 'o3',
};

// Claude Max OAuth constants (from Claude CLI source)
const OAUTH_BETA_HEADER = 'oauth-2025-04-20';
const TOKEN_REFRESH_URL = 'https://platform.claude.com/v1/oauth/token';
const CLAUDE_CODE_CLIENT_ID = '22422756-60c9-4084-8eb7-27705f16d45e';
const INFERENCE_SCOPE = 'user:inference';
const CRED_PATHS = [
  `${homedir()}/.claude/.credentials.json`,
  `${homedir()}/.config/claude/credentials.json`,
];

let cachedApiKey: string | null = null;
let keySource: string = 'none';

// OAuth token cache (in-memory, not persisted — avoids writing to read-only mount)
let oauthAccessToken: string | null = null;
let oauthRefreshToken: string | null = null;
let oauthExpiresAt: number = 0;

interface OAuthCredentials {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  scopes?: string[];
}

function readCredentials(): OAuthCredentials | null {
  for (const path of CRED_PATHS) {
    try {
      const creds = JSON.parse(readFileSync(path, 'utf-8'));
      const oauth = creds?.claudeAiOauth;
      if (oauth?.accessToken && Array.isArray(oauth.scopes) && oauth.scopes.includes(INFERENCE_SCOPE)) {
        return {
          accessToken: oauth.accessToken as string,
          refreshToken: oauth.refreshToken as string | undefined,
          expiresAt: (oauth.expiresAt as number) ?? 0,
          scopes: oauth.scopes as string[],
        };
      }
    } catch {
      // try next
    }
  }
  return null;
}

async function refreshOAuthToken(refreshToken: string): Promise<string | null> {
  try {
    const resp = await fetch(TOKEN_REFRESH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: CLAUDE_CODE_CLIENT_ID,
      }),
    });
    if (!resp.ok) {
      logger.warn('OAuth token refresh failed', { status: resp.status });
      return null;
    }
    const data = await resp.json() as { access_token?: string; refresh_token?: string; expires_in?: number };
    if (!data.access_token) return null;

    oauthAccessToken = data.access_token;
    if (data.refresh_token) oauthRefreshToken = data.refresh_token;
    oauthExpiresAt = Date.now() + (data.expires_in ?? 3600) * 1000;
    logger.info('OAuth token refreshed successfully');
    return oauthAccessToken;
  } catch (e) {
    logger.warn('OAuth token refresh error', { error: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

/** Trigger token refresh via Claude CLI (works because ~/.claude mount is now writable). */
function refreshViaCliSync(): void {
  const CLAUDE_BIN = `${homedir()}/.local/bin/claude`;
  try {
    execFileSync(CLAUDE_BIN, ['auth', 'status'], {
      encoding: 'utf-8',
      timeout: 8000,
      env: { ...process.env, PATH: `${homedir()}/.local/bin:/usr/local/bin:${process.env.PATH}` },
    });
    // Reset in-memory cache so next read comes from the (now-refreshed) file
    oauthAccessToken = null;
    oauthExpiresAt = 0;
  } catch {
    // CLI not available or refresh failed — not fatal
  }
}

async function getFreshOAuthToken(): Promise<string | null> {
  const now = Date.now();

  // Use in-memory cached token if still valid (with 60s buffer)
  if (oauthAccessToken && oauthExpiresAt > now + 60_000) {
    return oauthAccessToken;
  }

  // Read from credentials file
  const creds = readCredentials();
  if (!creds) return null;

  // Token still valid — cache and use it
  if (creds.expiresAt > now + 60_000) {
    oauthAccessToken = creds.accessToken;
    oauthRefreshToken = creds.refreshToken ?? null;
    oauthExpiresAt = creds.expiresAt;
    return oauthAccessToken;
  }

  // Token expired — try API refresh first, then CLI fallback
  const refreshToken = creds.refreshToken ?? oauthRefreshToken;
  if (refreshToken) {
    const refreshed = await refreshOAuthToken(refreshToken);
    if (refreshed) return refreshed;
  }

  // API refresh blocked — trigger CLI which handles OAuth internally and writes fresh token
  logger.info('OAuth token expired, triggering CLI refresh...');
  refreshViaCliSync();

  // Read again after CLI refresh
  const freshCreds = readCredentials();
  if (freshCreds && freshCreds.expiresAt > now + 60_000) {
    oauthAccessToken = freshCreds.accessToken;
    oauthRefreshToken = freshCreds.refreshToken ?? null;
    oauthExpiresAt = freshCreds.expiresAt;
    logger.info('OAuth token refreshed via CLI');
    return oauthAccessToken;
  }

  return null;
}

/**
 * Returns a real Anthropic API key (sk-ant-api...).
 * Throws if no API key is configured — use isLLMAvailable() to check first.
 */
function getAnthropicApiKey(): string {
  if (cachedApiKey) return cachedApiKey;

  if (process.env.ANTHROPIC_API_KEY) {
    cachedApiKey = process.env.ANTHROPIC_API_KEY;
    keySource = 'env:ANTHROPIC_API_KEY';
    return cachedApiKey;
  }

  throw new Error(
    'No Anthropic API key found. Set ANTHROPIC_API_KEY env var.',
  );
}

function makeOAuthModel(token: string, tier: ModelTier) {
  const anthropic = createAnthropic({
    apiKey: 'placeholder',
    fetch: async (url: string | Request | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      headers.delete('x-api-key');
      headers.set('Authorization', `Bearer ${token}`);
      // Merge beta headers: preserve SDK-set betas (e.g. thinking) and add OAuth beta
      const existing = headers.get('anthropic-beta');
      const betaValues = existing
        ? [...new Set([...existing.split(',').map(s => s.trim()), OAUTH_BETA_HEADER])]
        : [OAUTH_BETA_HEADER];
      headers.set('anthropic-beta', betaValues.join(','));

      // Patch request body: ensure every tool input_schema has type:"object"
      // (Anthropic API requires this; older SDK versions may omit it)
      let body = init?.body;
      if (typeof body === 'string') {
        try {
          const parsed = JSON.parse(body) as Record<string, unknown>;
          if (Array.isArray(parsed.tools)) {
            for (const t of parsed.tools as Array<Record<string, unknown>>) {
              const schema = t.input_schema as Record<string, unknown> | undefined;
              if (schema && !schema.type) schema.type = 'object';
            }
            body = JSON.stringify(parsed);
          }
        } catch { /* not JSON — leave as-is */ }
      }

      return globalThis.fetch(url, { ...init, headers, body });
    },
  });
  return anthropic(TIER_MODELS[tier]);
}

export async function createModelAsync(tier: ModelTier = 'default'): Promise<ReturnType<ReturnType<typeof createAnthropic>>> {
  // 1. Try direct API key first
  try {
    const apiKey = getAnthropicApiKey();
    keySource = 'env:ANTHROPIC_API_KEY';
    return createAnthropic({ apiKey })(TIER_MODELS[tier]);
  } catch {
    // no API key
  }

  // 2. Try ANTHROPIC_AUTH_TOKEN env var (set by setup-docker-env.sh from Keychain)
  if (process.env.ANTHROPIC_AUTH_TOKEN) {
    keySource = 'env:ANTHROPIC_AUTH_TOKEN';
    return makeOAuthModel(process.env.ANTHROPIC_AUTH_TOKEN, tier);
  }

  // 3. Try Claude Max OAuth from credentials file (auto-refreshes if expired)
  const oauthToken = await getFreshOAuthToken();
  if (oauthToken) {
    keySource = 'claude-max-oauth';
    const token = oauthToken;
    const anthropic = createAnthropic({
      apiKey: 'placeholder',
      fetch: async (url: string | Request | URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        headers.delete('x-api-key');
        headers.set('Authorization', `Bearer ${token}`);
        headers.set('anthropic-beta', OAUTH_BETA_HEADER);
        return globalThis.fetch(url, { ...init, headers });
      },
    });
    return anthropic(TIER_MODELS[tier]);
  }

  throw new Error('No LLM available. Set ANTHROPIC_API_KEY or run `claude login`.');
}

/** Synchronous version for backward compat — only works with API key, not OAuth */
export function createModel(tier: ModelTier = 'default'): ReturnType<ReturnType<typeof createAnthropic>> {
  const apiKey = getAnthropicApiKey(); // throws if not set
  return createAnthropic({ apiKey })(TIER_MODELS[tier]);
}

export function isLLMAvailable(): boolean {
  try { getAnthropicApiKey(); return true; } catch { /* no key */ }
  if (process.env.ANTHROPIC_AUTH_TOKEN) return true;
  if (readCredentials() !== null) return true;
  if (isClaudeCliAvailable()) return true;
  if (process.env.OPENAI_API_KEY) return true;
  return isCodexCliAvailable();
}

export function getLLMStatus(): { available: boolean; source: string; providers: string[] } {
  const providers: string[] = [];

  try {
    getAnthropicApiKey();
    providers.push('anthropic');
    return { available: true, source: keySource, providers };
  } catch { /* no API key */ }

  // ANTHROPIC_AUTH_TOKEN from env (setup-docker-env.sh / Keychain)
  if (process.env.ANTHROPIC_AUTH_TOKEN) {
    providers.push('claude-max-oauth');
    return { available: true, source: 'env:ANTHROPIC_AUTH_TOKEN', providers };
  }

  // OAuth credentials file
  const creds = readCredentials();
  if (creds) {
    providers.push('claude-max-oauth');
    const expired = creds.expiresAt < Date.now() + 60_000;
    return {
      available: true,
      source: expired ? 'claude-max-oauth (refreshing)' : 'claude-max-oauth',
      providers,
    };
  }

  if (isClaudeCliAvailable()) {
    providers.push('claude-cli');
    return { available: true, source: 'claude-cli', providers };
  }

  if (process.env.OPENAI_API_KEY) {
    providers.push('openai');
    return { available: true, source: 'env:OPENAI_API_KEY', providers };
  }

  if (isCodexCliAvailable()) {
    providers.push('codex-cli');
    return { available: true, source: 'codex-cli', providers };
  }

  return { available: false, source: 'none', providers };
}

/**
 * Create a model for a specific provider.
 * Used by agents with explicit provider config (e.g., provider: 'openai').
 */
export async function createModelForProvider(
  provider: ProviderName = 'claude',
  tier: ModelTier = 'default',
): Promise<ReturnType<ReturnType<typeof createAnthropic>>> {
  if (provider === 'openai') {
    return createOpenAIModel(tier);
  }
  // Default: claude (existing logic)
  return createModelAsync(tier);
}

/**
 * Create an OpenAI model via AI SDK.
 * Falls back to Codex CLI if no API key is available.
 */
async function createOpenAIModel(tier: ModelTier): Promise<any> {
  const modelId = OPENAI_TIER_MODELS[tier];

  // Try OPENAI_API_KEY first
  if (process.env.OPENAI_API_KEY) {
    try {
      const { createOpenAI } = await import('@ai-sdk/openai');
      return createOpenAI({ apiKey: process.env.OPENAI_API_KEY })(modelId);
    } catch (e) {
      logger.warn('Failed to create OpenAI model via AI SDK', {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // No API key — throw so caller can fall back to Codex CLI
  throw new Error(`No OpenAI API key. Use Codex CLI fallback for model ${modelId}.`);
}

/** Set API key at runtime (from dashboard UI). */
export function setApiKey(key: string): void {
  cachedApiKey = key;
  keySource = 'dashboard';
}

/** Clear cached API key (force re-detection on next call). */
export function clearApiKeyCache(): void {
  cachedApiKey = null;
  keySource = 'none';
  oauthAccessToken = null;
  oauthExpiresAt = 0;
}
