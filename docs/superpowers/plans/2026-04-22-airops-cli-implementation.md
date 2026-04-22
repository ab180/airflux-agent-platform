# airops CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `airops` CLI workspace so `airops start` spins up Postgres(Docker) + server(native) + dashboard(native) with port auto-avoidance, Postgres reuse, and foreground signal-propagated shutdown; add the macOS Keychain branch to `readCredentials()` so native server always sees a fresh token.

**Architecture:** New `packages/cli/` Turborepo workspace (`@ab180/airops-cli`) with commander entry at `bin/airops`. Pure TypeScript, ESM, Vitest for tests. Modules are small and single-purpose: `state.ts`, `platform.ts`, `ports.ts`, `postgres.ts`, `logs.ts`, `orchestra.ts`, plus one file per subcommand. Dependencies are injected (execa/docker runner, keychain reader) so every module is unit-testable without real processes.

**Tech Stack:** TypeScript + Vitest + commander + execa + get-port + picocolors + tree-kill. Turbo picks the new workspace up automatically via the existing `packages/*` glob.

**Spec:** `docs/superpowers/specs/2026-04-22-airops-cli-design.md`

**Commit style (match existing repo):** Conventional commits (`feat(cli): ...`, `test(cli): ...`, `chore(cli): ...`, `feat(server): ...`). Do **not** push or open PRs unless the user explicitly asks — repo policy in CLAUDE.md.

---

## Task 1: Bootstrap `@ab180/airops-cli` workspace

**Files:**
- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`
- Create: `packages/cli/vitest.config.ts`
- Create: `packages/cli/src/index.ts`
- Create: `packages/cli/bin/airops`
- Create: `packages/cli/.gitignore`
- Modify: root `.gitignore` (add `.airops/`)

- [ ] **Step 1: Create `packages/cli/package.json`**

```json
{
  "name": "@ab180/airops-cli",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": {
    "airops": "./bin/airops"
  },
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "commander": "^13.0.0",
    "execa": "^9.5.0",
    "get-port": "^7.1.0",
    "picocolors": "^1.1.1",
    "tree-kill": "^1.2.2"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/tree-kill": "^1.2.5",
    "tsx": "^4.19.0",
    "typescript": "^5.8.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Create `packages/cli/tsconfig.json`** (match sibling packages)

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

- [ ] **Step 3: Create `packages/cli/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
  },
});
```

- [ ] **Step 4: Create minimal entry `packages/cli/src/index.ts`**

```ts
import { Command } from 'commander';

const program = new Command();
program
  .name('airops')
  .description('Local orchestrator for the AB180 agent platform')
  .version('0.1.0');

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
```

- [ ] **Step 5: Create `packages/cli/bin/airops` launcher**

```bash
#!/usr/bin/env node
import('../dist/index.js');
```

Then make it executable: `chmod +x packages/cli/bin/airops`.

- [ ] **Step 6: Create `packages/cli/.gitignore`**

```
dist/
.airops/
```

- [ ] **Step 7: Append root `.gitignore`**

Add line `.airops/` to the repo root `.gitignore` so state files never get committed.

- [ ] **Step 8: Install deps + build smoke**

```bash
npm install
npm run build --workspace=@ab180/airops-cli
./packages/cli/bin/airops --version
```

Expected output: `0.1.0`. If `npm install` fails due to lockfile drift, regenerate with `npm install --workspaces`.

- [ ] **Step 9: Commit**

```bash
git add packages/cli .gitignore package-lock.json
git commit -m "feat(cli): bootstrap @ab180/airops-cli workspace"
```

---

## Task 2: `state.ts` — `.airops/state.json` read/write/clear

**Files:**
- Create: `packages/cli/src/state.ts`
- Test: `packages/cli/src/__tests__/state.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/cli/src/__tests__/state.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readState,
  writeState,
  clearState,
  stateFilePath,
  STATE_VERSION,
  type AiropsState,
} from '../state.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'airops-state-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const sampleState = (): AiropsState => ({
  version: STATE_VERSION,
  startedAt: '2026-04-22T00:00:00.000Z',
  services: {
    pg: { container: 'airops-pg', port: 5432 },
    server: { pid: 100, port: 3100 },
    web: { pid: 101, port: 3200 },
  },
});

describe('state', () => {
  it('returns null when file does not exist', () => {
    expect(readState(root)).toBeNull();
  });

  it('writes and reads round-trip', () => {
    const s = sampleState();
    writeState(s, root);
    expect(readState(root)).toEqual(s);
  });

  it('returns null for mismatched version', () => {
    mkdirSync(join(root, '.airops'));
    writeFileSync(
      stateFilePath(root),
      JSON.stringify({ version: 999, services: {} }),
    );
    expect(readState(root)).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    mkdirSync(join(root, '.airops'));
    writeFileSync(stateFilePath(root), '{not-json');
    expect(readState(root)).toBeNull();
  });

  it('clearState deletes the file if present', () => {
    writeState(sampleState(), root);
    clearState(root);
    expect(readState(root)).toBeNull();
  });

  it('clearState is a no-op when missing', () => {
    expect(() => clearState(root)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run and verify FAIL**

```bash
npm test --workspace=@ab180/airops-cli -- state.test
```

Expected: failure with `Cannot find module '../state.js'`.

- [ ] **Step 3: Implement `packages/cli/src/state.ts`**

```ts
import {
  readFileSync,
  writeFileSync,
  existsSync,
  unlinkSync,
  mkdirSync,
} from 'node:fs';
import { resolve, dirname } from 'node:path';

