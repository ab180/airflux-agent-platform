/**
 * Codex ChatGPT OAuth model — mirrors makeOAuthModel but for the
 * OpenAI Responses API served at https://chatgpt.com/backend-api/codex.
 *
 * Endpoint was reverse-engineered by pointing the real `codex` CLI at a
 * local capture proxy via config.toml `model_providers.capture`. Verified
 * payload: POST /responses with Authorization + chatgpt-account-id +
 * originator:codex_exec headers, SSE streaming response.
 */

import { createOpenAI } from '@ai-sdk/openai';
import type { ModelTier } from '@airflux/core';
import {
  recordRateLimit,
  // Reusing the same store shape; kept provider-agnostic for now.
} from './rate-limit.js';
import { markCodexThrottled, clearCodexThrottle } from './codex-throttle.js';
import { logger } from '../lib/logger.js';

// Model catalog used when routing picks Codex.
// Conservative mapping — effort tier comes from the router, model stays
// consistent across tiers because Codex subscription surfaces only one
// "primary" model (gpt-5.4) with an effort dial.
export const CODEX_TIER_MODELS: Record<ModelTier, string> = {
  fast: 'gpt-5.4',
  default: 'gpt-5.4',
  powerful: 'gpt-5.4',
};

const CODEX_BASE_URL = 'https://chatgpt.com/backend-api/codex';

/**
 * When `store: false` is sent to ChatGPT Codex's Responses API, AI SDK
 * still emits `{ type: "item_reference", id: "fc_…" }` entries pointing
 * at previous-turn `function_call` items the server no longer has. That
 * yields `invalid_request_error (404): Item with id 'fc_…' not found`.
 *
 * We drop those references and collapse any orphaned `function_call_output`
 * siblings into an assistant message so the model still sees the tool
 * results textually — multi-step tool loops complete without leaking
 * server-scoped ids into the request.
 */
function flattenStoredItemReferences(parsed: Record<string, unknown>): boolean {
  const input = parsed.input;
  if (!Array.isArray(input)) return false;
  const items = input as Array<Record<string, unknown>>;
  let hasReference = false;
  let hasOrphanOutput = false;
  const outputs: Array<{ call_id?: string; output?: unknown }> = [];
  const kept: Array<Record<string, unknown>> = [];
  for (const item of items) {
    if (item.type === 'item_reference') { hasReference = true; continue; }
    if (item.type === 'function_call_output') {
      hasOrphanOutput = true;
      outputs.push(item as { call_id?: string; output?: unknown });
      continue;
    }
    kept.push(item);
  }
  if (!hasReference && !hasOrphanOutput) return false;
  if (outputs.length > 0) {
    const summaryLines = outputs.map((o, i) => {
      const outStr = typeof o.output === 'string' ? o.output : JSON.stringify(o.output ?? '');
      const id = o.call_id ?? `#${i + 1}`;
      return `- [${id}] ${outStr}`;
    });
    kept.push({
      role: 'assistant',
      content: [
        {
          type: 'output_text',
          text:
            '(이전 턴에서 다음 도구를 호출하여 결과를 얻었습니다. 이 결과들을 바탕으로 답변을 이어가세요.)\n\n' +
            summaryLines.join('\n'),
        },
      ],
    });
  }
  parsed.input = kept;
  return true;
}

/** Force OpenAI function-tool parameter schemas to have type:"object". */
function patchTools(parsed: Record<string, unknown>): boolean {
  const tools = parsed.tools;
  if (!Array.isArray(tools)) return false;
  let touched = false;
  for (const t of tools as Array<Record<string, unknown>>) {
    const params = t.parameters as Record<string, unknown> | undefined;
    if (params && (!params.type || params.type === 'None' || params.type === null)) {
      params.type = 'object';
      if (!params.properties) params.properties = {};
      touched = true;
    }
    // Some SDK versions wrap under `function: {parameters: {...}}`
    const fn = t.function as Record<string, unknown> | undefined;
    const fnParams = fn?.parameters as Record<string, unknown> | undefined;
    if (fnParams && (!fnParams.type || fnParams.type === 'None' || fnParams.type === null)) {
      fnParams.type = 'object';
      if (!fnParams.properties) fnParams.properties = {};
      touched = true;
    }
  }
  return touched;
}

