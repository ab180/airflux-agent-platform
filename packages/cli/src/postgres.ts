import { execa } from 'execa';
import { setTimeout as sleep } from 'node:timers/promises';

export interface DockerRunner {
  exec(
    cmd: string,
    args: string[],
  ): Promise<{ exitCode: number; stdout: string; stderr: string }>;
}

export const defaultDockerRunner: DockerRunner = {
  async exec(cmd, args) {
    try {
      const r = await execa(cmd, args, { reject: false });
      return {
        exitCode: r.exitCode ?? 0,
        stdout: r.stdout ?? '',
        stderr: r.stderr ?? '',
      };
    } catch (e) {
      const err = e as { exitCode?: number; stdout?: string; stderr?: string };
      return {
        exitCode: err.exitCode ?? 1,
        stdout: err.stdout ?? '',
        stderr: err.stderr ?? String(e),
      };
    }
  },
};

export type ContainerStatus = 'running' | 'stopped' | 'missing';

export async function inspectContainer(
  name: string,
  runner: DockerRunner = defaultDockerRunner,
): Promise<ContainerStatus> {
  const r = await runner.exec('docker', [
    'inspect',
    '-f',
    '{{.State.Status}}',
    name,
  ]);
  if (r.exitCode !== 0) return 'missing';
  return r.stdout.trim() === 'running' ? 'running' : 'stopped';
}

export interface PostgresConfig {
  containerName: string;
  volumeName: string;
  port: number;
  user: string;
  password: string;
  database: string;
  image: string;
}

export const defaultPostgresConfig: PostgresConfig = {
  containerName: 'airops-pg',
  volumeName: 'airops-pgdata',
  port: 5432,
  user: 'airops',
  password: 'airops',
  database: 'airops',
  image: 'postgres:16-alpine',
};

export async function ensurePostgres(
  cfg: PostgresConfig,
  runner: DockerRunner = defaultDockerRunner,
): Promise<{ reused: boolean }> {
  const status = await inspectContainer(cfg.containerName, runner);
  if (status === 'running') return { reused: true };
  if (status === 'stopped') {
    await runner.exec('docker', ['start', cfg.containerName]);
    return { reused: true };
  }
  await runner.exec('docker', [
    'run',
    '-d',
    '--name',
    cfg.containerName,
    '-v',
    `${cfg.volumeName}:/var/lib/postgresql/data`,
    '-p',
    `${cfg.port}:5432`,
    '-e',
    `POSTGRES_USER=${cfg.user}`,
    '-e',
    `POSTGRES_PASSWORD=${cfg.password}`,
    '-e',
    `POSTGRES_DB=${cfg.database}`,
    cfg.image,
  ]);
  return { reused: false };
}

export async function waitForHealthy(
  cfg: PostgresConfig,
  runner: DockerRunner = defaultDockerRunner,
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> {
  const timeout = options.timeoutMs ?? 15_000;
  const interval = options.intervalMs ?? 500;
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const r = await runner.exec('docker', [
      'exec',
      cfg.containerName,
      'pg_isready',
      '-U',
      cfg.user,
      '-d',
      cfg.database,
      '-q',
    ]);
    if (r.exitCode === 0) return;
    await sleep(interval);
  }
  throw new Error(`Postgres healthcheck timed out after ${timeout}ms`);
}
