import { serve } from '@hono/node-server';
import { app } from './app.js';
import { bootstrap } from './bootstrap.js';
import { Scheduler } from './scheduler/scheduler.js';
import { logger } from './lib/logger.js';

const port = parseInt(process.env.PORT || '3000', 10);

async function main() {
  logger.info('Starting Airflux Agent Platform...');
  await bootstrap();

  // Start scheduler for living agents (cron-based autonomous execution)
  const scheduler = new Scheduler();
  await scheduler.initialize();

  serve({ fetch: app.fetch, port }, (info) => {
    logger.info(`Server running at http://localhost:${info.port}`, { port: info.port });
  });
}

main().catch((e) => {
  logger.error('Failed to start', { error: e instanceof Error ? e.message : String(e) });
  process.exit(1);
});