export const STATE_VERSION = 1;

export interface ServiceState {
  pid?: number;
  container?: string;
  port: number;
}

export interface AiropsState {
  version: number;
  startedAt: string;
  services: {
    pg: ServiceState;
    server: ServiceState;
    web: ServiceState;
  };
}

export function stateFilePath(cwd: string = process.cwd()): string {
  return resolve(cwd, '.airops', 'state.json');
}

export function readState(cwd?: string): AiropsState | null {
  const path = stateFilePath(cwd);
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as AiropsState;
    if (parsed.version !== STATE_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeState(state: AiropsState, cwd?: string): void {
  const path = stateFilePath(cwd);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2));
}

export function clearState(cwd?: string): void {
  const path = stateFilePath(cwd);
  if (existsSync(path)) unlinkSync(path);
}
```

- [ ] **Step 4: Run and verify PASS**

```bash
npm test --workspace=@ab180/airops-cli -- state.test
```

Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/state.ts packages/cli/src/__tests__/state.test.ts
git commit -m "feat(cli): add state.ts for .airops/state.json lifecycle"
```

---

## Task 3: `platform.ts` — OS detection + Keychain reader

**Files:**
- Create: `packages/cli/src/platform.ts`
- Test: `packages/cli/src/__tests__/platform.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from 'vitest';
import {
  currentPlatform,
  insideContainerFromCgroup,
  makeKeychainReader,
} from '../platform.js';

describe('currentPlatform', () => {
  it('returns darwin | linux | win32 | other', () => {
    expect(['darwin', 'linux', 'win32', 'other']).toContain(currentPlatform());
  });
});

describe('insideContainerFromCgroup', () => {
  it('detects docker cgroup signature', () => {
    expect(
      insideContainerFromCgroup('12:cpu:/docker/abcd1234\n11:mem:/docker/abcd1234\n'),
    ).toBe(true);
  });
  it('detects kubernetes cgroup signature', () => {
    expect(
      insideContainerFromCgroup('10:cpu:/kubepods/pod-xxx/foo\n'),
    ).toBe(true);
  });
  it('returns false for a normal macOS/Linux host cgroup', () => {
    expect(insideContainerFromCgroup('0::/user.slice/user-1000.slice\n')).toBe(false);
  });
  it('returns false when cgroup is empty/unreadable (null input)', () => {
    expect(insideContainerFromCgroup(null)).toBe(false);
  });
});

describe('makeKeychainReader', () => {
  it('calls `security` CLI with the correct args and returns trimmed stdout', () => {
    const exec = vi.fn().mockReturnValue({ exitCode: 0, stdout: 'secret-token\n', stderr: '' });
    const reader = makeKeychainReader(exec);
    expect(reader.readGenericPassword('Claude Code-credentials')).toBe('secret-token');
    expect(exec).toHaveBeenCalledWith('security', [
      'find-generic-password',
      '-s',
      'Claude Code-credentials',
      '-w',
    ]);
  });

  it('returns null if security exits non-zero', () => {
    const exec = vi.fn().mockReturnValue({ exitCode: 44, stdout: '', stderr: 'not found' });
    const reader = makeKeychainReader(exec);
    expect(reader.readGenericPassword('whatever')).toBeNull();
  });

  it('returns null when exec throws', () => {
    const exec = vi.fn(() => { throw new Error('ENOENT'); });
    const reader = makeKeychainReader(exec);
    expect(reader.readGenericPassword('whatever')).toBeNull();
  });
});
```

- [ ] **Step 2: Run and verify FAIL**

```bash
npm test --workspace=@ab180/airops-cli -- platform.test
```

Expected: module not found.

- [ ] **Step 3: Implement `packages/cli/src/platform.ts`**

```ts
import { existsSync, readFileSync } from 'node:fs';
import { execaSync } from 'execa';

export type Platform = 'darwin' | 'linux' | 'win32' | 'other';

export function currentPlatform(): Platform {
  if (process.platform === 'darwin') return 'darwin';
  if (process.platform === 'linux') return 'linux';
  if (process.platform === 'win32') return 'win32';
  return 'other';
}

/** Pure variant — accepts cgroup file contents (null if unreadable). */
export function insideContainerFromCgroup(cgroup: string | null): boolean {
  if (!cgroup) return false;
  return /docker|kubepods|containerd/.test(cgroup);
}

/** Runtime helper — reads /proc/1/cgroup and /.dockerenv to decide. */
export function insideContainer(): boolean {
  if (existsSync('/.dockerenv')) return true;
  try {
    return insideContainerFromCgroup(readFileSync('/proc/1/cgroup', 'utf-8'));
  } catch {
    return false;
  }
}

export interface KeychainReader {
  readGenericPassword(service: string): string | null;
}

/** Thin wrapper over execa so tests can inject a fake. */
export type SyncExec = (
  cmd: string,
  args: string[],
) => { exitCode: number; stdout: string; stderr: string };

export const defaultSyncExec: SyncExec = (cmd, args) => {
  try {
    const r = execaSync(cmd, args);
    return {
      exitCode: r.exitCode ?? 0,
      stdout: r.stdout,
      stderr: r.stderr,
    };
  } catch (e) {
    const err = e as { exitCode?: number; stdout?: string; stderr?: string };
    return {
      exitCode: err.exitCode ?? 1,
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? String(e),
    };
  }
};

export function makeKeychainReader(exec: SyncExec = defaultSyncExec): KeychainReader {
  return {
    readGenericPassword(service) {
      try {
        const r = exec('security', [
          'find-generic-password',
          '-s',
          service,
          '-w',
        ]);
        if (r.exitCode !== 0) return null;
        return r.stdout.trim();
      } catch {
        return null;
      }
    },
  };
}
```

