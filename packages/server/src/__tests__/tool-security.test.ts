import { describe, it, expect, beforeAll } from 'vitest';
import { resolve } from 'path';
import { AgentRegistry, ToolRegistry, SkillRegistry, EchoAgent, setSettingsDir } from '@airflux/core';
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

describe('Tool test endpoint security', () => {
  it('returns 404 for nonexistent tool', async () => {
    const res = await app.request('/api/admin/tools/nonexistent/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(404);
  });

  it('executes echo tool successfully', async () => {
    const res = await app.request('/api/admin/tools/echo/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'test' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.durationMs).toBeDefined();
  });

  it('handles empty body gracefully', async () => {
    const res = await app.request('/api/admin/tools/echo/test', {
      method: 'POST',
    });
    // Should not crash
    expect(res.status).toBe(200);
  });

  it('GET /api/admin/tools/:name returns tool detail', async () => {
    const res = await app.request('/api/admin/tools/echo');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('echo');
    expect(body.description).toBeDefined();
  });

  it('GET /api/admin/tools/:name returns 404 for unknown', async () => {
    const res = await app.request('/api/admin/tools/unknown');
    expect(res.status).toBe(404);
  });
});

describe('SSRF protection via httpGet tool', () => {
  // Register httpGet with SSRF protection for testing
  beforeAll(() => {
    if (!ToolRegistry.has('httpGet')) {
      ToolRegistry.register('httpGet', {
        description: 'HTTP GET with SSRF protection',
        inputSchema: z.object({ url: z.string(), headers: z.record(z.string()).optional() }),
        execute: async (input: unknown) => {
          const { url } = input as { url: string };
          try {
            const parsed = new URL(url);
            const h = parsed.hostname.replace(/^\[|\]$/g, '');
            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
              return { error: 'Only HTTP/HTTPS URLs are allowed' };
            }
            const isPrivate =
              h === 'localhost' || h.startsWith('127.') || h.startsWith('10.') ||
              h.startsWith('192.168.') || h.startsWith('169.254.') || h === '::1' ||
              h.endsWith('.internal') || h.endsWith('.local') || h.endsWith('.localhost');
            if (isPrivate) return { error: 'Internal URLs are not allowed' };
          } catch { return { error: 'Invalid URL' }; }
          return { error: 'Would fetch (test only)' };
        },
      });
    }
  });

  it('blocks localhost', async () => {
    const tool = ToolRegistry.get('httpGet');
    const result = await tool.execute({ url: 'http://localhost:3000/secret' }) as { error?: string };
    expect(result.error).toContain('Internal');
  });

  it('blocks 169.254.x (AWS metadata)', async () => {
    const tool = ToolRegistry.get('httpGet');
    const result = await tool.execute({ url: 'http://169.254.169.254/latest/meta-data/' }) as { error?: string };
    expect(result.error).toContain('Internal');
  });

  it('blocks file:// protocol', async () => {
    const tool = ToolRegistry.get('httpGet');
    const result = await tool.execute({ url: 'file:///etc/passwd' }) as { error?: string };
    expect(result.error).toContain('HTTP/HTTPS');
  });

  it('blocks .internal domains', async () => {
    const tool = ToolRegistry.get('httpGet');
    const result = await tool.execute({ url: 'http://api.internal/secret' }) as { error?: string };
    expect(result.error).toContain('Internal');
  });
});
