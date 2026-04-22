import { Command } from 'commander';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import {
  defaultPostgresConfig,
  defaultDockerRunner,
  ensurePostgres,
  waitForHealthy,
  type DockerRunner,
  type PostgresConfig,
} from '../postgres.js';
import { pickPort, type GetPortLike } from '../ports.js';
import { spawnChild, terminateChild } from '../orchestra.js';
import { prefixStream } from '../logs.js';
import { readState, writeState, clearState, STATE_VERSION } from '../state.js';

export interface PlanResult {
  pg: { reused: boolean; port: number; container: string };
  server: { port: number; env: Record<string, string> };
  web: { port: number; env: Record<string, string> };
}

/**
 * Pure-ish orchestration planner — given runners/ports/config, produces the
 * concrete plan (which ports, which env vars) without spawning the node
 * children. Lets us unit-test sequencing without real processes.
 */
export async function planStart(opts: {
  runner: DockerRunner;
  getPort: GetPortLike;
  pgConfig: PostgresConfig;
  serverPortRange?: [number, number, number];
  webPortRange?: [number, number, number];
}): Promise<PlanResult> {
  const { runner, getPort, pgConfig } = opts;
  const serverRange = opts.serverPortRange ?? [3100, 3100, 3199];
  const webRange = opts.webPortRange ?? [3200, 3200, 3299];

  const pgResult = await ensurePostgres(pgConfig, runner);
  await waitForHealthy(pgConfig, runner);
  const inspected = await runner.exec('docker', [
    'inspect',
    '-f',
    '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}',
    pgConfig.containerName,
  ]);
  const pgPort =
    inspected.exitCode === 0 && inspected.stdout.trim().length > 0
      ? Number(inspected.stdout.trim())
      : pgConfig.port;

  const serverPort = await pickPort(serverRange[0], serverRange[1], serverRange[2], getPort);
  const webPort = await pickPort(webRange[0], webRange[1], webRange[2], getPort);

  const databaseUrl = `postgres://${pgConfig.user}:${pgConfig.password}@localhost:${pgPort}/${pgConfig.database}`;

  return {
    pg: { reused: pgResult.reused, port: pgPort, container: pgConfig.containerName },
    server: {
      port: serverPort,
      env: {
        PORT: String(serverPort),
        DATABASE_URL: databaseUrl,
        NODE_ENV: 'development',
      },
    },
    web: {
      port: webPort,
      env: {
        PORT: String(webPort),
        API_URL: `http://localhost:${serverPort}`,
        NODE_ENV: 'development',
      },
    },
  };
}

export function registerStart(program: Command): void {
  program
    .command('start')
    .description('Start Postgres + server + dashboard (foreground)')
    .option('--open', 'open the dashboard URL in the default browser')
    .action(async (options: { open?: boolean }) => {
      const repoRoot = resolve(process.cwd());
      const pgConfig = defaultPostgresConfig;

      // Stale state detection — if a previous airops start is still alive,
      // don't double-spawn. If the state is from a dead session, fall through
      // and let the rest of start clean up via writeState.
      const existing = readState(repoRoot);
      if (existing) {
        const isAlive = (pid: number | undefined): boolean => {
          if (typeof pid !== 'number') return false;
          try { process.kill(pid, 0); return true; } catch { return false; }
        };
        if (isAlive(existing.services.server.pid) || isAlive(existing.services.web.pid)) {
          console.error('이미 실행 중인 airops 세션이 있습니다. `airops stop` 후 다시 시도하세요.');
          process.exitCode = 1;
          return;
        }
        // PIDs are dead — clean up the stale state file before continuing.
        clearState(repoRoot);
      }

      console.log('starting airops…');
      const plan = await planStart({
        runner: defaultDockerRunner,
        getPort: async (o) => (await import('get-port')).default(o),
        pgConfig,
      });

      mkdirSync(resolve(repoRoot, '.airops'), { recursive: true });

      const serverChild = spawnChild({
        label: 'server',
        command: 'npm',
        args: ['run', 'dev', '--workspace=@airflux/server'],
        cwd: repoRoot,
        env: plan.server.env,
      });
      const webChild = spawnChild({
        label: 'web',
        command: 'npm',
        args: ['run', 'dev', '--workspace=dashboard'],
        cwd: repoRoot,
        env: plan.web.env,
      });

      if (serverChild.stdout) prefixStream('server', serverChild.stdout, process.stdout);
      if (serverChild.stderr) prefixStream('server', serverChild.stderr, process.stderr);
      if (webChild.stdout) prefixStream('web', webChild.stdout, process.stdout);
      if (webChild.stderr) prefixStream('web', webChild.stderr, process.stderr);

      writeState(
        {
          version: STATE_VERSION,
          startedAt: new Date().toISOString(),
          services: {
            pg: { container: plan.pg.container, port: plan.pg.port },
            server: { pid: serverChild.pid, port: plan.server.port },
            web: { pid: webChild.pid, port: plan.web.port },
          },
        },
        repoRoot,
      );

      console.log(`[pg]     ${plan.pg.container} @ localhost:${plan.pg.port}   ✓ healthy${plan.pg.reused ? ' (reused)' : ''}`);
      console.log(`[server] http://localhost:${plan.server.port}   (pid ${serverChild.pid})`);
      console.log(`[web]    http://localhost:${plan.web.port}       (pid ${webChild.pid})`);
      console.log('press Ctrl+C to stop all.');

      if (options.open) {
        const opener =
          process.platform === 'darwin' ? 'open' :
          process.platform === 'win32' ? 'start' : 'xdg-open';
        spawnChild({
          label: 'server',
          command: opener,
          args: [`http://localhost:${plan.web.port}`],
        }).catch(() => {});
      }

      const shutdown = async () => {
        console.log('\nshutting down…');
        await terminateChild(webChild);
        await terminateChild(serverChild);
        // pg container is left running by default; stop it on shutdown to free the port.
        // Data persists in the named volume.
        try {
          await defaultDockerRunner.exec('docker', ['stop', plan.pg.container]);
        } catch { /* ignore */ }
        clearState(repoRoot);
        process.exit(0);
      };

      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);

      const [sr, wr] = await Promise.all([serverChild, webChild]);
      if (sr.exitCode !== 0 || wr.exitCode !== 0) {
        console.error(`child exited unexpectedly: server=${sr.exitCode}, web=${wr.exitCode}`);
        await shutdown();
      }
    });
}
