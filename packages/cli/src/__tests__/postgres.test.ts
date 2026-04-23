import { describe, it, expect, vi } from 'vitest';
import {
  inspectContainer,
  ensurePostgres,
  waitForHealthy,
  defaultPostgresConfig,
  type DockerRunner,
} from '../postgres.js';

function mkRunner(script: Array<{ exitCode: number; stdout?: string; stderr?: string }>): DockerRunner {
  let i = 0;
  return {
    async exec() {
      const r = script[i++] ?? { exitCode: 0, stdout: '', stderr: '' };
      return { exitCode: r.exitCode, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
    },
  };
}

describe('inspectContainer', () => {
  it('returns running', async () => {
    const r = mkRunner([{ exitCode: 0, stdout: 'running\n' }]);
    expect(await inspectContainer('x', r)).toBe('running');
  });
  it('returns stopped', async () => {
    const r = mkRunner([{ exitCode: 0, stdout: 'exited\n' }]);
    expect(await inspectContainer('x', r)).toBe('stopped');
  });
  it('returns missing when exitCode != 0', async () => {
    const r = mkRunner([{ exitCode: 1, stderr: 'no such container' }]);
    expect(await inspectContainer('x', r)).toBe('missing');
  });
});

describe('ensurePostgres', () => {
  it('reuses running container (reused=true, no start/run)', async () => {
    const exec = vi.fn(async () => ({ exitCode: 0, stdout: 'running', stderr: '' }));
    const r = { exec } satisfies DockerRunner;
    const result = await ensurePostgres(defaultPostgresConfig, r);
    expect(result).toEqual({ reused: true });
    expect(exec).toHaveBeenCalledTimes(1); // only inspect
  });

  it('starts stopped container (reused=true, inspect + start)', async () => {
    const exec = vi.fn()
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'exited', stderr: '' })  // inspect
      .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' });        // start
    const r = { exec } satisfies DockerRunner;
    expect(await ensurePostgres(defaultPostgresConfig, r)).toEqual({ reused: true });
    expect(exec.mock.calls[1]![0]).toBe('docker');
    expect(exec.mock.calls[1]![1]).toEqual(['start', defaultPostgresConfig.containerName]);
  });

  it('creates container when missing (reused=false)', async () => {
    const exec = vi.fn()
      .mockResolvedValueOnce({ exitCode: 1, stdout: '', stderr: '' })  // inspect missing
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'id', stderr: '' }); // run
    const r = { exec } satisfies DockerRunner;
    expect(await ensurePostgres(defaultPostgresConfig, r)).toEqual({ reused: false });
    expect(exec.mock.calls[1]![1]).toContain('run');
    expect(exec.mock.calls[1]![1]).toContain('--name');
    expect(exec.mock.calls[1]![1]).toContain(defaultPostgresConfig.containerName);
    expect(exec.mock.calls[1]![1]).toContain(`${defaultPostgresConfig.port}:5432`);
  });
});

describe('waitForHealthy', () => {
  it('resolves on first successful pg_isready', async () => {
    const r = mkRunner([{ exitCode: 0 }]);
    await expect(
      waitForHealthy(defaultPostgresConfig, r, { timeoutMs: 1000, intervalMs: 1 }),
    ).resolves.toBeUndefined();
  });

  it('throws after timeout when pg_isready never succeeds', async () => {
    const exec = vi.fn().mockResolvedValue({ exitCode: 1, stdout: '', stderr: '' });
    const r = { exec } satisfies DockerRunner;
    await expect(
      waitForHealthy(defaultPostgresConfig, r, { timeoutMs: 50, intervalMs: 10 }),
    ).rejects.toThrow(/timed out/i);
  });
});
