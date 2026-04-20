import { createAnthropic } from '@ai-sdk/anthropic';
import { readFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { homedir } from 'os';
import type { ModelTier, ProviderName } from '@airflux/core';
import { isClaudeCliAvailable } from './claude-cli-provider.js';
import { isCodexCliAvailable } from './codex-cli-provider.js';
import { logger } from '../lib/logger.js';
import { getEnvironment, type CredentialStrategy } from '../runtime/environment.js';
import { evaluateLLMHealth, type LLMHealthResult } from './health.js';
import {
  recordRateLimit,
  getRateLimitState,
  shouldPreferApiKey,
  type RateLimitState,
} from './rate-limit.js';
import { getCodexAuthStatus, type CodexAuthStatus } from './codex-auth.js';

// 0.0–1.0. When observed 5h utilization >= this, createModelAsync prefers
// ANTHROPIC_API_KEY (if set) over the OAuth path — keeps headroom for the
// user's interactive Claude Code usage on the same subscription. Override
// with AIRFLUX_OAUTH_UTIL_THRESHOLD.
const OAUTH_UTIL_THRESHOLD = Number(process.env.AIRFLUX_OAUTH_UTIL_THRESHOLD ?? 0.8);

export function getModelCredentialSource(): CredentialStrategy {
  return getEnvironment().credentialStrategy;
}

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
const CLAUDE_CODE_BETA = 'claude-code-20250219';
// Billing gate: this string in the first system block tells Anthropic the
// request is on Claude Code's subscription context. Without it OAuth tokens
// can only reach Haiku; with it, sonnet/opus are allowed.
const CLAUDE_CODE_BILLING_HEADER =
  'x-anthropic-billing-header: cc_version=2.1.114.ea7; cc_entrypoint=sdk-ts; cch=54600;';
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
      // Add ?beta=true — matches what Claude Code CLI uses for /v1/messages.
      // Anthropic routes the subscription-context request path only when set.
      let patchedUrl: string | Request | URL = url;
      try {
        const u = new URL(typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url);
        if (u.pathname.endsWith('/v1/messages') && !u.searchParams.has('beta')) {
          u.searchParams.set('beta', 'true');
          patchedUrl = u.toString();
        }
      } catch { /* non-URL fetch target — leave as-is */ }

      const headers = new Headers(init?.headers);
      headers.delete('x-api-key');
      headers.set('Authorization', `Bearer ${token}`);
      // Merge beta headers: preserve SDK-set betas and add the OAuth +
      // claude-code betas that unlock sonnet/opus under the subscription.
      const existing = headers.get('anthropic-beta');
      const betaSet = new Set<string>();
      if (existing) existing.split(',').forEach((s) => betaSet.add(s.trim()));
      betaSet.add(OAUTH_BETA_HEADER);
      betaSet.add(CLAUDE_CODE_BETA);
      headers.set('anthropic-beta', Array.from(betaSet).join(','));

      // Patch request body:
      //  (1) tool input_schema.type = "object" (flat + custom.* shapes)
      //  (2) prepend billing signal to system blocks — this is the gate
      //      that authorizes sonnet/opus on OAuth tokens.
      let body = init?.body;
      if (typeof body === 'string') {
        try {
          const parsed = JSON.parse(body) as Record<string, unknown>;
          if (Array.isArray(parsed.tools)) {
            for (const t of parsed.tools as Array<Record<string, unknown>>) {
              const flatSchema = t.input_schema as Record<string, unknown> | undefined;
              if (flatSchema && !flatSchema.type) flatSchema.type = 'object';
              const wrapped = t.custom as Record<string, unknown> | undefined;
              const nestedSchema = wrapped?.input_schema as Record<string, unknown> | undefined;
              if (nestedSchema && !nestedSchema.type) nestedSchema.type = 'object';
            }
          }
          const billingBlock = { type: 'text', text: CLAUDE_CODE_BILLING_HEADER };
          const existingSystem = parsed.system;
          if (Array.isArray(existingSystem)) {
            parsed.system = [billingBlock, ...existingSystem];
          } else if (typeof existingSystem === 'string' && existingSystem.length > 0) {
            parsed.system = [billingBlock, { type: 'text', text: existingSystem }];
          } else {
            parsed.system = [billingBlock];
          }
          body = JSON.stringify(parsed);
        } catch { /* not JSON — leave as-is */ }
      }

      const response = await globalThis.fetch(patchedUrl, { ...init, headers, body });
      // Snapshot rate-limit headers — shared with dashboard + fallback router.
      try { recordRateLimit(response.headers); } catch { /* best-effort */ }
      return response;
    },
  });
  return anthropic(TIER_MODELS[tier]);
}

