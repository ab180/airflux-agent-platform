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
