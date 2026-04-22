import { Command } from 'commander';
import { defaultDockerRunner, defaultPostgresConfig, type DockerRunner } from '../postgres.js';
import { readState, clearState } from '../state.js';

export interface RunStopOptions {
  cwd?: string;
  runner?: DockerRunner;
  kill?: (pid: number, signal: NodeJS.Signals) => boolean;
  reset?: boolean;
  confirm?: () => Promise<boolean>;
  log?: (msg: string) => void;
  skipConfirm?: boolean;
}

export async function runStop(opts: RunStopOptions = {}): Promise<void> {
  const cwd = opts.cwd ?? process.cwd();
  const runner = opts.runner ?? defaultDockerRunner;
  const kill = opts.kill ?? ((pid, sig) => process.kill(pid, sig));
  const log = opts.log ?? ((m) => console.log(m));
  const state = readState(cwd);

  if (!state) {
    log('실행 중인 서비스가 없습니다.');
    return;
  }

  for (const service of [state.services.web, state.services.server] as const) {
    if (typeof service.pid === 'number') {
      try { kill(service.pid, 'SIGTERM'); } catch { /* already gone */ }
    }
  }

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