export async function createModelAsync(tier: ModelTier = 'default'): Promise<ReturnType<ReturnType<typeof createAnthropic>>> {
  // Production guard: if environment says bedrock/internal-api but no adapter
  // is wired yet, fail loud instead of falling through to local credentials.
  const strategy = getModelCredentialSource();
  if (strategy === 'bedrock') {
    throw new Error(
      'Bedrock credential adapter not implemented (Phase 2). ' +
      'Set AGENT_API_URL or deploy the Bedrock adapter before running in this mode.',
    );
  }
  if (strategy === 'internal-api' && !process.env.AGENT_API_TOKEN) {
    throw new Error(
      'internal-api credential strategy requires AGENT_API_URL and AGENT_API_TOKEN. ' +
      'AGENT_API_URL is set but AGENT_API_TOKEN is missing.',
    );
  }

  // Routing policy: prefer Claude Max OAuth (free under subscription) until
  // observed utilization crosses AIRFLUX_OAUTH_UTIL_THRESHOLD, then fall
  // back to ANTHROPIC_API_KEY (if set) so the user's interactive Claude
  // Code usage keeps headroom. If no API key is configured, OAuth is used
  // regardless — the alternative is failing.
  const apiKeyAvailable = !!process.env.ANTHROPIC_API_KEY || !!cachedApiKey;
  const preferApiKey = apiKeyAvailable && shouldPreferApiKey(OAUTH_UTIL_THRESHOLD);
  if (preferApiKey) {
    try {
      const apiKey = getAnthropicApiKey();
      keySource = 'env:ANTHROPIC_API_KEY (oauth-util-threshold)';
      return createAnthropic({ apiKey })(TIER_MODELS[tier]);
    } catch {
      // Fall through to OAuth
    }
  }

  const oauthToken = await getFreshOAuthToken();
  if (oauthToken) {
    keySource = 'claude-max-oauth';
    return makeOAuthModel(oauthToken, tier);
  }

  // OAuth unavailable → try direct API key as last resort on the Claude path.
  try {
    const apiKey = getAnthropicApiKey();
    keySource = 'env:ANTHROPIC_API_KEY';
    return createAnthropic({ apiKey })(TIER_MODELS[tier]);
  } catch {
    // no API key either
  }

  // 3. Last resort: ANTHROPIC_AUTH_TOKEN env var. Used only if the
  //    credentials.json path above produced nothing (no file, or no refresh
  //    grant). This env source is unverifiable locally — the LLM request
  //    itself is the first moment we find out if it's stale.
  if (process.env.ANTHROPIC_AUTH_TOKEN) {
    keySource = 'env:ANTHROPIC_AUTH_TOKEN';
    return makeOAuthModel(process.env.ANTHROPIC_AUTH_TOKEN, tier);
  }

  throw new Error('No LLM available. Set ANTHROPIC_API_KEY or run `claude login`.');
}

/** Synchronous version for backward compat — only works with API key, not OAuth */
export function createModel(tier: ModelTier = 'default'): ReturnType<ReturnType<typeof createAnthropic>> {
  const apiKey = getAnthropicApiKey(); // throws if not set
  return createAnthropic({ apiKey })(TIER_MODELS[tier]);
}

/**
 * Canonical LLM credential health check.
 * Distinguishes "configured but expired" from "ready" so callers
 * (health endpoint, dashboard banner) can surface actionable status.
 */
