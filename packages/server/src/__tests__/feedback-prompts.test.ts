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

// ─── Feedback API ─────────────────────────────────────────────────

describe('POST /api/feedback', () => {
  it('accepts valid feedback', async () => {
    const res = await app.request('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        traceId: '12345678-1234-1234-1234-123456789abc',
        rating: 'positive',
        agent: 'echo-agent',
        comment: '좋은 답변!',
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.id).toBeDefined();
  });

  it('rejects missing traceId', async () => {
    const res = await app.request('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating: 'positive' }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects invalid rating', async () => {
    const res = await app.request('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        traceId: '12345678-1234-1234-1234-123456789abc',
        rating: 'neutral',
      }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects non-UUID traceId', async () => {
    const res = await app.request('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        traceId: 'not-a-uuid',
        rating: 'positive',
      }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects invalid agent name pattern', async () => {
    const res = await app.request('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        traceId: '12345678-1234-1234-1234-123456789abc',
        rating: 'positive',
        agent: '../etc/passwd',
      }),
    });
    expect(res.status).toBe(400);
  });
});

// ─── Prompt API ───────────────────────────────────────────────────

describe('Prompt version API', () => {
  const agent = 'echo-agent';
  const uniqueVersion = `test-${Date.now()}`;

  it('creates a prompt version', async () => {
    const res = await app.request(`/api/admin/prompts/${agent}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        version: uniqueVersion,
        content: 'Test system prompt',
        description: 'Test version',
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.prompt.version).toBe(uniqueVersion);
    expect(body.prompt.isCurrent).toBe(true);
  });

  it('lists prompt versions', async () => {
    const res = await app.request(`/api/admin/prompts/${agent}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.agent).toBe(agent);
    expect(body.versions.length).toBeGreaterThan(0);
  });

  it('rejects duplicate version name', async () => {
    const res = await app.request(`/api/admin/prompts/${agent}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        version: uniqueVersion,
        content: 'Duplicate',
        description: 'Should fail',
      }),
    });
    expect(res.status).toBe(409);
  });

  it('rejects missing version field', async () => {
    const res = await app.request(`/api/admin/prompts/${agent}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'No version' }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects missing content field', async () => {
    const res = await app.request(`/api/admin/prompts/${agent}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: 'v99' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 for rollback to nonexistent version', async () => {
    const res = await app.request(`/api/admin/prompts/${agent}/rollback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ versionId: 99999 }),
    });
    expect(res.status).toBe(404);
  });

  it('lists prompt agents', async () => {
    const res = await app.request('/api/admin/prompts');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.agents).toContain(agent);
  });
});

// ─── Admin feedback list ─────────────────────────────────────────

describe('GET /api/admin/feedback', () => {
  it('returns feedback list with total', async () => {
    const res = await app.request('/api/admin/feedback');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.feedback).toBeDefined();
    expect(Array.isArray(body.feedback)).toBe(true);
    expect(typeof body.total).toBe('number');
  });

  it('filters by rating', async () => {
    const res = await app.request('/api/admin/feedback?rating=positive');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.feedback).toBeDefined();
  });

  it('filters by agent', async () => {
    const res = await app.request('/api/admin/feedback?agent=echo-agent');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.feedback).toBeDefined();
  });
});

describe('GET /api/admin/feedback/:traceId', () => {
  it('returns 404 for non-existent traceId', async () => {
    const res = await app.request('/api/admin/feedback/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });

  it('returns feedback detail for existing traceId', async () => {
    // First create a feedback entry
    await app.request('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        traceId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        rating: 'negative',
        agent: 'echo-agent',
        comment: '개선 필요',
      }),
    });

    const res = await app.request('/api/admin/feedback/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.feedback.rating).toBe('negative');
    expect(body.feedback.comment).toBe('개선 필요');
  });
});

// ─── Admin overview ───────────────────────────────────────────────

describe('GET /api/admin/overview', () => {
  it('returns overview with feedback stats', async () => {
    const res = await app.request('/api/admin/overview');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.agents).toBeDefined();
    expect(body.metrics).toBeDefined();
    expect(body.feedback).toBeDefined();
    expect(typeof body.feedback.total).toBe('number');
    expect(typeof body.feedback.positiveRate).toBe('number');
  });
});
