import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeState, readState, STATE_VERSION } from '../state.js';
import { runStop } from '../commands/stop.js';

function makeRunner() {
  return {
    exec: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' }),
  };
}

describe('runStop', () => {
  it('SIGTERMs known pids, docker-stops the container, clears state', async () => {
    const root = mkdtempSync(join(tmpdir(), 'airops-stop-'));
    try {
      writeState(
        {
          version: STATE_VERSION,
          startedAt: '2026-04-22',
          services: {
            pg: { container: 'airops-pg', port: 5432 },
            server: { pid: 99991, port: 3100 },
            web: { pid: 99992, port: 3200 },
          },
        },
        root,
      );
      const runner = makeRunner();
      const kills: Array<[number, NodeJS.Signals]> = [];
      await runStop({
        cwd: root,
        runner,
        kill: (pid, sig) => { kills.push([pid, sig]); return true; },
        reset: false,
      });
      expect(kills).toContainEqual([99991, 'SIGTERM']);
      expect(kills).toContainEqual([99992, 'SIGTERM']);
      expect(runner.exec).toHaveBeenCalledWith('docker', ['stop', 'airops-pg']);
      expect(readState(root)).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('--reset also removes the pg container and volume', async () => {
    const root = mkdtempSync(join(tmpdir(), 'airops-stop-r-'));
    try {
      writeState(
        {
          version: STATE_VERSION,
          startedAt: '2026-04-22',
          services: {
            pg: { container: 'airops-pg', port: 5432 },
            server: { port: 3100 },
            web: { port: 3200 },
          },
        },
        root,
      );
      const runner = makeRunner();
      await runStop({
        cwd: root,
        runner,
        kill: () => true,
        reset: true,
        confirm: async () => true,
      });
      const cmds = runner.exec.mock.calls.map((c) => c.slice(0, 2));
      expect(cmds).toContainEqual(['docker', ['rm', '-fv', 'airops-pg']]);
      expect(cmds).toContainEqual(['docker', ['volume', 'rm', 'airops-pgdata']]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('noop message when no state file present', async () => {
    const root = mkdtempSync(join(tmpdir(), 'airops-stop-n-'));
    try {
      const runner = makeRunner();
      const logs: string[] = [];
      await runStop({
        cwd: root,
        runner,
        kill: () => true,
        reset: false,
        log: (m) => logs.push(m),
      });
      expect(logs.join('\n')).toMatch(/실행 중인 서비스가 없습니다/);
      expect(runner.exec).not.toHaveBeenCalled();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
