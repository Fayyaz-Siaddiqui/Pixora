/**
 * Standalone worker process for production: `npm run start:worker`.
 * Set WORKER_EMBEDDED=false on the API servers so image processing runs only
 * here, keeping CPU-heavy work away from request handling.
 */
import { createImagingContext, startWorkers, stopImagingContext } from './bootstrap';
import { loadRootEnvFile, parseEnv } from './config/env';
import { createLogger } from './lib/logger';

async function main(): Promise<void> {
  loadRootEnvFile();
  const env = parseEnv();
  const logger = createLogger(env);
  const ctx = await createImagingContext(env, logger);
  await startWorkers(ctx);
  logger.info('Worker process ready.');

  let stopping = false;
  const shutdown = (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info(`${signal} received, finishing in-flight jobs...`);
    stopImagingContext(ctx).finally(() => process.exit(0));
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
