import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readState,
  writeState,
  clearState,
  stateFilePath,
  STATE_VERSION,
  type AiropsState,
} from '../state.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'airops-state-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const sampleState = (): AiropsState => ({
  version: STATE_VERSION,
  startedAt: '2026-04-22T00:00:00.000Z',
  services: {
    pg: { container: 'airops-pg', port: 5432 },
    server: { pid: 100, port: 3100 },
    web: { pid: 101, port: 3200 },
  },
});

describe('state', () => {
  it('returns null when file does not exist', () => {
    expect(readState(root)).toBeNull();
  });

  it('writes and reads round-trip', () => {
    const s = sampleState();
    writeState(s, root);
    expect(readState(root)).toEqual(s);
  });

  it('returns null for mismatched version', () => {
    mkdirSync(join(root, '.airops'));
    writeFileSync(
      stateFilePath(root),
      JSON.stringify({ version: 999, services: {} }),
    );
    expect(readState(root)).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    mkdirSync(join(root, '.airops'));
    writeFileSync(stateFilePath(root), '{not-json');
    expect(readState(root)).toBeNull();
  });

  it('clearState deletes the file if present', () => {
    writeState(sampleState(), root);
    clearState(root);
    expect(readState(root)).toBeNull();
  });

  it('clearState is a no-op when missing', () => {
    expect(() => clearState(root)).not.toThrow();
  });
});
