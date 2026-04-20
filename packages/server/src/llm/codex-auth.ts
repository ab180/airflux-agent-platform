/**
 * Codex / OpenAI auth evaluation — pure, dependency-free.
 *
 * Mirrors the shape of llm/health.ts so the dashboard can render Claude
 * and Codex state side-by-side. Inputs are gathered by the caller so this
 * stays filesystem/network-free for tests.
 *
 * Auth file shape (~/.codex/auth.json):
 *   {
 *     "auth_mode": "ChatGPT" | "ApiKey",
 *     "OPENAI_API_KEY": "sk-…"              // optional, set when user pasted
 *     "tokens": { "access_token", "refresh_token", "account_id", "id_token" }
 *     "last_refresh": "2026-04-16T14:18:00Z"
 *   }
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export type CodexSource = 'openai-api-key' | 'codex-chatgpt-oauth' | 'none';

export interface CodexAuthFile {
  auth_mode?: string;
  OPENAI_API_KEY?: string;
  tokens?: {
    access_token?: string;
    refresh_token?: string;
    account_id?: string;
    id_token?: string;
  };
  last_refresh?: string;
}

export interface CodexAuthInput {
  authFile: CodexAuthFile | null;
  apiKeyEnv: string | null; // OPENAI_API_KEY
  now: number;
}

export interface CodexAuthStatus {
  available: boolean;
  source: CodexSource;
  /** Set when we're on the ChatGPT subscription OAuth path. */
  accountId?: string;
  /** Days since the last token refresh; undefined if no record. */
  daysSinceRefresh?: number;
  hint?: string;
}

const REFRESH_STALE_THRESHOLD_DAYS = 7;

export function evaluateCodexAuth(input: CodexAuthInput): CodexAuthStatus {
  const { authFile, apiKeyEnv, now } = input;

  const apiKey =
    (apiKeyEnv && apiKeyEnv.length > 0 ? apiKeyEnv : null) ??
    (authFile?.OPENAI_API_KEY && authFile.OPENAI_API_KEY.length > 0
      ? authFile.OPENAI_API_KEY
      : null);
  if (apiKey) {
    return { available: true, source: 'openai-api-key' };
  }

  const tokens = authFile?.tokens;
  if (tokens?.access_token && tokens.access_token.length > 0) {
    const result: CodexAuthStatus = {
      available: true,
      source: 'codex-chatgpt-oauth',
      accountId: tokens.account_id,
    };
    if (authFile?.last_refresh) {
      const refreshTs = Date.parse(authFile.last_refresh);
      if (Number.isFinite(refreshTs)) {
        const days = (now - refreshTs) / (24 * 3600 * 1000);
        result.daysSinceRefresh = Math.floor(days);
        if (days >= REFRESH_STALE_THRESHOLD_DAYS) {
          result.hint =
            `Codex 토큰 마지막 갱신이 ${Math.floor(days)}일 전입니다. ` +
            '`codex login`으로 갱신해두면 안전합니다.';
        }
      }
    }
    return result;
  }

  return {
    available: false,
    source: 'none',
    hint:
      'Codex 로그인이 없습니다. `codex login`을 실행하거나 ' +
      '.env에 OPENAI_API_KEY=sk-... 를 추가하세요.',
  };
}

/** Runtime helper — reads the on-disk file + env to call evaluateCodexAuth. */
export function getCodexAuthStatus(): CodexAuthStatus {
  let authFile: CodexAuthFile | null = null;
  try {
    const raw = readFileSync(join(homedir(), '.codex', 'auth.json'), 'utf-8');
    authFile = JSON.parse(raw) as CodexAuthFile;
  } catch {
    // missing / unreadable — treat as no auth file
  }
  const apiKeyEnv = process.env.OPENAI_API_KEY ?? null;
  return evaluateCodexAuth({ authFile, apiKeyEnv, now: Date.now() });
}
