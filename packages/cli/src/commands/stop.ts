import { Command } from 'commander';
import treeKill from 'tree-kill';
import { defaultDockerRunner, defaultPostgresConfig, type DockerRunner } from '../postgres.js';
import { readState, clearState } from '../state.js';
import { findRepoRoot } from '../repo-root.js';

export interface RunStopOptions {
  cwd?: string;
  runner?: DockerRunner;
  kill?: (pid: number, signal: NodeJS.Signals | 0) => boolean;
  gracePeriodMs?: number;
  reset?: boolean;
  confirm?: () => Promise<boolean>;
  log?: (msg: string) => void;
  skipConfirm?: boolean;
}

export async function runStop(opts: RunStopOptions = {}): Promise<void> {
  const cwd = opts.cwd ?? findRepoRoot();
  const runner = opts.runner ?? defaultDockerRunner;
  const kill = opts.kill ?? ((pid, sig) => process.kill(pid, sig));
  const gracePeriodMs = opts.gracePeriodMs ?? 5000;
  const log = opts.log ?? ((m) => console.log(m));
  const state = readState(cwd);

  if (!state) {
    log('실행 중인 서비스가 없습니다.');
    return;
  }

  const killers: Array<Promise<void>> = [];
  for (const service of [state.services.web, state.services.server] as const) {
    if (typeof service.pid === 'number') {
      const pid = service.pid;
      killers.push(new Promise<void>((resolve) => {
        let resolved = false;
        const finish = () => { if (!resolved) { resolved = true; resolve(); } };
        let poll: ReturnType<typeof setInterval>;
        // Escalate to SIGKILL after grace period if SIGTERM didn't take.
        const escalate = setTimeout(() => {
          clearInterval(poll);
          treeKill(pid, 'SIGKILL', () => finish());
        }, gracePeriodMs);
        // Poll process.kill(pid, 0) every 200ms; resolve when it throws (process gone).
        poll = setInterval(() => {
          try { kill(pid, 0); } catch { clearInterval(poll); clearTimeout(escalate); finish(); }
        }, 200);
        try { kill(pid, 'SIGTERM'); } catch { clearInterval(poll); clearTimeout(escalate); finish(); }
      }));
    }
  }
  await Promise.all(killers);

  const containerName = state.services.pg.container ?? defaultPostgresConfig.containerName;
  if (opts.reset) {
    if (!opts.skipConfirm) {
      const ok = opts.confirm ? await opts.confirm() : false;
      if (!ok) {
        log('취소되었습니다.');
        return;
      }
    }
    await runner.exec('docker', ['rm', '-fv', containerName]);
    await runner.exec('docker', ['volume', 'rm', defaultPostgresConfig.volumeName]);
  } else {
    await runner.exec('docker', ['stop', containerName]);
  }

  clearState(cwd);
  log(opts.reset ? '중단 + 데이터 초기화 완료.' : '중단 완료 (데이터 유지).');
}

export function registerStop(program: Command): void {
  program
    .command('stop')
    .description('Stop running services; --reset wipes the Postgres volume too')
    .option('--reset', 'delete the airops-pgdata volume (DATA LOSS)')
    .option('--yes', 'skip confirmation prompt for --reset')
    .action(async (options: { reset?: boolean; yes?: boolean }) => {
      await runStop({
        reset: options.reset,
        skipConfirm: options.yes,
        confirm: async () => {
          const readline = await import('node:readline/promises');
          const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
          const ans = await rl.question('볼륨을 삭제하면 데이터가 사라집니다. 계속? [y/N] ');
          rl.close();
          return ans.trim().toLowerCase() === 'y';
        },
      });
    });
}