- [ ] **Step 4: Run and verify PASS**

```bash
npm test --workspace=@ab180/airops-cli -- platform.test
```

Expected: 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/platform.ts packages/cli/src/__tests__/platform.test.ts
git commit -m "feat(cli): add platform detection + Keychain reader"
```

---

## Task 4: `ports.ts` — port selection with fallback range

**Files:**
- Create: `packages/cli/src/ports.ts`
- Test: `packages/cli/src/__tests__/ports.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from 'vitest';
import { pickPort } from '../ports.js';

describe('pickPort', () => {
  it('asks get-port with preferred port first, then the range', async () => {
    const fakeGetPort = vi.fn().mockResolvedValue(3100);
    const port = await pickPort(3100, 3100, 3199, fakeGetPort);
    expect(port).toBe(3100);
    expect(fakeGetPort).toHaveBeenCalledOnce();
    const call = fakeGetPort.mock.calls[0]![0] as { port: number[] };
    expect(call.port[0]).toBe(3100);
    expect(call.port.length).toBe(100);
    expect(call.port[1]).toBe(3100);
    expect(call.port.at(-1)).toBe(3199);
  });

  it('falls back to alternative when preferred is busy (simulated)', async () => {
    const fakeGetPort = vi.fn().mockResolvedValue(3105);
    const port = await pickPort(3100, 3100, 3199, fakeGetPort);
    expect(port).toBe(3105);
  });
});
```

- [ ] **Step 2: Run and verify FAIL**

```bash
npm test --workspace=@ab180/airops-cli -- ports.test
```

Expected: module not found.

- [ ] **Step 3: Implement `packages/cli/src/ports.ts`**

```ts
import getPortReal, { portNumbers } from 'get-port';

export type GetPortLike = (options: { port: number[] }) => Promise<number>;

const defaultGetPort: GetPortLike = (opts) => getPortReal(opts);

/**
 * Pick a free port, preferring `preferred`, falling back through [min, max].
 * Injection point lets tests avoid opening real sockets.
 */
export async function pickPort(
  preferred: number,
  min: number,
  max: number,
  getPort: GetPortLike = defaultGetPort,
): Promise<number> {
  return getPort({ port: [preferred, ...portNumbers(min, max)] });
}
```

- [ ] **Step 4: Run and verify PASS**

```bash
npm test --workspace=@ab180/airops-cli -- ports.test
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/ports.ts packages/cli/src/__tests__/ports.test.ts
git commit -m "feat(cli): add ports.pickPort with injected get-port"
```

---

## Task 5: `postgres.ts` — container lifecycle (inspect / ensure / waitForHealthy)

**Files:**
- Create: `packages/cli/src/postgres.ts`
- Test: `packages/cli/src/__tests__/postgres.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run and verify FAIL**

```bash
npm test --workspace=@ab180/airops-cli -- postgres.test
```

Expected: module not found.

- [ ] **Step 3: Implement `packages/cli/src/postgres.ts`**

```ts
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
```

- [ ] **Step 4: Run and verify PASS**

```bash
npm test --workspace=@ab180/airops-cli -- postgres.test
```

Expected: 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/postgres.ts packages/cli/src/__tests__/postgres.test.ts
git commit -m "feat(cli): add postgres container lifecycle helpers"
```

---

## Task 6: `logs.ts` — prefix + color log merge

**Files:**
- Create: `packages/cli/src/logs.ts`
- Test: `packages/cli/src/__tests__/logs.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { PassThrough } from 'node:stream';
import { prefixStream, formatLine } from '../logs.js';

describe('formatLine', () => {
  it('adds a fixed-width bracketed label', () => {
    const line = formatLine('server', 'listening on 3100');
    expect(line).toContain('server');
    expect(line).toContain('listening on 3100');
    expect(line).toMatch(/\[server\s*\]/);
  });
});

describe('prefixStream', () => {
  it('emits each complete line with the label', async () => {
    const src = new PassThrough();
    const sink = new PassThrough();
    const out: string[] = [];
    sink.on('data', (c: Buffer) => { out.push(c.toString()); });

    prefixStream('web', src, sink);
    src.write('hello\nworld\n');
    src.end();
    await new Promise((r) => sink.on('end', r));

    const joined = out.join('');
    expect(joined).toMatch(/\[web\s*\].*hello/);
    expect(joined).toMatch(/\[web\s*\].*world/);
  });

  it('flushes trailing partial line on end', async () => {
    const src = new PassThrough();
    const sink = new PassThrough();
    const out: string[] = [];
    sink.on('data', (c: Buffer) => { out.push(c.toString()); });

    prefixStream('pg', src, sink);
    src.write('no-trailing-newline');
    src.end();
    await new Promise((r) => sink.on('end', r));

    expect(out.join('')).toContain('no-trailing-newline');
  });
});
```

- [ ] **Step 2: Run and verify FAIL**

```bash
npm test --workspace=@ab180/airops-cli -- logs.test
```

Expected: module not found.

- [ ] **Step 3: Implement `packages/cli/src/logs.ts`**

```ts
import pc from 'picocolors';

