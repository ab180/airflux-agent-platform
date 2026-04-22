import { Command } from 'commander';

export function registerDb(program: Command): void {
  const db = program.command('db').description('Database utilities');
  db.command('url').description('print the Postgres connection URL').action(notImpl('db url'));
  db.command('psql').description('open a psql session in airops-pg').action(notImpl('db psql'));
  db.command('dump')
    .description('pg_dump the airops database')
    .option('--file <path>', 'write the dump to a file (default: stdout)')
    .action(notImpl('db dump'));
  db.command('restore <file>')
    .description('restore a dump file into airops database')
    .action(notImpl('db restore'));
  db.command('reset')
    .description('DROP the airops-pgdata volume and recreate an empty DB')
    .option('--yes', 'skip confirmation prompt')
    .action(notImpl('db reset'));
}

function notImpl(name: string) {
  return async () => {
    console.error(`${name}: not implemented yet`);
    process.exitCode = 2;
  };
}
