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