export function makeCodexOAuthModel(
  accessToken: string,
  accountId: string,
  tier: ModelTier,
) {
  const openai = createOpenAI({
    apiKey: 'placeholder',
    baseURL: CODEX_BASE_URL,
    fetch: async (url, init) => {
      const headers = new Headers(init?.headers);
      headers.delete('x-api-key');
      headers.set('Authorization', `Bearer ${accessToken}`);
      headers.set('chatgpt-account-id', accountId);
      headers.set('originator', 'codex_exec');
      if (!headers.has('accept')) headers.set('accept', 'text/event-stream');

      // Body patch: ChatGPT Codex backend requires `instructions` at the
      // top level (verified via "Instructions are required" 400). AI SDK's
      // Responses provider emits system as the first `input` item in some
      // versions, or a role-message; here we lift any system-shaped block
      // into the top-level instructions field. Idempotent.
      let body = init?.body;
      if (typeof body === 'string') {
        try {
          const parsed = JSON.parse(body) as Record<string, unknown>;
          if (!parsed.instructions || parsed.instructions === '') {
            const input = parsed.input as Array<Record<string, unknown>> | undefined;
            const systemBits: string[] = [];
            if (Array.isArray(input)) {
              for (const item of input) {
                if (item.role === 'system' || item.type === 'system') {
                  const content = item.content;
                  if (typeof content === 'string') systemBits.push(content);
                  else if (Array.isArray(content)) {
                    for (const c of content as Array<Record<string, unknown>>) {
                      const text = (c.text ?? c.content) as unknown;
                      if (typeof text === 'string') systemBits.push(text);
                    }
                  }
                }
              }
            }
            // Fallback — "system" at top level of request.
            if (typeof parsed.system === 'string') systemBits.unshift(parsed.system);
            if (Array.isArray(parsed.system)) {
              for (const s of parsed.system as Array<Record<string, unknown>>) {
                const text = s.text as unknown;
                if (typeof text === 'string') systemBits.unshift(text);
              }
            }
            parsed.instructions = systemBits.length > 0
              ? systemBits.join('\n\n')
              : 'You are a helpful assistant.';
            // Strip system-shaped inputs so they don't double up.
            if (Array.isArray(input)) {
              parsed.input = input.filter(
                (item) => item.role !== 'system' && item.type !== 'system',
              );
            }
            // ChatGPT Codex backend rejects store=true for non-stored
            // conversations — always force false.
            parsed.store = false;
            patchTools(parsed);
            flattenStoredItemReferences(parsed);
            body = JSON.stringify(parsed);
          } else {
            let touched = false;
            if (parsed.store !== false) { parsed.store = false; touched = true; }
            if (patchTools(parsed)) touched = true;
            if (flattenStoredItemReferences(parsed)) touched = true;
            if (touched) body = JSON.stringify(parsed);
          }
        } catch { /* not JSON — leave */ }
      }

      const response = await globalThis.fetch(url, { ...init, headers, body });
      try { recordRateLimit(response.headers); } catch { /* best-effort */ }

      // Throttle policy: 429 / 402 quota-exceeded → mark Codex unavailable
      // so subsequent routes steer to Claude until retry window elapses.
      // On a successful response, proactively clear any stale throttle.
      if (response.status === 429 || response.status === 402) {
        const retryAfterHdr = response.headers.get('retry-after');
        const retryAfterSec = retryAfterHdr && /^\d+$/.test(retryAfterHdr)
          ? parseInt(retryAfterHdr, 10)
          : undefined;
        markCodexThrottled({
          reason: `http_${response.status}`,
          retryAfterSec,
          now: Date.now(),
        });
        logger.warn('codex throttled', {
          status: response.status,
          retryAfterSec: retryAfterSec ?? 'default-5min',
        });
      } else if (response.ok) {
        clearCodexThrottle();
      }

      return response;
    },
  });
  return openai.responses(CODEX_TIER_MODELS[tier]);
}