export function getLLMHealth(): LLMHealthResult {
  const apiKey =
    process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.length > 0
      ? process.env.ANTHROPIC_API_KEY
      : null;
  const authTokenPresent = !!process.env.ANTHROPIC_AUTH_TOKEN;
  const creds = readCredentials();
  return evaluateLLMHealth({
    apiKey,
    authTokenPresent,
    creds: creds
      ? { accessToken: creds.accessToken, expiresAt: creds.expiresAt }
      : null,
    now: Date.now(),
  });
}

export function isLLMAvailable(): boolean {
  const health = getLLMHealth();
  if (health.healthy) return true;
  // OpenAI / Codex CLI paths are independent of the Anthropic health model.
  if (process.env.OPENAI_API_KEY) return true;
  if (isClaudeCliAvailable()) return true;
  return isCodexCliAvailable();
}

export interface LLMStatus {
  available: boolean;
  source: string;
  providers: string[];
  healthy: boolean;
  expired: boolean;
  hoursExpired?: number;
  verified: boolean;
  hint?: string;
  /** Latest observed Claude Max OAuth subscription quota usage. */
  rateLimit?: RateLimitState | null;
  /** Threshold (0-1) at which the server prefers ANTHROPIC_API_KEY over OAuth. */
  oauthUtilizationThreshold?: number;
  /** True if an API key is available to fall back to when OAuth saturates. */
  apiKeyFallbackAvailable?: boolean;
  /** Codex / OpenAI auth state so the dashboard renders both providers. */
  codex?: CodexAuthStatus;
}

export function getLLMStatus(): LLMStatus {
  const providers: string[] = [];
  const health = getLLMHealth();
  const rateLimit = getRateLimitState();
  const apiKeyFallbackAvailable = !!process.env.ANTHROPIC_API_KEY || !!cachedApiKey;
  const common = {
    rateLimit,
    oauthUtilizationThreshold: OAUTH_UTIL_THRESHOLD,
    apiKeyFallbackAvailable,
    codex: getCodexAuthStatus(),
  };

  try {
    getAnthropicApiKey();
    providers.push('anthropic');
    return {
      ...common,
      available: true,
      source: keySource,
      providers,
      healthy: true,
      expired: false,
      verified: false,
    };
  } catch { /* no API key */ }

  // OAuth credentials file — preferred source when present.
  const creds = readCredentials();
  if (creds) {
    providers.push('claude-max-oauth');
    return {
      ...common,
      available: !health.expired, // expired creds → available=false (actionable)
      source: health.expired
        ? 'claude-max-oauth (expired)'
        : 'claude-max-oauth',
      providers,
      healthy: health.healthy,
      expired: health.expired,
      hoursExpired: health.hoursExpired,
      verified: health.verified,
      hint: health.hint,
    };
  }

  // ANTHROPIC_AUTH_TOKEN from env — unverifiable locally, best-effort.
  if (process.env.ANTHROPIC_AUTH_TOKEN) {
    providers.push('claude-max-oauth');
    return {
      ...common,
      available: true,
      source: 'env:ANTHROPIC_AUTH_TOKEN',
      providers,
      healthy: true,
      expired: false,
      verified: false,
      hint: health.hint,
    };
  }

  if (isClaudeCliAvailable()) {
    providers.push('claude-cli');
    return {
      ...common,
      available: true,
      source: 'claude-cli',
      providers,
      healthy: true,
      expired: false,
      verified: false,
    };
  }

  if (process.env.OPENAI_API_KEY) {
    providers.push('openai');
    return {
      ...common,
      available: true,
      source: 'env:OPENAI_API_KEY',
      providers,
      healthy: true,
      expired: false,
      verified: false,
    };
  }

  if (isCodexCliAvailable()) {
    providers.push('codex-cli');
    return {
      ...common,
      available: true,
      source: 'codex-cli',
      providers,
      healthy: true,
      expired: false,
      verified: false,
    };
  }

  return {
    ...common,
    available: false,
    source: 'none',
    providers,
    healthy: false,
    expired: false,
    verified: true,
    hint: health.hint,
  };
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
