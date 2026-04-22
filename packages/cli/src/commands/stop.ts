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
