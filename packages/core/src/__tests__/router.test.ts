import { describe, it, expect, beforeEach } from 'vitest';
import { AgentRouter } from '../routing/router.js';
import { AgentRegistry } from '../registries/agent-registry.js';
import { EchoAgent } from '../agents/echo-agent.js';
import { createNetworkState } from '../routing/network-state.js';

describe('AgentRouter', () => {
  beforeEach(async () => {
    AgentRegistry.clear();
    AgentRegistry.registerFactory('echo', (c, t) => new EchoAgent(c, t));
    AgentRegistry.registerFactory('assistant', (c, t) => new EchoAgent(c, t));
    await AgentRegistry.initialize([
      { name: 'echo', enabled: true, model: 'default', skills: [], tools: [] },
      { name: 'assistant', enabled: true, model: 'default', skills: [], tools: [] },
    ]);
  });

  it('routes by keyword match', async () => {
    const router = new AgentRouter({
      rules: [
        { agent: 'assistant', priority: 10, keywords: ['분석', '알려'] },
        { agent: 'echo', priority: 1, keywords: ['test', 'ping'] },
      ],
      fallback: 'echo',
    });

    expect((await router.route('데이터를 분석해줘')).agent).toBe('assistant');
    expect((await router.route('test')).agent).toBe('echo');
  });

  it('routes by regex pattern', async () => {
    const router = new AgentRouter({
      rules: [
        { agent: 'assistant', priority: 10, patterns: ['\\bDAU\\b'] },
      ],
      fallback: 'echo',
    });

    expect((await router.route('앱 123의 DAU 알려줘')).agent).toBe('assistant');
  });

  it('falls back when no rules match', async () => {
    const router = new AgentRouter({
      rules: [
        { agent: 'assistant', priority: 10, keywords: ['분석'] },
      ],
      fallback: 'echo',
    });

    expect((await router.route('xyz random text')).agent).toBe('echo');
    expect((await router.route('xyz random text')).matchedRule).toBeNull();
  });

  it('respects priority order', async () => {
    const router = new AgentRouter({
      rules: [
        { agent: 'echo', priority: 1, keywords: ['test'] },
        { agent: 'assistant', priority: 10, keywords: ['test'] },
      ],
      fallback: 'echo',
    });

    // Higher priority (assistant=10) wins over lower (echo=1)
    expect((await router.route('test')).agent).toBe('assistant');
  });

  it('skips disabled agents', async () => {
    const agent = AgentRegistry.get('assistant');
    agent.setEnabled(false);

    const router = new AgentRouter({
      rules: [
        { agent: 'assistant', priority: 10, keywords: ['분석'] },
        { agent: 'echo', priority: 1, keywords: ['분석'] },
      ],
      fallback: 'echo',
    });

    // assistant is disabled, so echo (lower priority) should match
    expect((await router.route('분석해줘')).agent).toBe('echo');
  });

  it('includes matched rule info', async () => {
    const router = new AgentRouter({
      rules: [
        { agent: 'assistant', priority: 10, keywords: ['분석'] },
      ],
      fallback: 'echo',
    });

    const result = await router.route('분석해줘');
    expect(result.matchedRule).toBe('keyword:분석');
  });

  it('uses llm router when keyword rules miss', async () => {
    const router = new AgentRouter(
      {
        rules: [],
        fallback: 'echo',
      },
      {
        llmRouter: async (query, candidates) => {
          expect(query).toBe('원인 분석 부탁해');
          expect(candidates.map(candidate => candidate.name)).toEqual(['echo', 'assistant']);
          return { agent: 'assistant', reason: '분석 요청' };
        },
      },
    );

    const result = await router.route('원인 분석 부탁해');
    expect(result.agent).toBe('assistant');
    expect(result.llmRouted).toBe(true);
    expect(result.reason).toBe('분석 요청');
  });

  describe('with NetworkState', () => {
    it('records routing history on keyword match', async () => {
      const router = new AgentRouter({
        rules: [{ agent: 'assistant', priority: 10, keywords: ['분석'] }],
        fallback: 'echo',
      });

      const state = createNetworkState();
      const result = await router.route('데이터 분석해줘', state);

      expect(result.agent).toBe('assistant');
      expect(state.history).toHaveLength(1);
      expect(state.history[0]).toMatchObject({ agent: 'assistant', reason: 'keyword:분석' });
    });

    it('records routing history on pattern match', async () => {
      const router = new AgentRouter({
        rules: [{ agent: 'assistant', priority: 10, patterns: ['\\bDAU\\b'] }],
        fallback: 'echo',
      });

      const state = createNetworkState();
      await router.route('DAU 알려줘', state);

      expect(state.history).toHaveLength(1);
      expect(state.history[0].reason).toMatch(/^pattern:/);
    });

    it('records routing history on fallback', async () => {
      const router = new AgentRouter({
        rules: [{ agent: 'assistant', priority: 10, keywords: ['분석'] }],
        fallback: 'echo',
      });

      const state = createNetworkState();
      await router.route('xyz random text', state);

      expect(state.history).toHaveLength(1);
      expect(state.history[0]).toMatchObject({ agent: 'echo', reason: 'fallback' });
    });

    it('passes state to llmRouter', async () => {
      let received: unknown;
      const router = new AgentRouter(
        { rules: [], fallback: 'echo' },
        {
          llmRouter: async (_q, _c, s) => {
            received = s;
            return { agent: 'assistant', reason: 'chose' };
          },
        },
      );

      const state = createNetworkState<{ userId: string }>({ data: { userId: 'u1' } });
      await router.route('some query', state);

      expect(received).toBe(state);
      expect(state.history).toHaveLength(1);
      expect(state.history[0]).toMatchObject({ agent: 'assistant' });
      expect(state.history[0].reason).toMatch(/^llm:/);
    });

    it('is optional — calling route without state still works', async () => {
      const router = new AgentRouter({
        rules: [{ agent: 'assistant', priority: 10, keywords: ['분석'] }],
        fallback: 'echo',
      });

      const result = await router.route('데이터 분석해줘');
      expect(result.agent).toBe('assistant');
    });
  });
});
