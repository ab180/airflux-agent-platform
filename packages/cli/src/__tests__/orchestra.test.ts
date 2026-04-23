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
