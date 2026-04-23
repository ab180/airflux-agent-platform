import { describe, expect, it } from 'vitest';
import { routeLLM, type ProviderAvailability } from '../llm/routing.js';

const allAvailable: ProviderAvailability = {
  claudeOAuth: true,
  claudeApiKey: false,
  codexOAuth: true,
  openaiApiKey: false,
};

describe('routeLLM heuristics', () => {
  it('simple greeting → claude fast tier, low effort', () => {
    const r = routeLLM({
      question: '안녕',
      agentModelTier: 'default',
      available: allAvailable,
    });
    expect(r.provider).toBe('claude');
    expect(r.tier).toBe('fast');
    expect(r.effort).toBe('low');
    expect(r.reason).toContain('짧은');
  });

  it('Korean analysis prompts → claude default tier, medium effort', () => {
    const r = routeLLM({
      question: '지난주 DAU 추이를 분석해줘',
      agentModelTier: 'default',
      available: allAvailable,
    });
    expect(r.provider).toBe('claude');
    expect(r.tier).toBe('default');
    expect(r.effort === 'medium' || r.effort === 'high').toBe(true);
  });

  it('explicit deep/complex reasoning → powerful tier + high effort', () => {
    const r = routeLLM({
      question: '이 아키텍처를 심층 분석하고 트레이드오프를 도출해줘. 여러 대안을 비교.',
      agentModelTier: 'default',
      available: allAvailable,
    });
    expect(r.tier).toBe('powerful');
    expect(r.effort).toBe('high');
  });

  it('coding/refactor prompts prefer Codex when available', () => {
    const r = routeLLM({
      question: '이 TypeScript 함수를 리팩터링해줘. 테스트 먼저 작성',
      agentModelTier: 'default',
      available: allAvailable,
    });
    expect(r.provider).toBe('codex');
  });

  it('coding prompts fall back to claude when codex unavailable', () => {
    const r = routeLLM({
      question: '이 파이썬 스크립트 디버그해줘',
      agentModelTier: 'default',
      available: { ...allAvailable, codexOAuth: false, openaiApiKey: false },
    });
    expect(r.provider).toBe('claude');
  });

  it('respects agent.modelTier floor — powerful agent never gets fast tier', () => {
    const r = routeLLM({
      question: '안녕',
      agentModelTier: 'powerful',
      available: allAvailable,
    });
    expect(r.tier).toBe('powerful');
  });

  it('when no provider available → returns none + hint', () => {
    const r = routeLLM({
      question: '안녕',
      agentModelTier: 'default',
      available: {
        claudeOAuth: false,
        claudeApiKey: false,
        codexOAuth: false,
        openaiApiKey: false,
      },
    });
    expect(r.provider).toBe('none');
    expect(r.hint).toBeDefined();
  });

  it('surfaces signals (keywords that triggered the decision) for logging', () => {
    const r = routeLLM({
      question: '복잡한 분석 필요',
      agentModelTier: 'default',
      available: allAvailable,
    });
    expect(Array.isArray(r.signals)).toBe(true);
    expect(r.signals.length).toBeGreaterThan(0);
  });
});
