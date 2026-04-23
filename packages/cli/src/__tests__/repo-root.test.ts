import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findRepoRoot } from '../repo-root.js';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'airops-root-'));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('findRepoRoot', () => {
  it('finds the airflux-agent-platform monorepo root walking up', () => {
    const root = join(tmp, 'fake-repo');
    const nested = join(root, 'packages', 'cli', 'src');
    mkdirSync(nested, { recursive: true });
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ name: 'airflux-agent-platform' }),
    );
    expect(findRepoRoot(nested)).toBe(root);
  });

  it('ignores non-matching package.json files on the way up', () => {
    const root = join(tmp, 'fake-repo');
    const nested = join(root, 'apps', 'dashboard', 'src');
    mkdirSync(nested, { recursive: true });
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ name: 'airflux-agent-platform' }),
    );
    writeFileSync(
      join(root, 'apps', 'dashboard', 'package.json'),
      JSON.stringify({ name: 'dashboard' }),
    );
    expect(findRepoRoot(nested)).toBe(root);
  });

  it('throws a clear error when no matching root exists', () => {
    const lonely = join(tmp, 'unrelated', 'subdir');
    mkdirSync(lonely, { recursive: true });
    expect(() => findRepoRoot(lonely)).toThrow(/airflux-agent-platform/);
  });

  it('returns the start directory itself when it is the root', () => {
    const root = join(tmp, 'fake-repo');
    mkdirSync(root, { recursive: true });
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ name: 'airflux-agent-platform' }),
    );
    expect(findRepoRoot(root)).toBe(root);
  });

  it('skips a malformed package.json and keeps walking', () => {
    const root = join(tmp, 'fake-repo');
    const nested = join(root, 'a', 'b');
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(root, 'a', 'package.json'), '{not-json');
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ name: 'airflux-agent-platform' }),
    );
    expect(findRepoRoot(nested)).toBe(root);
  });
});
