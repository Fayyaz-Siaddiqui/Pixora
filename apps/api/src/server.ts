import { createApp } from './app';
import { createImagingContext, startWorkers, stopImagingContext } from './bootstrap';
import { loadRootEnvFile, parseEnv } from './config/env';
import { createLogger } from './lib/logger';

const VERSION = process.env.npm_package_version ?? '0.1.0';

async function main(): Promise<void> {
  loadRootEnvFile();
  const env = parseEnv();
  const logger = createLogger(env);

  let ctx;
  try {
    ctx = await createImagingContext(env, logger);
  } catch (err) {
    logger.fatal({ err }, 'Could not connect to the database. Is PostgreSQL running? (npm run db:local)');
    process.exit(1);
  }

  if (env.WORKER_EMBEDDED) await startWorkers(ctx);

  const prisma = ctx.prisma;
  const app = createApp({
    env,
    logger,
    version: VERSION,
    dbCheck: async () => {
      await prisma.$queryRaw`SELECT 1`;
    },
    imaging: { ctx, cookieSecret: env.COOKIE_SECRET, secureCookies: env.NODE_ENV === 'production' },
  });

  const server = app.listen(env.API_PORT, env.API_HOST, () => {
    logger.info(`API listening on http://localhost:${env.API_PORT} (${env.NODE_ENV})${env.WORKER_EMBEDDED ? ' with embedded worker' : ''}`);
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    logger.fatal({ err }, err.code === 'EADDRINUSE' ? `Port ${env.API_PORT} is already in use.` : 'Server failed to start.');
    process.exit(1);
  });

  // Graceful shutdown: stop accepting connections, finish in-flight requests and jobs, close the DB pool.
  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`${signal} received, shutting down...`);
    const force = setTimeout(() => {
      logger.error('Forced shutdown after 40s timeout.');
      process.exit(1);
    }, 40_000);
    force.unref();
    server.close(() => {
      stopImagingContext(ctx)
        .catch((err: unknown) => logger.error({ err }, 'Error during shutdown'))
        .finally(() => {
          logger.info('Shutdown complete.');
          process.exit(0);
        });
    });
    server.closeIdleConnections();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
