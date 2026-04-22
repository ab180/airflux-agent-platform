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
    // Don't close shared process std streams — that would silently drop
    // logs from sibling children once the first one exits.
    if (sink !== process.stdout && sink !== process.stderr) {
      (sink as unknown as { end?: () => void }).end?.();
    }
  });
}
