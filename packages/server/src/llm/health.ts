/**
 * LLM credential health evaluation — pure, dependency-free.
 *
 * Used by /api/health, /api/admin/llm/status, and the dashboard banner to
 * distinguish "credentials are configured but expired" from "ready to go"
 * and "no credentials at all".
 *
 * Intentionally pure so tests don't hit the filesystem or network. Callers
 * gather the inputs (env + credentials.json read) and pass them in.
 */

const SKEW_MS = 60_000; // treat within 60s of expiry as already expired.

export type LLMSource = 'api-key' | 'env-auth-token' | 'claude-oauth' | 'none';

export interface LLMHealthInput {
  apiKey: string | null;            // ANTHROPIC_API_KEY value (or null)
  authTokenPresent: boolean;        // ANTHROPIC_AUTH_TOKEN present in env
  creds: { accessToken: string; expiresAt: number } | null; // parsed ~/.claude/.credentials.json
  now: number;                      // Date.now() at evaluation time
}

export interface LLMHealthResult {
  healthy: boolean;
  source: LLMSource;
  /** true if we can affirmatively assert the credential is valid (not just present) */
  verified: boolean;
  expired: boolean;
  /** when expired, how many hours ago the credential lapsed (rounded down) */
  hoursExpired?: number;
  /** human-readable recovery hint for dashboard banner / logs */
  hint?: string;
}

export function evaluateLLMHealth(input: LLMHealthInput): LLMHealthResult {
  const { apiKey, authTokenPresent, creds, now } = input;

  if (apiKey && apiKey.length > 0) {
    return { healthy: true, source: 'api-key', verified: false, expired: false };
  }

  // Prefer the OAuth credentials file when present — it's the canonical,
  // checkable source. An env ANTHROPIC_AUTH_TOKEN alone cannot be verified
  // locally, so we only trust it when no credentials file is available.
  if (creds) {
    const msLeft = creds.expiresAt - now;
    if (msLeft <= SKEW_MS) {
      const hoursExpired = Math.max(0, Math.floor(-msLeft / 3_600_000));
      return {
        healthy: false,
        source: 'claude-oauth',
        verified: true,
        expired: true,
        hoursExpired,
        hint:
          `Claude OAuth 크레덴셜이 ${hoursExpired}시간 전에 만료되었습니다. ` +
          '호스트 터미널에서 `bash scripts/sync-claude.sh` 실행하세요. ' +
          '(Keychain의 최신 토큰을 컨테이너로 동기화 + 서버 재시작)',
      };
    }
    return {
      healthy: true,
      source: 'claude-oauth',
      verified: true,
      expired: false,
    };
  }

  if (authTokenPresent) {
    return {
      healthy: true,
      source: 'env-auth-token',
      verified: false,
      expired: false,
      hint:
        'ANTHROPIC_AUTH_TOKEN 환경변수만 있고 credentials.json이 없어 만료 여부를 확인할 수 없습니다. ' +
        '호스트 터미널에서 `bash scripts/sync-claude.sh` 실행하면 Keychain의 최신 토큰을 동기화합니다.',
    };
  }

  return {
    healthy: false,
    source: 'none',
    verified: true,
    expired: false,
    hint:
      'LLM 크레덴셜이 설정되지 않았습니다. 호스트에서 `claude login` 후 ' +
      '`bash scripts/sync-claude.sh` 실행, 또는 `.env`에 ANTHROPIC_API_KEY를 추가하세요.',
  };
}
