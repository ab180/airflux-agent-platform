import { describe, it, expect, beforeEach } from 'vitest';
import { resolve } from 'path';
import { loadConfig, loadConfigOptional, setSettingsDir } from '../config/loader.js';
import { ConfigLoadError } from '../types/errors.js';

describe('ConfigLoader', () => {
  beforeEach(() => {
    setSettingsDir(resolve(import.meta.dirname, '../../../../settings'));
  });

  it('loads agents.yaml', () => {
    const agents = loadConfig<unknown[]>('agents');
    expect(Array.isArray(agents)).toBe(true);
    expect(agents.length).toBeGreaterThan(0);
  });

  it('throws ConfigLoadError for missing file', () => {
    expect(() => loadConfig('nonexistent')).toThrow(ConfigLoadError);
  });

  it('returns default for loadConfigOptional on missing file', () => {
    const result = loadConfigOptional('nonexistent', { fallback: true });
    expect(result).toEqual({ fallback: true });
  });
});
