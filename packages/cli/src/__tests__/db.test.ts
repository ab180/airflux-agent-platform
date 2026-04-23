import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeState, STATE_VERSION } from '../state.js';
import { runDbUrl, runDbDump, runDbRestore, runDbReset } from '../commands/db.js';

function withState(fn: (root: string) => Promise<void>): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'airops-db-'));
  writeState(
    {
      version: STATE_VERSION,
      startedAt: '2026-04-22',
      services: {
        pg: { container: 'airops-pg', port: 5433 },
        server: { port: 3100 },
        web: { port: 3200 },
      },
    },
    root,
  );
  return fn(root).finally(() => rmSync(root, { recursive: true, force: true }));
}

describe('runDbUrl', () => {
  it('prints the connection URL with the state port', async () => {
    await withState(async (root) => {
      const lines: string[] = [];
      await runDbUrl({ cwd: root, log: (m) => lines.push(m) });
      expect(lines.join('\n')).toContain('postgres://airops:airops@localhost:5433/airops');
    });
  });
});

describe('runDbDump', () => {
  it('calls docker exec pg_dump to stdout by default', async () => {
    await withState(async (root) => {
      const runner = { exec: vi.fn().mockResolvedValue({ exitCode: 0, stdout: 'SQL', stderr: '' }) };
      await runDbDump({ cwd: root, runner, log: () => {} });
      const args = runner.exec.mock.calls[0]![1] as string[];
      expect(args[0]).toBe('exec');
      expect(args).toContain('airops-pg');
      expect(args).toContain('pg_dump');
    });
  });
});

describe('runDbRestore', () => {
  it('pipes file into docker exec -i psql', async () => {
    await withState(async (root) => {
      const file = join(root, 'restore.sql');
      const fs = await import('node:fs');
      fs.writeFileSync(file, 'SELECT 1;');
      const runner = { exec: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' }) };
      await runDbRestore({ cwd: root, runner, file, log: () => {} });
      const args = runner.exec.mock.calls[0]![1] as string[];
      expect(args[0]).toBe('exec');
      expect(args).toContain('-i');
      expect(args).toContain('airops-pg');
      expect(args).toContain('psql');
    });
  });
});

describe('runDbReset', () => {
  it('requires confirmation; cancels if user says no', async () => {
    await withState(async (root) => {
      const runner = { exec: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' }) };
      const logs: string[] = [];
      await runDbReset({
        cwd: root,
        runner,
        confirm: async () => false,
        log: (m) => logs.push(m),
      });
      expect(runner.exec).not.toHaveBeenCalled();
      expect(logs.join('\n')).toMatch(/취소/);
    });
  });

  it('drops + recreates when confirmed', async () => {
    await withState(async (root) => {
      const runner = { exec: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' }) };
      await runDbReset({ cwd: root, runner, confirm: async () => true, log: () => {} });
      const calls = runner.exec.mock.calls.map((c) => c.slice(0, 2));
      expect(calls).toContainEqual(['docker', ['rm', '-fv', 'airops-pg']]);
      expect(calls).toContainEqual(['docker', ['volume', 'rm', 'airops-pgdata']]);
    });
  });
});
