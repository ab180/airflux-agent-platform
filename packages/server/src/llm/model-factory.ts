import { createAnthropic } from '@ai-sdk/anthropic';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import type { ModelTier } from '@airflux/core';
import { isClaudeCliAvailable } from './claude-cli-provider.js';

const TIER_MODELS: Record<ModelTier, string> = {
  fast: 'claude-haiku-4-5-20251001',
  default: 'claude-sonnet-4-6-20250514',
  powerful: 'claude-opus-4-6-20250514',
};

let cachedApiKey: string | null = null;
let keySource: string = 'none';

function getAnthropicApiKey(): string {
  if (cachedApiKey) return cachedApiKey;

  // 1. Environment variable (highest priority)
  if (process.env.ANTHROPIC_API_KEY) {
    cachedApiKey = process.env.ANTHROPIC_API_KEY;
    keySource = 'env:ANTHROPIC_API_KEY';
    return cachedApiKey;
  }

  // 2. Claude Code OAuth token
  if (process.env.ANTHROPIC_AUTH_TOKEN) {
    cachedApiKey = process.env.ANTHROPIC_AUTH_TOKEN;
    keySource = 'env:ANTHROPIC_AUTH_TOKEN';
    return cachedApiKey;
  }

  // 3. Claude Code credentials file (local dev)
  const credPaths = [
    `${homedir()}/.claude/.credentials.json`,
    `${homedir()}/.config/claude/credentials.json`,
  ];

  for (const path of credPaths) {
    try {
      const creds = JSON.parse(readFileSync(path, 'utf-8'));
      if (creds.claudeAiOauth?.accessToken) {
        cachedApiKey = creds.claudeAiOauth.accessToken as string;
        keySource = 'claude-code';
        return cachedApiKey!;
      }
      if (creds.oauthToken) {
        cachedApiKey = creds.oauthToken as string;
        keySource = 'claude-code-oauth';
        return cachedApiKey!;
      }
    } catch {
      // Try next path
    }
  }

  throw new Error(
    'No Anthropic API key found. Set ANTHROPIC_API_KEY env var or login with `claude login`.',
  );
}

export function createModel(tier: ModelTier = 'default'): ReturnType<ReturnType<typeof createAnthropic>> {
  const apiKey = getAnthropicApiKey();

  const anthropic = createAnthropic({
    apiKey,
  });

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

export function getLLMStatus(): { available: boolean; source: string } {
  try {
    getAnthropicApiKey();
    return { available: true, source: keySource };
  } catch {
    if (isClaudeCliAvailable()) {
      return { available: true, source: 'claude-cli' };
    }
    return { available: false, source: 'none' };
  }
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
