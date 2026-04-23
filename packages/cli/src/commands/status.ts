import { Command } from 'commander';
import { readState } from '../state.js';
import { findRepoRoot } from '../repo-root.js';

export interface RunStatusOptions {
  cwd?: string;
  isAlive?: (pid: number) => boolean;
  log?: (msg: string) => void;
}

export async function runStatus(opts: RunStatusOptions = {}): Promise<void> {
  const cwd = opts.cwd ?? findRepoRoot();
  const isAlive =
    opts.isAlive ?? ((pid) => { try { process.kill(pid, 0); return true; } catch { return false; } });
  const log = opts.log ?? ((m) => console.log(m));
  const state = readState(cwd);

  if (!state) {
    log('실행 중이 아닙니다.');
    return;
  }

  log(`started at: ${state.startedAt}`);
  log(`[pg]     ${state.services.pg.container ?? '(unknown)'} @ localhost:${state.services.pg.port}`);
  for (const [label, svc] of [
    ['server', state.services.server] as const,
    ['web', state.services.web] as const,
  ]) {
    const pidStatus =
      typeof svc.pid === 'number' ? (isAlive(svc.pid) ? '✓ alive' : '✗ stale') : '(no pid)';
    log(`[${label.padEnd(6)}] http://localhost:${svc.port}  pid ${svc.pid ?? '-'}  ${pidStatus}`);
  }
}

export function registerStatus(program: Command): void {
  program
    .command('status')
    .description('Show URLs/ports/health of running services')
    .action(async () => {
      await runStatus({});
    });
}
