/**
 * Prompt-aware LLM routing — picks provider / tier / effort from the
 * user's question + the agent's configured floor + what's currently
 * available.
 *
 * Heuristic-only for now (Korean + English keyword scan). Pure and
 * testable; no network, no state. The integration layer (query-stream,
 * model-factory) is responsible for mapping the return value onto an
 * actual API call.
 *
 * Design tenets:
 *   - Shorter / conversational prompts → fast tier, low effort.
 *   - Analysis / comparison / deep-work signals → bump tier + effort.
 *   - Coding / refactor / debug prompts prefer Codex when available.
 *   - Agent's configured tier is a FLOOR, never ceiling — an agent
 *     declared 'powerful' stays 'powerful' even for a short prompt.
 */

import type { ModelTier } from '@airflux/core';

export type Provider = 'claude' | 'codex' | 'none';
export type Effort = 'low' | 'medium' | 'high';

export interface ProviderAvailability {
  claudeOAuth: boolean;
  claudeApiKey: boolean;
  codexOAuth: boolean;
  openaiApiKey: boolean;
}

export interface RoutingInput {
  question: string;
  agentModelTier: ModelTier;
  available: ProviderAvailability;
}

export interface RoutingDecision {
  provider: Provider;
  tier: ModelTier;
  effort: Effort;
  /** Keywords / rules that fired — surfaced for logs + dashboard trace. */
  signals: string[];
  /** Human-readable explanation (for dashboard + /api/admin). */
  reason: string;
  /** Only set when provider = 'none'. */
  hint?: string;
}

const CODE_PATTERNS: Array<[RegExp, string]> = [
  [/\b(refactor|debug|diff|regex|implement|function|class|typescript|python|javascript|rust|go\b)/i, 'keyword:code(en)'],
  [/(리팩터|디버그|함수|클래스|코드 리뷰|스크립트|파이썬|타입스크립트)/, 'keyword:code(ko)'],
  [/(pr|pull request|커밋|merge conflict)/i, 'keyword:vcs'],
];

const DEEP_PATTERNS: Array<[RegExp, string]> = [
  [/\b(deep|comprehensive|trade.?off|compare alternatives|architect)/i, 'keyword:deep(en)'],
  [/(심층|심도|깊이|트레이드오프|대안.*비교|여러 대안|아키텍처|복잡한)/, 'keyword:deep(ko)'],
];

const ANALYSIS_PATTERNS: Array<[RegExp, string]> = [
  [/\b(analyze|analysis|breakdown|insight|trend)/i, 'keyword:analysis(en)'],
  [/(분석|추이|원인|트렌드|비교|요약|리포트)/, 'keyword:analysis(ko)'],
];

const SHORT_CONVO_PATTERNS: Array<[RegExp, string]> = [
  [/^\s*(안녕|hi|hello|ping|ok|네|응)[!\s.?]*$/i, 'shape:greeting'],
];

const CODER_FLOOR: ModelTier = 'default';

function tierRank(t: ModelTier): number {
  return t === 'fast' ? 0 : t === 'default' ? 1 : 2;
}

function maxTier(a: ModelTier, b: ModelTier): ModelTier {
  return tierRank(a) >= tierRank(b) ? a : b;
}

function scan(q: string, patterns: Array<[RegExp, string]>, bag: string[]): boolean {
  let hit = false;
  for (const [re, tag] of patterns) {
    if (re.test(q)) {
      bag.push(tag);
      hit = true;
    }
  }
  return hit;
}

export function routeLLM(input: RoutingInput): RoutingDecision {
  const q = input.question.trim();
  const signals: string[] = [];

  const short = q.length <= 30 || scan(q, SHORT_CONVO_PATTERNS, signals);
  const codey = scan(q, CODE_PATTERNS, signals);
  const deep = scan(q, DEEP_PATTERNS, signals);
  const analytical = scan(q, ANALYSIS_PATTERNS, signals);

  // Provider selection
  const codexAvailable = input.available.codexOAuth || input.available.openaiApiKey;
  const claudeAvailable = input.available.claudeOAuth || input.available.claudeApiKey;

  let provider: Provider = 'none';
  let reason = '';
  if (codey && codexAvailable) {
    provider = 'codex';
    reason = '코드/디버그 관련 프롬프트 → Codex';
  } else if (claudeAvailable) {
    provider = 'claude';
    reason = codey
      ? '코드 프롬프트이나 Codex 미가용 → Claude'
      : short
        ? '짧은 대화형 프롬프트 → Claude'
        : analytical || deep
          ? '분석/심층 프롬프트 → Claude'
          : '기본 Claude';
  } else if (codexAvailable) {
    provider = 'codex';
    reason = 'Claude 미가용 → Codex';
  } else {
    return {
      provider: 'none',
      tier: input.agentModelTier,
      effort: 'low',
      signals,
      reason: '사용 가능한 LLM 없음',
      hint: 'claude login 또는 codex login 실행 후 서버 재시작하세요.',
    };
  }

  // Tier — rule order: deep > analytical > short-convo (downgrade) > agent floor.
  let tier: ModelTier = input.agentModelTier;
  if (deep) {
    tier = maxTier(tier, 'powerful');
  } else if (analytical) {
    tier = maxTier(tier, 'default');
  } else if (short && !codey) {
    // Downgrade to fast only when there's no richer signal + agent floor allows.
    if (tierRank(input.agentModelTier) <= tierRank('default')) tier = 'fast';
  }
  // If we just picked codex for a coding task, ensure at least 'default' model tier.
  if (provider === 'codex') tier = maxTier(tier, CODER_FLOOR);

  // Effort
  let effort: Effort = 'medium';
  if (deep) effort = 'high';
  else if (short && !deep && !analytical) effort = 'low';
  else if (codey || analytical) effort = 'medium';

  return { provider, tier, effort, signals, reason };
}
