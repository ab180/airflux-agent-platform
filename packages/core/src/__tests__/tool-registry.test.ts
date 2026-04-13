import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import { ToolRegistry } from '../registries/tool-registry.js';
import { ToolNotFoundError } from '../types/errors.js';

describe('ToolRegistry', () => {
  beforeEach(() => {
    ToolRegistry.clear();
  });

  it('registers and retrieves a tool', () => {
    ToolRegistry.register('test-tool', {
      description: 'A test tool',
      inputSchema: z.object({ value: z.string() }),
      execute: async (input) => input,
    });

    const tool = ToolRegistry.get('test-tool');
    expect(tool).toBeDefined();
    expect(tool.description).toBe('A test tool');
  });

  it('throws ToolNotFoundError for missing tool', () => {
    expect(() => ToolRegistry.get('nonexistent')).toThrow(ToolNotFoundError);
  });

  it('returns undefined for getOptional on missing tool', () => {
    expect(ToolRegistry.getOptional('nonexistent')).toBeUndefined();
  });

  it('lists all registered tools', () => {
    ToolRegistry.register('tool-a', {
      description: 'A',
      inputSchema: z.object({}),
      execute: async () => ({}),
    });
    ToolRegistry.register('tool-b', {
      description: 'B',
      inputSchema: z.object({}),
      execute: async () => ({}),
    });

    expect(ToolRegistry.list()).toEqual(['tool-a', 'tool-b']);
  });

  it('getMany returns only existing tools', () => {
    ToolRegistry.register('exists', {
      description: 'exists',
      inputSchema: z.object({}),
      execute: async () => ({}),
    });

    const result = ToolRegistry.getMany(['exists', 'missing']);
    expect(Object.keys(result)).toEqual(['exists']);
  });
});