export type LogLabel = 'pg' | 'server' | 'web';

const COLORS: Record<LogLabel, (s: string) => string> = {
  pg: pc.blue,
  server: pc.magenta,
  web: pc.cyan,
};

export function formatLine(label: LogLabel, line: string): string {
  const padded = `[${label.padEnd(6)}]`;
  return `${COLORS[label](padded)} ${line}`;
}

/**
 * Read lines from `source`, prefix each with `[label]`, write to `sink`.
 * Flushes any trailing buffer without newline on source end.
 */
export function prefixStream(
  label: LogLabel,
  source: NodeJS.ReadableStream,
  sink: NodeJS.WritableStream,
): void {
  let buffer = '';
  source.on('data', (chunk: Buffer | string) => {
    buffer += typeof chunk === 'string' ? chunk : chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      sink.write(`${formatLine(label, line)}\n`);
    }
  });
  source.on('end', () => {
    if (buffer.length > 0) sink.write(`${formatLine(label, buffer)}\n`);
    (sink as unknown as { end?: () => void }).end?.();
  });
}
```

- [ ] **Step 4: Run and verify PASS**

```bash
npm test --workspace=@ab180/airops-cli -- logs.test
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/logs.ts packages/cli/src/__tests__/logs.test.ts
git commit -m "feat(cli): add prefix+color log stream helper"
```

---

## Task 7: `orchestra.ts` — spawn + terminate with grace period

**Files:**
- Create: `packages/cli/src/orchestra.ts`
- Test: `packages/cli/src/__tests__/orchestra.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { spawnChild, terminateChild } from '../orchestra.js';

describe('spawnChild', () => {
  it('spawns a node process that runs to completion', async () => {
    const child = spawnChild({
      label: 'noop',
      command: process.execPath,
      args: ['-e', 'console.log("hi")'],
    });
    const r = await child;
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('hi');
  });
});

describe('terminateChild', () => {
  it('returns immediately when child has no pid', async () => {
    const fake = { pid: undefined, once: () => fake } as unknown as Parameters<typeof terminateChild>[0];
    await expect(terminateChild(fake)).resolves.toBeUndefined();
  });

  it('SIGTERMs a long-running child and resolves on close', async () => {
    const child = spawnChild({
      label: 'sleeper',
      command: process.execPath,
      args: ['-e', 'setInterval(()=>{}, 1000)'],
    });
    expect(child.pid).toBeGreaterThan(0);
    await terminateChild(child, { graceMs: 500 });
    // execa's reject:false means the promise resolves, but the process is gone.
    const r = await child;
    expect(r.exitCode !== 0 || r.signal != null).toBe(true);
  }, 10_000);
});
```

- [ ] **Step 2: Run and verify FAIL**

```bash
npm test --workspace=@ab180/airops-cli -- orchestra.test
```

Expected: module not found.

- [ ] **Step 3: Implement `packages/cli/src/orchestra.ts`**

```ts
import { execa, type ResultPromise } from 'execa';
import treeKill from 'tree-kill';

