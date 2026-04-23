import { Command } from 'commander';
import { registerStart } from './commands/start.js';
import { registerStop } from './commands/stop.js';
import { registerStatus } from './commands/status.js';
import { registerDb } from './commands/db.js';

const program = new Command();
program
  .name('airops')
  .description('Local orchestrator for the AB180 agent platform')
  .version('0.1.0');

registerStart(program);
registerStop(program);
registerStatus(program);
registerDb(program);

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
