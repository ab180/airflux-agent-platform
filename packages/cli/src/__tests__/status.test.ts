import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeState, STATE_VERSION } from '../state.js';
import { runStatus } from '../commands/status.js';

describe('runStatus', () => {
  it('prints service table with urls', async () => {
    const root = mkdtempSync(join(tmpdir(), 'airops-status-'));
    try {
      writeState(
        {
          version: STATE_VERSION,
          startedAt: '2026-04-22T00:00:00Z',
          services: {
            pg: { container: 'airops-pg', port: 5432 },
            server: { pid: process.pid, port: 3100 },
            web: { pid: process.pid, port: 3200 },
          },
        },
        root,
      );
      const lines: string[] = [];
      await runStatus({ cwd: root, isAlive: () => true, log: (m) => lines.push(m) });
      const joined = lines.join('\n');
      expect(joined).toMatch(/airops-pg/);
      expect(joined).toMatch(/localhost:5432/);
      expect(joined).toMatch(/http:\/\/localhost:3100/);
      expect(joined).toMatch(/http:\/\/localhost:3200/);
      expect(joined).toMatch(/alive|running|✓/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reports stale entries when pid is not alive', async () => {
    const root = mkdtempSync(join(tmpdir(), 'airops-status-s-'));
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
      const lines: string[] = [];
      await runStatus({ cwd: root, isAlive: () => false, log: (m) => lines.push(m) });
      expect(lines.join('\n')).toMatch(/stale|dead|✗/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reports "실행 중이 아닙니다" when state is missing', async () => {
    const root = mkdtempSync(join(tmpdir(), 'airops-status-m-'));
    try {
      const lines: string[] = [];
      await runStatus({ cwd: root, isAlive: () => true, log: (m) => lines.push(m) });
      expect(lines.join('\n')).toMatch(/실행 중이 아닙니다|not running/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
