import { describe, it, expect, beforeEach } from 'vitest';
import { AgentRouter } from '../routing/router.js';
import { AgentRegistry } from '../registries/agent-registry.js';
import { EchoAgent } from '../agents/echo-agent.js';

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
});
