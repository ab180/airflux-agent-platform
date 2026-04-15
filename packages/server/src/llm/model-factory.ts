import { createAnthropic } from '@ai-sdk/anthropic';
import type { ModelTier } from '@airflux/core';
import { isClaudeCliAvailable } from './claude-cli-provider.js';

const TIER_MODELS: Record<ModelTier, string> = {
  fast: 'claude-haiku-4-5-20251001',
  default: 'claude-sonnet-4-6-20250514',
  powerful: 'claude-opus-4-6-20250514',
};

let cachedApiKey: string | null = null;
let keySource: string = 'none';

/**
 * Returns a real Anthropic API key (sk-ant-...).
 * Claude Code OAuth tokens (ANTHROPIC_AUTH_TOKEN) are NOT supported by
 * api.anthropic.com for direct API calls — they are rejected with
 * "OAuth authentication is currently not supported."
 * OAuth users should fall back to the Claude CLI provider instead.
 */
function getAnthropicApiKey(): string {
  if (cachedApiKey) return cachedApiKey;

  // Direct API key — the only valid credential for api.anthropic.com
  if (process.env.ANTHROPIC_API_KEY) {
    cachedApiKey = process.env.ANTHROPIC_API_KEY;
    keySource = 'env:ANTHROPIC_API_KEY';
    return cachedApiKey;
  }

  throw new Error(
    'No Anthropic API key found. Set ANTHROPIC_API_KEY env var or use `claude login` for CLI fallback.',
  );
}

export function createModel(tier: ModelTier = 'default'): ReturnType<ReturnType<typeof createAnthropic>> {
  const apiKey = getAnthropicApiKey();
  const anthropic = createAnthropic({ apiKey });
  return anthropic(TIER_MODELS[tier]);
}

export function isLLMAvailable(): boolean {
  try {
    getAnthropicApiKey();
    return true;
  } catch {
    return isClaudeCliAvailable();
  }
}

export function getLLMStatus(): { available: boolean; source: string; providers: string[] } {
  const providers: string[] = [];

  // Check direct API key
  try {
    getAnthropicApiKey();
    providers.push('anthropic');
    return { available: true, source: keySource, providers };
  } catch {
    // no API key
  }

  // Check Claude CLI (handles OAuth via the CLI's own auth mechanism)
  if (isClaudeCliAvailable()) {
    providers.push('claude-cli');
    return { available: true, source: 'claude-cli', providers };
  }

  // Check OpenAI (for Codex users)
  if (process.env.OPENAI_API_KEY) {
    providers.push('openai');
    return { available: true, source: 'env:OPENAI_API_KEY', providers };
  }

  return { available: false, source: 'none', providers };
}

/** Set API key at runtime (from dashboard UI). Clears cached key first. */
export function setApiKey(key: string): void {
  cachedApiKey = key;
  keySource = 'dashboard';
}

/** Clear cached API key (force re-detection on next call). */
export function clearApiKeyCache(): void {
  cachedApiKey = null;
  keySource = 'none';
}
