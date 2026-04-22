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
