import { describe, it, expect, vi } from 'vitest';
import {
  currentPlatform,
  insideContainerFromCgroup,
  makeKeychainReader,
} from '../platform.js';

describe('currentPlatform', () => {
  it('returns darwin | linux | win32 | other', () => {
    expect(['darwin', 'linux', 'win32', 'other']).toContain(currentPlatform());
  });
});

describe('insideContainerFromCgroup', () => {
  it('detects docker cgroup signature', () => {
    expect(
      insideContainerFromCgroup('12:cpu:/docker/abcd1234\n11:mem:/docker/abcd1234\n'),
    ).toBe(true);
  });
  it('detects kubernetes cgroup signature', () => {
    expect(
      insideContainerFromCgroup('10:cpu:/kubepods/pod-xxx/foo\n'),
    ).toBe(true);
  });
  it('returns false for a normal macOS/Linux host cgroup', () => {
    expect(insideContainerFromCgroup('0::/user.slice/user-1000.slice\n')).toBe(false);
  });
  it('returns false when cgroup is empty/unreadable (null input)', () => {
    expect(insideContainerFromCgroup(null)).toBe(false);
  });
});

describe('makeKeychainReader', () => {
  it('calls `security` CLI with the correct args and returns trimmed stdout', () => {
    const exec = vi.fn().mockReturnValue({ exitCode: 0, stdout: 'secret-token\n', stderr: '' });
    const reader = makeKeychainReader(exec);
    expect(reader.readGenericPassword('Claude Code-credentials')).toBe('secret-token');
    expect(exec).toHaveBeenCalledWith('security', [
      'find-generic-password',
      '-s',
      'Claude Code-credentials',
      '-w',
    ]);
  });

  it('returns null if security exits non-zero', () => {
    const exec = vi.fn().mockReturnValue({ exitCode: 44, stdout: '', stderr: 'not found' });
    const reader = makeKeychainReader(exec);
    expect(reader.readGenericPassword('whatever')).toBeNull();
  });

  it('returns null when exec throws', () => {
    const exec = vi.fn(() => { throw new Error('ENOENT'); });
    const reader = makeKeychainReader(exec);
    expect(reader.readGenericPassword('whatever')).toBeNull();
  });
});
