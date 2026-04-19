/**
 * Query understanding preview.
 *
 * Runs two lightweight, pure parsers against the user's draft query:
 *  - extractTimeExpressions: Korean time phrases ("지난주", "최근 7일", ...)
 *    normalized to ISO date ranges
 *  - DomainGlossary.resolveAll: ad-tech glossary terms (DAU, 리텐션, ROAS…)
 *    resolved to canonical names
 *
 * Surfaces the platform's Korean + AB180-domain intelligence BEFORE the
 * LLM is called — users get immediate signal that "the system understands
 * my input" and can correct misinterpretations upfront.
 *
 * No LLM, no network — local and instant. Safe to call on every keystroke
 * (callers should still debounce).
 */

import { Hono } from 'hono';
import {
  extractTimeExpressions,
  DomainGlossary,
  loadConfigOptional,
  type GlossaryConfig,
} from '@airflux/core';

export interface UnderstandResult {
  timeRanges: Array<{
    expression: string;
    start?: string;
    end?: string;
    [key: string]: unknown;
  }>;
  terms: Array<{ term?: string; canonical?: string; description?: string; [k: string]: unknown }>;
}

export function understandQuery(query: string, glossary: DomainGlossary): UnderstandResult {
  const q = (query || '').trim();
  if (!q) return { timeRanges: [], terms: [] };
  const timeRanges = extractTimeExpressions(q).map((r) => ({ ...(r as object) })) as UnderstandResult['timeRanges'];
  const terms = glossary.resolveAll(q) as unknown as UnderstandResult['terms'];
  return { timeRanges, terms };
}

let cachedGlossary: DomainGlossary | null = null;

function getGlossary(): DomainGlossary {
  if (cachedGlossary) return cachedGlossary;
  const cfg = loadConfigOptional<GlossaryConfig>('domain-glossary', { terms: {} });
  cachedGlossary = new DomainGlossary(cfg);
  return cachedGlossary;
}

export const queryUnderstandRoute = new Hono();

queryUnderstandRoute.post('/query/understand', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: 'Invalid JSON' }, 400);
  }
  const b = body as Record<string, unknown>;
  const query = typeof b.query === 'string' ? b.query : '';
  if (query.length > 2000) {
    return c.json({ success: false, error: 'query too long (max 2000 chars)' }, 400);
  }
  const result = understandQuery(query, getGlossary());
  return c.json(result);
});