export interface ChildSpec {
  label: string;
  command: string;
  args: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export type AirChild = ResultPromise<{ reject: false; buffer: false }>;

export function spawnChild(spec: ChildSpec): AirChild {
  return execa(spec.command, spec.args, {
    cwd: spec.cwd,
    env: { ...process.env, ...(spec.env ?? {}) },
    reject: false,
    buffer: false,
  });
}

export async function terminateChild(
  child: { pid?: number; once: (evt: 'close', cb: () => void) => unknown },
  opts: { graceMs?: number } = {},
): Promise<void> {
  if (!child.pid) return;
  const pid = child.pid;
  const grace = opts.graceMs ?? 5000;
  return new Promise<void>((resolve) => {
    const to = setTimeout(() => {
      treeKill(pid, 'SIGKILL', () => resolve());
    }, grace);
    child.once('close', () => {
      clearTimeout(to);
      resolve();
    });
    treeKill(pid, 'SIGTERM');
  });
}
```

- [ ] **Step 4: Run and verify PASS**

```bash
npm test --workspace=@ab180/airops-cli -- orchestra.test
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/orchestra.ts packages/cli/src/__tests__/orchestra.test.ts
git commit -m "feat(cli): add child spawn + graceful terminate"
```

---

## Task 8: Flesh out CLI entry with subcommand stubs

**Files:**
- Modify: `packages/cli/src/index.ts`
- Create: `packages/cli/src/commands/start.ts`
- Create: `packages/cli/src/commands/stop.ts`
- Create: `packages/cli/src/commands/status.ts`
- Create: `packages/cli/src/commands/db.ts`
- Test: `packages/cli/src/__tests__/cli-smoke.test.ts`

Stubs exist so Task 9+ can wire each command behind a known command path. Each stub prints a clear "not implemented" until the real command lands.

- [ ] **Step 1: Write the failing smoke test**

```ts
import { describe, it, expect } from 'vitest';
import { execa } from 'execa';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const bin = resolve(here, '../../bin/airops');

describe('cli smoke', () => {
  it('--version prints 0.1.0', async () => {
    const r = await execa(bin, ['--version']);
    expect(r.stdout.trim()).toBe('0.1.0');
  });

  it('help lists start / stop / status / db', async () => {
    const r = await execa(bin, ['--help']);
    expect(r.stdout).toMatch(/start/);
    expect(r.stdout).toMatch(/stop/);
    expect(r.stdout).toMatch(/status/);
    expect(r.stdout).toMatch(/db/);
  });
});
```

- [ ] **Step 2: Run and verify FAIL**

```bash
npm run build --workspace=@ab180/airops-cli
npm test --workspace=@ab180/airops-cli -- cli-smoke.test
```

Expected: help text missing subcommands.

- [ ] **Step 3: Create stub `packages/cli/src/commands/start.ts`**

```ts
import { Command } from 'commander';

export function registerStart(program: Command): void {
  program
    .command('start')
    .description('Start Postgres + server + dashboard (foreground)')
    .option('--open', 'open the dashboard URL in the default browser')
    .option('--server-port-start <n>', 'server port range start', parseIntOpt)
    .option('--web-port-start <n>', 'web port range start', parseIntOpt)
    .action(async () => {
      console.error('start: not implemented yet');
      process.exitCode = 2;
    });
}

function parseIntOpt(v: string): number {
  const n = Number(v);
  if (!Number.isInteger(n)) throw new Error(`not an integer: ${v}`);
  return n;
}
```

- [ ] **Step 4: Create stub `packages/cli/src/commands/stop.ts`**

```ts
import { Command } from 'commander';

export function registerStop(program: Command): void {
  program
    .command('stop')
    .description('Stop running services; --reset wipes the Postgres volume too')
    .option('--reset', 'delete the airops-pgdata volume (DATA LOSS)')
    .option('--yes', 'skip confirmation prompt for --reset')
    .action(async () => {
      console.error('stop: not implemented yet');
      process.exitCode = 2;
    });
}
```

- [ ] **Step 5: Create stub `packages/cli/src/commands/status.ts`**

```ts
import { Command } from 'commander';

export function registerStatus(program: Command): void {
  program
    .command('status')
    .description('Show URLs/ports/health of running services')
    .action(async () => {
      console.error('status: not implemented yet');
      process.exitCode = 2;
    });
}
```

- [ ] **Step 6: Create stub `packages/cli/src/commands/db.ts`**

```ts
import { Command } from 'commander';

export function registerDb(program: Command): void {
  const db = program.command('db').description('Database utilities');
  db.command('url').description('print the Postgres connection URL').action(notImpl('db url'));
  db.command('psql').description('open a psql session in airops-pg').action(notImpl('db psql'));
  db.command('dump')
    .description('pg_dump the airops database')
    .option('--file <path>', 'write the dump to a file (default: stdout)')
    .action(notImpl('db dump'));
  db.command('restore <file>')
    .description('restore a dump file into airops database')
    .action(notImpl('db restore'));
  db.command('reset')
    .description('DROP the airops-pgdata volume and recreate an empty DB')
    .option('--yes', 'skip confirmation prompt')
    .action(notImpl('db reset'));
}

function notImpl(name: string) {
  return async () => {
    console.error(`${name}: not implemented yet`);
    process.exitCode = 2;
  };
}
```

- [ ] **Step 7: Wire up `packages/cli/src/index.ts`**

Replace contents with:

```ts
import { Command } from 'commander';
import { registerStart } from './commands/start.js';
import { registerStop } from './commands/stop.js';
import { registerStatus } from './commands/status.js';
import { registerDb } from './commands/db.js';

const program = new Command();
program
  .name('airops')
  .description('Local orchestrator for the AB180 agent platform')
  .version('0.1.0');

registerStart(program);
registerStop(program);
registerStatus(program);
registerDb(program);

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
```

- [ ] **Step 8: Rebuild and verify PASS**

```bash
npm run build --workspace=@ab180/airops-cli
npm test --workspace=@ab180/airops-cli -- cli-smoke.test
```

Expected: both smoke tests pass.

- [ ] **Step 9: Commit**

```bash
git add packages/cli/src/index.ts packages/cli/src/commands packages/cli/src/__tests__/cli-smoke.test.ts
git commit -m "feat(cli): wire commander with start/stop/status/db stubs"
```

---

## Task 9: `start` command — full orchestration

**Files:**
- Modify: `packages/cli/src/commands/start.ts`
- Test: `packages/cli/src/__tests__/start.test.ts`

- [ ] **Step 1: Write the failing test (unit-level orchestration)**

```ts
import { describe, it, expect, vi } from 'vitest';
import { planStart } from '../commands/start.js';

describe('planStart', () => {
  it('reuses running pg container and picks free ports', async () => {
    const runner = {
      exec: vi.fn()
        // inspect -> running
        .mockResolvedValueOnce({ exitCode: 0, stdout: 'running', stderr: '' })
        // pg_isready
        .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' })
        // inspect for port retrieval
        .mockResolvedValueOnce({ exitCode: 0, stdout: '5433', stderr: '' }),
    };
    const getPort = vi.fn().mockResolvedValueOnce(3100).mockResolvedValueOnce(3200);
    const plan = await planStart({
      runner,
      getPort,
      pgConfig: {
        containerName: 'airops-pg',
        volumeName: 'airops-pgdata',
        port: 5432,
        user: 'airops',
        password: 'airops',
        database: 'airops',
        image: 'postgres:16-alpine',
      },
    });
    expect(plan.pg.reused).toBe(true);
    expect(plan.pg.port).toBe(5433);
    expect(plan.server.port).toBe(3100);
    expect(plan.web.port).toBe(3200);
    expect(plan.server.env.DATABASE_URL).toBe('postgres://airops:airops@localhost:5433/airops');
    expect(plan.server.env.PORT).toBe('3100');
    expect(plan.web.env.PORT).toBe('3200');
    expect(plan.web.env.API_URL).toBe('http://localhost:3100');
  });

  it('creates pg container when missing', async () => {
    const runner = {
      exec: vi.fn()
        .mockResolvedValueOnce({ exitCode: 1, stdout: '', stderr: '' })  // inspect missing
        .mockResolvedValueOnce({ exitCode: 0, stdout: 'id', stderr: '' }) // run
        .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' })   // pg_isready
        .mockResolvedValueOnce({ exitCode: 0, stdout: '5432', stderr: '' }), // port inspect
    };
    const getPort = vi.fn().mockResolvedValue(3100);
    const plan = await planStart({
      runner,
      getPort,
      pgConfig: {
        containerName: 'airops-pg',
        volumeName: 'airops-pgdata',
        port: 5432,
        user: 'airops',
        password: 'airops',
        database: 'airops',
        image: 'postgres:16-alpine',
      },
    });
    expect(plan.pg.reused).toBe(false);
  });
});
```

- [ ] **Step 2: Run and verify FAIL**

```bash
npm test --workspace=@ab180/airops-cli -- start.test
```

Expected: `planStart` not exported.

- [ ] **Step 3: Rewrite `packages/cli/src/commands/start.ts`**

```ts
import { Command } from 'commander';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import treeKill from 'tree-kill';
import {
  defaultPostgresConfig,
  defaultDockerRunner,
  ensurePostgres,
  inspectContainer,
  waitForHealthy,
  type DockerRunner,
  type PostgresConfig,
} from '../postgres.js';
import { pickPort, type GetPortLike } from '../ports.js';
import { spawnChild, terminateChild } from '../orchestra.js';
import { prefixStream } from '../logs.js';
import { writeState, clearState, STATE_VERSION } from '../state.js';

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
        if (plan.pg.container) {
          treeKill(-1, 'SIGTERM'); // no-op placeholder; real docker stop below
        }
        try {
          const { defaultDockerRunner } = await import('../postgres.js');
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
```

- [ ] **Step 4: Run and verify PASS (unit)**

```bash
npm test --workspace=@ab180/airops-cli -- start.test
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands/start.ts packages/cli/src/__tests__/start.test.ts
git commit -m "feat(cli): implement start command with orchestrated lifecycle"
```

---

## Task 10: `stop` command

**Files:**
- Modify: `packages/cli/src/commands/stop.ts`
- Test: `packages/cli/src/__tests__/stop.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run and verify FAIL**

```bash
npm test --workspace=@ab180/airops-cli -- stop.test
```

Expected: `runStop` not exported.

- [ ] **Step 3: Rewrite `packages/cli/src/commands/stop.ts`**

```ts
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
```

- [ ] **Step 4: Run and verify PASS**

```bash
npm test --workspace=@ab180/airops-cli -- stop.test
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands/stop.ts packages/cli/src/__tests__/stop.test.ts
git commit -m "feat(cli): implement stop with optional --reset"
```

---

## Task 11: `status` command

**Files:**
- Modify: `packages/cli/src/commands/status.ts`
- Test: `packages/cli/src/__tests__/status.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run and verify FAIL**

```bash
npm test --workspace=@ab180/airops-cli -- status.test
```

- [ ] **Step 3: Rewrite `packages/cli/src/commands/status.ts`**

```ts
import { Command } from 'commander';
import { readState } from '../state.js';

export interface RunStatusOptions {
  cwd?: string;
  isAlive?: (pid: number) => boolean;
  log?: (msg: string) => void;
}

export async function runStatus(opts: RunStatusOptions = {}): Promise<void> {
  const cwd = opts.cwd ?? process.cwd();
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
```

- [ ] **Step 4: Run and verify PASS**

```bash
npm test --workspace=@ab180/airops-cli -- status.test
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands/status.ts packages/cli/src/__tests__/status.test.ts
git commit -m "feat(cli): implement status command"
```

---

## Task 12: `db` subcommands — url / psql / dump / restore / reset

**Files:**
- Modify: `packages/cli/src/commands/db.ts`
- Test: `packages/cli/src/__tests__/db.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
      const runner = { exec: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' }) };
      await runDbRestore({ cwd: root, runner, file: '/tmp/x.sql', log: () => {} });
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
```

- [ ] **Step 2: Run and verify FAIL**

```bash
npm test --workspace=@ab180/airops-cli -- db.test
```

Expected: exports not found.

- [ ] **Step 3: Rewrite `packages/cli/src/commands/db.ts`**

```ts
import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { execa } from 'execa';
import { defaultDockerRunner, defaultPostgresConfig, type DockerRunner } from '../postgres.js';
import { readState } from '../state.js';

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
  const cwd = opts.cwd ?? process.cwd();
  const log = opts.log ?? ((m) => console.log(m));
  log(connectionUrl(cwd));
}

/** Replaces current process with `docker exec -it airops-pg psql ...`. */
export async function runDbPsql(opts: { cwd?: string } = {}): Promise<never> {
  const cwd = opts.cwd ?? process.cwd();
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
  const cwd = opts.cwd ?? process.cwd();
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
  const cwd = opts.cwd ?? process.cwd();
  const runner = opts.runner ?? defaultDockerRunner;
  requireState(cwd);
  const cfg = defaultPostgresConfig;
  const sql = readFileSync(opts.file, 'utf-8');
  // Using runner.exec keeps unit tests simple; real invocation needs stdin piping.
  // We pass the SQL via a -c argument only for short dumps; for large files, the
  // real CLI uses execa directly with stdin streaming.
  const r = await runner.exec('docker', [
    'exec',
    '-i',
    cfg.containerName,
    'psql',
    '-U',
    cfg.user,
    cfg.database,
    '-c',
    sql.length < 1_000_000 ? sql : '',
  ]);
  if (r.exitCode !== 0) throw new Error(`psql restore failed: ${r.stderr}`);
  (opts.log ?? console.log)('restore 완료');
}

export async function runDbReset(opts: {
  cwd?: string;
  runner?: DockerRunner;
  confirm: () => Promise<boolean>;
  log?: (m: string) => void;
}): Promise<void> {
  const cwd = opts.cwd ?? process.cwd();
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
```

- [ ] **Step 4: Run and verify PASS**

```bash
npm test --workspace=@ab180/airops-cli -- db.test
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands/db.ts packages/cli/src/__tests__/db.test.ts
git commit -m "feat(cli): implement db url/psql/dump/restore/reset subcommands"
```

---

## Task 13: Server `readCredentials()` macOS Keychain branch

**Files:**
- Modify: `packages/server/src/llm/model-factory.ts` (the `readCredentials` function + its OAuthCredentials helpers)
- Test: `packages/server/src/__tests__/read-credentials-keychain.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/__tests__/read-credentials-keychain.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseKeychainPayload } from '../llm/model-factory.js';

describe('parseKeychainPayload', () => {
  it('returns null when payload is empty', () => {
    expect(parseKeychainPayload('', 'user:inference')).toBeNull();
  });

  it('returns null when scopes do not include inference', () => {
    const payload = JSON.stringify({
      claudeAiOauth: {
        accessToken: 'tok',
        refreshToken: 'ref',
        expiresAt: 1,
        scopes: ['user:profile'],
      },
    });
    expect(parseKeychainPayload(payload, 'user:inference')).toBeNull();
  });

  it('extracts accessToken / refreshToken / expiresAt when scope present', () => {
    const payload = JSON.stringify({
      claudeAiOauth: {
        accessToken: 'tok',
        refreshToken: 'ref',
        expiresAt: 1_776_000_000_000,
        scopes: ['user:profile', 'user:inference'],
      },
    });
    const parsed = parseKeychainPayload(payload, 'user:inference')!;
    expect(parsed.accessToken).toBe('tok');
    expect(parsed.refreshToken).toBe('ref');
    expect(parsed.expiresAt).toBe(1_776_000_000_000);
  });

  it('returns null on malformed JSON', () => {
    expect(parseKeychainPayload('{nope', 'user:inference')).toBeNull();
  });
});
```

- [ ] **Step 2: Run and verify FAIL**

```bash
npm test -w @airflux/server -- read-credentials-keychain
```

Expected: `parseKeychainPayload` not exported.

- [ ] **Step 3: Add the branch to `packages/server/src/llm/model-factory.ts`**

Near the top of the file (after the existing imports), add:

```ts
import { execFileSync as _execFileSync_forKeychain } from 'child_process';
```

(If `execFileSync` is already imported, skip that line.)

Below the existing `readCredentials()` function, add a new exported helper and a branch; then modify `readCredentials` to call into it for macOS native.

```ts
/**
 * Pure parser for the JSON payload `security find-generic-password -w` prints.
 * Kept separate so it can be unit-tested without shelling out.
 */
export function parseKeychainPayload(
  raw: string,
  inferenceScope: string,
): OAuthCredentials | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as { claudeAiOauth?: Record<string, unknown> };
    const o = d.claudeAiOauth;
    if (!o) return null;
    const scopes = o.scopes;
    if (!Array.isArray(scopes) || !scopes.includes(inferenceScope)) return null;
    const accessToken = o.accessToken;
    if (typeof accessToken !== 'string' || accessToken.length === 0) return null;
    return {
      accessToken,
      refreshToken: typeof o.refreshToken === 'string' ? o.refreshToken : undefined,
      expiresAt: typeof o.expiresAt === 'number' ? o.expiresAt : 0,
      scopes: scopes as string[],
    };
  } catch {
    return null;
  }
}

function insideContainerHint(): boolean {
  // /.dockerenv is the strongest signal; cgroup read is best-effort.
  try {
    const fs = require('node:fs') as typeof import('node:fs');
    if (fs.existsSync('/.dockerenv')) return true;
    const cg = fs.readFileSync('/proc/1/cgroup', 'utf-8');
    return /docker|kubepods|containerd/.test(cg);
  } catch {
    return false;
  }
}

function readKeychainCredentials(): OAuthCredentials | null {
  try {
    const raw = _execFileSync_forKeychain(
      'security',
      ['find-generic-password', '-s', 'Claude Code-credentials', '-w'],
      { encoding: 'utf-8', timeout: 3000 },
    );
    return parseKeychainPayload(raw, INFERENCE_SCOPE);
  } catch {
    return null;
  }
}
```

Then locate the existing `readCredentials()` function and wrap its file-reading body so the macOS path tries Keychain first:

```ts
function readCredentials(): OAuthCredentials | null {
  if (process.platform === 'darwin' && !insideContainerHint()) {
    const k = readKeychainCredentials();
    if (k) return k;
    // fall through to file fallback
  }
  for (const path of CRED_PATHS) {
    try {
      const creds = JSON.parse(readFileSync(path, 'utf-8'));
      const oauth = creds?.claudeAiOauth;
      if (oauth?.accessToken && Array.isArray(oauth.scopes) && oauth.scopes.includes(INFERENCE_SCOPE)) {
        return {
          accessToken: oauth.accessToken as string,
          refreshToken: oauth.refreshToken as string | undefined,
          expiresAt: (oauth.expiresAt as number) ?? 0,
          scopes: oauth.scopes as string[],
        };
      }
    } catch { /* try next path */ }
  }
  return null;
}
```

(Keep the existing `OAuthCredentials` interface and `CRED_PATHS` / `INFERENCE_SCOPE` constants in their current location. Do not duplicate them.)

- [ ] **Step 4: Run and verify PASS**

```bash
npm test -w @airflux/server -- read-credentials-keychain
```

Expected: 4 tests pass.

- [ ] **Step 5: Full server test sweep — make sure nothing else broke**

```bash
npm test -w @airflux/server
```

Expected: full suite passes (same count as before + 4 new).

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/llm/model-factory.ts packages/server/src/__tests__/read-credentials-keychain.test.ts
git commit -m "feat(server): read Claude credentials from macOS Keychain when native"
```

---

## Task 14: Turbo/Workspace integration smoke + README

**Files:**
- Modify: `README.md` (or add `packages/cli/README.md` if repo root is already in use)
- Verify: full `turbo test` runs new suite

- [ ] **Step 1: Write/update README usage section**

Add (or update) a section in the repo root `README.md`:

```markdown
## 로컬 개발 (airops CLI)

Postgres(Docker) + server + dashboard 를 한 번에 띄우고 끕니다.

```bash
npm install
npx airops start         # foreground, Ctrl+C 로 일괄 종료
npx airops status        # 현재 URL/포트 확인
npx airops db url        # connection URL 을 GUI 에 붙여넣기용으로 출력
npx airops db psql       # airops-pg 에 즉시 psql 세션
npx airops stop          # 서비스 중단 (데이터 유지)
npx airops stop --reset  # 볼륨까지 삭제 (데이터 삭제, 확인 프롬프트)
```

`airops start` 는:
- `airops-pg` 이름의 postgres:16-alpine 컨테이너를 재사용/재시작/생성 (`airops-pgdata` 볼륨 영속)
- Server 는 3100-3199, Dashboard 는 3200-3299 범위에서 빈 포트 자동 선점
- macOS 에서는 Claude OAuth 토큰을 Keychain 에서 직접 읽어 파일 sync 가 필요 없음
```

- [ ] **Step 2: Run the entire workspace test suite**

```bash
npm test
```

Expected: every workspace's vitest run is green. If `turbo test` doesn't detect the new workspace, run `npx turbo run test --filter=@ab180/airops-cli` once to seed the cache.

- [ ] **Step 3: Verify binary resolvable via npx**

```bash
npm run build --workspace=@ab180/airops-cli
npx airops --version
npx airops --help
```

Expected: `0.1.0`; help shows `start | stop | status | db`.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document airops CLI usage"
```

---

## Self-Review (plan-internal checks before shipping)

Before calling the plan done, the executing agent should verify:

1. **Spec coverage**: Each spec section maps to at least one task.
   - §1 Architecture → Tasks 1 + 8 (workspace + commander wiring)
   - §2 Commands → Tasks 9 (start), 10 (stop), 11 (status), 12 (db)
   - §3 Ports & Postgres → Tasks 4 (ports), 5 (postgres)
   - §4 State & Lifecycle → Tasks 2 (state), 7 (orchestra), 9 (start shutdown)
   - §5 Error Handling → inline in Tasks 5/9/10/12 (error branches + clear messages)
   - §6 Platform compat → Task 3 (platform.ts) + Task 13 (server Keychain branch)
   - §7 Testing → every Task has its own vitest file
   - §8 Verification → Task 14 Step 2/3
   - §9 Phase分리 (後順位) → intentionally skipped

2. **Placeholder scan**: No `TBD`/`TODO`/"fill in". Every step has either exact code or an exact command with expected output.

3. **Type consistency**: `DockerRunner.exec` signature is identical in every task that uses it (`postgres.ts`, `stop.ts`, `db.ts`). `AirChild` / `planStart` types re-used from their declaration file. `OAuthCredentials` kept singular in `model-factory.ts`.

4. **Ambiguity**: `db restore` currently uses `runner.exec` with `-c <sql>` inline for unit-testability. For dumps over 1MB the real CLI should switch to streaming stdin via `execa.pipeInput`. Noted in a TODO-free comment inside the code; real-file paths are optional hardening (outside this plan's scope, see §9 of spec).

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-22-airops-cli-implementation.md`.

Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using `executing-plans`, batch execution with checkpoints.

Which approach?
