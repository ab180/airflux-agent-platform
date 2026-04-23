import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  hasAb180Config,
  registerAb180Tools,
} from '../ab180-extensions/index.js';
import { ToolRegistry, setSettingsDir } from '@airflux/core';

let dir: string;
const priorSettings = process.cwd();

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ab180-ext-'));
  mkdirSync(dir, { recursive: true });
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  setSettingsDir(priorSettings);
  ToolRegistry.clear();
});

describe('hasAb180Config', () => {
  it('returns false when neither semantic-layer.yaml nor domain-glossary.yaml exists', () => {
    expect(hasAb180Config(dir)).toBe(false);
  });

  it('returns true when semantic-layer.yaml is present', () => {
    writeFileSync(join(dir, 'semantic-layer.yaml'), 'database: x\nschema: y\n');
    expect(hasAb180Config(dir)).toBe(true);
  });

  it('returns true when domain-glossary.yaml is present', () => {
    writeFileSync(join(dir, 'domain-glossary.yaml'), 'terms: {}\n');
    expect(hasAb180Config(dir)).toBe(true);
  });
});

describe('registerAb180Tools', () => {
  beforeEach(() => {
    ToolRegistry.clear();
    // Empty config files so the loaders don't throw; tool registration
    // only needs valid-shaped YAML, not actual content.
    writeFileSync(
      join(dir, 'semantic-layer.yaml'),
      'database: ""\nschema: ""\ntables: {}\nmetrics: {}\n',
    );
    writeFileSync(join(dir, 'domain-glossary.yaml'), 'terms: {}\n');
    setSettingsDir(dir);
  });

  it('registers the expected 7 AB180 tools', () => {
    registerAb180Tools();
    for (const name of [
      'queryData',
      'searchDocs',
      'lookupTerm',
      'findTermsInQuery',
      'getSemanticLayer',
      'getTableSchema',
      'getMetricSQL',
    ]) {
      expect(ToolRegistry.has(name)).toBe(true);
    }
  });

  it('queryData flags billions-tier without appId as 역질의', async () => {
    registerAb180Tools();
    const tool = ToolRegistry.get('queryData');
    const result = (await tool.execute({
      question: '이벤트 로그 추이',
    })) as { error?: string };
    expect(result.error).toMatch(/역질의/);
  });

  it('getSemanticLayer returns schema config', async () => {
    registerAb180Tools();
    const tool = ToolRegistry.get('getSemanticLayer');
    const result = (await tool.execute({})) as {
      database: string;
      tables: string[];
      metrics: string[];
    };
    expect(result).toHaveProperty('database');
    expect(Array.isArray(result.tables)).toBe(true);
    expect(Array.isArray(result.metrics)).toBe(true);
  });
});
