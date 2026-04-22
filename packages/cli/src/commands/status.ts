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
