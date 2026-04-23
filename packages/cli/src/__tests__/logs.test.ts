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
