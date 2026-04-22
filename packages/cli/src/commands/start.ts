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
