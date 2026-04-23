import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { execa } from 'execa';
import { defaultDockerRunner, defaultPostgresConfig, type DockerRunner } from '../postgres.js';
import { readState } from '../state.js';
import { findRepoRoot } from '../repo-root.js';

function requireState(cwd: string) {
  const s = readState(cwd);
  if (!s) throw new Error('실행 중이 아닙니다. 먼저 `airops start` 를 실행하세요.');
  return s;
}

function connectionUrl(cwd: string): string {
  const s = requireState(cwd);
  const cfg = defaultPostgresConfig;
  return `postgres://${cfg.user}:${cfg.password}@localhost:${s.services.pg.port}/${cfg.database}`;
}

export async function runDbUrl(opts: { cwd?: string; log?: (m: string) => void } = {}): Promise<void> {
  const cwd = opts.cwd ?? findRepoRoot();
  const log = opts.log ?? ((m) => console.log(m));
  log(connectionUrl(cwd));
}

/** Replaces current process with `docker exec -it airops-pg psql ...`. */
export async function runDbPsql(opts: { cwd?: string } = {}): Promise<never> {
  const cwd = opts.cwd ?? findRepoRoot();
  requireState(cwd);
  const cfg = defaultPostgresConfig;
  await execa('docker', ['exec', '-it', cfg.containerName, 'psql', '-U', cfg.user, cfg.database], {
    stdio: 'inherit',
    reject: false,
  });
  process.exit(0);
}

export async function runDbDump(opts: {
  cwd?: string;
  runner?: DockerRunner;
  file?: string;
  log?: (m: string) => void;
}): Promise<void> {
  const cwd = opts.cwd ?? findRepoRoot();
  const runner = opts.runner ?? defaultDockerRunner;
  requireState(cwd);
  const cfg = defaultPostgresConfig;
  const r = await runner.exec('docker', [
    'exec',
    cfg.containerName,
    'pg_dump',
    '-U',
    cfg.user,
    cfg.database,
  ]);
  if (r.exitCode !== 0) throw new Error(`pg_dump failed: ${r.stderr}`);
  if (opts.file) {
    (await import('node:fs')).writeFileSync(opts.file, r.stdout);
    (opts.log ?? console.log)(`dumped to ${opts.file}`);
  } else {
    process.stdout.write(r.stdout);
  }
}

export async function runDbRestore(opts: {
  cwd?: string;
  runner?: DockerRunner;
  file: string;
  log?: (m: string) => void;
}): Promise<void> {
  const cwd = opts.cwd ?? findRepoRoot();
  requireState(cwd);
  const cfg = defaultPostgresConfig;
  const sql = readFileSync(opts.file, 'utf-8');

  // Test path: when a runner override is provided, route through it
  // (kept for unit-test compatibility — the runner mock just verifies
  // arg shape, not stdin streaming).
  if (opts.runner) {
    const r = await opts.runner.exec('docker', [
      'exec', '-i', cfg.containerName, 'psql', '-U', cfg.user, cfg.database,
    ]);
    if (r.exitCode !== 0) throw new Error(`psql restore failed: ${r.stderr}`);
    (opts.log ?? console.log)('restore 완료');
    return;
  }

  // Production path: pipe the SQL into docker exec -i psql via execa stdin.
  const result = await execa(
    'docker',
    ['exec', '-i', cfg.containerName, 'psql', '-U', cfg.user, cfg.database],
    { input: sql, reject: false },
  );
  if (result.exitCode !== 0) {
    const tail = (result.stderr ?? '').trim();
    throw new Error(`psql restore failed (exit ${result.exitCode}): ${tail}`);
  }
  (opts.log ?? console.log)('restore 완료');
}

export async function runDbReset(opts: {
  cwd?: string;
  runner?: DockerRunner;
  confirm: () => Promise<boolean>;
  log?: (m: string) => void;
}): Promise<void> {
  const cwd = opts.cwd ?? findRepoRoot();
  const runner = opts.runner ?? defaultDockerRunner;
  const log = opts.log ?? ((m) => console.log(m));
  const cfg = defaultPostgresConfig;
  const ok = await opts.confirm();
  if (!ok) { log('취소되었습니다.'); return; }
  await runner.exec('docker', ['rm', '-fv', cfg.containerName]);
  await runner.exec('docker', ['volume', 'rm', cfg.volumeName]);
  log('DB가 초기화되었습니다. 다음 `airops start` 에서 빈 상태로 시작합니다.');
}

export function registerDb(program: Command): void {
  const db = program.command('db').description('Database utilities');

  db.command('url').description('print the Postgres connection URL').action(() => runDbUrl({}));
  db.command('psql').description('open a psql session in airops-pg').action(() => runDbPsql({}));
  db.command('dump')
    .description('pg_dump the airops database')
    .option('--file <path>', 'write the dump to a file (default: stdout)')
    .action((opts: { file?: string }) => runDbDump({ file: opts.file }));
  db.command('restore <file>')
    .description('restore a dump file into airops database')
    .action((file: string) => runDbRestore({ file }));
  db.command('reset')
    .description('DROP the airops-pgdata volume and recreate an empty DB')
    .option('--yes', 'skip confirmation prompt')
    .action(async (opts: { yes?: boolean }) => {
      await runDbReset({
        confirm: async () => {
          if (opts.yes) return true;
          const readline = await import('node:readline/promises');
          const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
          const ans = await rl.question('DB를 초기화하면 데이터가 사라집니다. 계속? [y/N] ');
          rl.close();
          return ans.trim().toLowerCase() === 'y';
        },
      });
    });
}
