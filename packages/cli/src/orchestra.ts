import { execa, type ResultPromise } from 'execa';
import treeKill from 'tree-kill';

export interface ChildSpec {
  label: string;
  command: string;
  args: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export type AirChild = ResultPromise<{ reject: false }>;

export function spawnChild(spec: ChildSpec): AirChild {
  return execa(spec.command, spec.args, {
    cwd: spec.cwd,
    env: { ...process.env, ...(spec.env ?? {}) },
    reject: false,
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
