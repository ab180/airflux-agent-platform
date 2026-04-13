import { describe, it, expect, beforeEach } from 'vitest';
import { AgentRegistry } from '../registries/agent-registry.js';
import { ToolRegistry } from '../registries/tool-registry.js';
import { EchoAgent } from '../agents/echo-agent.js';
import { HttpResponseChannel } from '../channels/console.js';
import { AgentNotFoundError } from '../types/errors.js';
import type { AgentContext } from '../types/agent.js';

describe('AgentRegistry', () => {
  beforeEach(() => {
    AgentRegistry.clear();
    ToolRegistry.clear();
  });

  it('initializes agents from config', async () => {
    AgentRegistry.registerFactory('echo-agent', (config, tools) => new EchoAgent(config, tools));

    await AgentRegistry.initialize([
      {
        name: 'echo-agent',
        enabled: true,
        model: 'default',
        skills: [],
        tools: [],
      },
    ]);

    expect(AgentRegistry.has('echo-agent')).toBe(true);
    expect(AgentRegistry.list()).toHaveLength(1);
  });

  it('registers disabled agents but marks them as disabled', async () => {
    AgentRegistry.registerFactory('echo-agent', (config, tools) => new EchoAgent(config, tools));

    await AgentRegistry.initialize([
      {
        name: 'echo-agent',
        enabled: false,
        model: 'default',
        skills: [],
        tools: [],
      },
    ]);

    expect(AgentRegistry.list()).toHaveLength(1);
    expect(AgentRegistry.get('echo-agent').isEnabled()).toBe(false);
    expect(AgentRegistry.listEnabled()).toHaveLength(0);
  });

  it('executes an agent', async () => {
    AgentRegistry.registerFactory('echo-agent', (config, tools) => new EchoAgent(config, tools));

    await AgentRegistry.initialize([
      {
        name: 'echo-agent',
        enabled: true,
        model: 'default',
        skills: [],
        tools: [],
      },
    ]);

    const context: AgentContext = {
      question: 'Hello',
      userId: 'test-user',
      sessionId: 'test-session',
      source: 'api',
      responseChannel: new HttpResponseChannel(),
      metadata: {},
    };

    const result = await AgentRegistry.execute('echo-agent', context);
    expect(result.success).toBe(true);
    expect(result.text).toContain('Hello');
  });

  it('throws for unknown agent', () => {
    expect(() => AgentRegistry.get('unknown')).toThrow(AgentNotFoundError);
  });

  it('getOptional returns undefined for unknown agent', () => {
    expect(AgentRegistry.getOptional('unknown')).toBeUndefined();
  });

  it('remove deletes an agent', async () => {
    AgentRegistry.registerFactory('echo-agent', (config, tools) => new EchoAgent(config, tools));
    await AgentRegistry.initialize([
      { name: 'echo-agent', enabled: true, model: 'default', skills: [], tools: [] },
    ]);

    expect(AgentRegistry.has('echo-agent')).toBe(true);
    const removed = AgentRegistry.remove('echo-agent');
    expect(removed).toBe(true);
    expect(AgentRegistry.has('echo-agent')).toBe(false);
    expect(AgentRegistry.list()).toHaveLength(0);
  });

  it('remove returns false for non-existent agent', () => {
    expect(AgentRegistry.remove('nonexistent')).toBe(false);
  });

  it('listEnabled filters disabled agents', async () => {
    AgentRegistry.registerFactory('echo-agent', (config, tools) => new EchoAgent(config, tools));
    await AgentRegistry.initialize([
      { name: 'echo-agent', enabled: true, model: 'default', skills: [], tools: [] },
    ]);

    expect(AgentRegistry.listEnabled()).toHaveLength(1);
    AgentRegistry.get('echo-agent').setEnabled(false);
    expect(AgentRegistry.listEnabled()).toHaveLength(0);
  });

  it('setEnabled overrides config enabled state', async () => {
    AgentRegistry.registerFactory('echo-agent', (config, tools) => new EchoAgent(config, tools));
    await AgentRegistry.initialize([
      { name: 'echo-agent', enabled: true, model: 'default', skills: [], tools: [] },
    ]);

    const agent = AgentRegistry.get('echo-agent');
    expect(agent.isEnabled()).toBe(true);
    agent.setEnabled(false);
    expect(agent.isEnabled()).toBe(false);
    agent.setEnabled(true);
    expect(agent.isEnabled()).toBe(true);
  });

  it('executeParallel runs multiple agents concurrently', async () => {
    AgentRegistry.registerFactory('echo-agent', (config, tools) => new EchoAgent(config, tools));
    await AgentRegistry.initialize([
      { name: 'echo-agent', enabled: true, model: 'default', skills: [], tools: [] },
    ]);

    const results = await AgentRegistry.executeParallel([
      { agent: 'echo-agent', context: { question: 'Q1', userId: 'u1', sessionId: 's1', source: 'api', responseChannel: new HttpResponseChannel(), metadata: {} } },
      { agent: 'echo-agent', context: { question: 'Q2', userId: 'u2', sessionId: 's2', source: 'api', responseChannel: new HttpResponseChannel(), metadata: {} } },
    ]);

    expect(results).toHaveLength(2);
    expect(results[0].result.success).toBe(true);
    expect(results[1].result.success).toBe(true);
    expect(results[0].durationMs).toBeGreaterThanOrEqual(0);
  });
});
