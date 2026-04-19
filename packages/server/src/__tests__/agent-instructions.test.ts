import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resolve } from 'path';
import { setSettingsDir } from '@airflux/core';
import { getAgentInstructions } from '../agents/instructions.js';
import { createPromptVersion } from '../store/prompt-store.js';
import { getDb } from '../store/db.js';

describe('getAgentInstructions', () => {
  beforeAll(() => {
    setSettingsDir(resolve(import.meta.dirname, '../../../..', 'settings'));
  });

  beforeEach(() => {
    try {
      getDb().exec('DELETE FROM prompt_versions');
    } catch {
      // table created lazily
    }
  });

  it('returns the current DB prompt content when present', () => {
    createPromptVersion('chief-agent', 'v-db-1', 'DB-sourced instructions', 'test', true);
    const text = getAgentInstructions('chief-agent');
    expect(text).toBe('DB-sourced instructions');
  });

  it('falls back to filesystem instructions when no DB version exists', () => {
    // chief-agent.md exists in settings/instructions/ with real content.
    const text = getAgentInstructions('chief-agent');
    expect(text.length).toBeGreaterThan(0);
    // Real file starts with a heading or Korean text; should not be the DB string.
    expect(text).not.toBe('DB-sourced instructions');
  });

  it('returns empty string for unknown agent with no file or DB row', () => {
    const text = getAgentInstructions('no-such-agent-xyz');
    expect(text).toBe('');
  });

  it('DB version takes precedence even if filesystem file exists', () => {
    createPromptVersion('chief-agent', 'v-override', 'OVERRIDE from DB', 'override test', true);
    const text = getAgentInstructions('chief-agent');
    expect(text).toBe('OVERRIDE from DB');
  });
});
