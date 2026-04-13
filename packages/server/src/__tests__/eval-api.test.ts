import { describe, it, expect, beforeAll } from 'vitest';
import { resolve } from 'path';
import { AgentRegistry, ToolRegistry, EchoAgent, setSettingsDir } from '@airflux/core';
import { z } from 'zod';
import { app } from '../app.js';

beforeAll(async () => {
  setSettingsDir(resolve(import.meta.dirname, '../../../..', 'settings'));

  if (!ToolRegistry.has('echo')) {
    ToolRegistry.register('echo', {
      description: 'Echoes input',
      inputSchema: z.object({ message: z.string() }),
      execute: async (input: unknown) => input,
    });
  }

  AgentRegistry.clear();
  AgentRegistry.registerFactory('echo-agent', (config, tools) => new EchoAgent(config, tools));
  await AgentRegistry.initialize([
    { name: 'echo-agent', enabled: true, model: 'default', skills: [], tools: ['echo'] },
  ]);
});

describe('Evaluation API', () => {
  it('GET /api/admin/eval/dataset returns dataset', async () => {
    const res = await app.request('/api/admin/eval/dataset');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dataset).toBeDefined();
    expect(typeof body.total).toBe('number');
  });

  it('POST /api/admin/eval/dataset adds a test case', async () => {
    const res = await app.request('/api/admin/eval/dataset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent: 'echo-agent',
        question: 'test case from unit test',
        category: 'unit-test',
        difficulty: 'easy',
        expectedAgent: 'echo-agent',
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.testCase.question).toBe('test case from unit test');
  });

  it('POST /api/admin/eval/dataset rejects missing fields', async () => {
    const res = await app.request('/api/admin/eval/dataset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: 'echo-agent' }),
    });
    expect(res.status).toBe(400);
  });

  it('POST /api/admin/eval/run executes evaluation', async () => {
    const res = await app.request('/api/admin/eval/run', { method: 'POST' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.run).toBeDefined();
    expect(body.run.totalCases).toBeGreaterThan(0);
    expect(typeof body.run.score).toBe('number');
  });

  it('GET /api/admin/eval/runs returns history', async () => {
    const res = await app.request('/api/admin/eval/runs');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.runs).toBeDefined();
    expect(body.runs.length).toBeGreaterThan(0);
  });

  it('GET /api/admin/guardrails lists all guardrails', async () => {
    const res = await app.request('/api/admin/guardrails');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.guardrails.length).toBeGreaterThanOrEqual(5);
    expect(body.guardrails.map((g: { name: string }) => g.name)).toContain('pii-filter');
  });
});
