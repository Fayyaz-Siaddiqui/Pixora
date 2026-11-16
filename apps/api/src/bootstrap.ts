import { createPrismaClient, type PrismaClient } from '@app/db';
import type { Logger } from 'pino';
import { imagingConfig, resolveStorageDir, type Env } from './config/env';
import { startQueue } from './queues/queue';
import type { ImagingContext } from './services/context';
import { LocalStorage } from './storage/local-storage';
import { startCleanupWorker } from './workers/cleanup.worker';
import { startImageWorker } from './workers/process-image.worker';

/** Create the shared services used by both the API server and the worker process. */
export async function createImagingContext(env: Env, logger: Logger, prisma?: PrismaClient): Promise<ImagingContext> {
  const db = prisma ?? createPrismaClient(env.DATABASE_URL);
  const config = imagingConfig(env);
  const storage = new LocalStorage(resolveStorageDir(env));
  await storage.init();
  const boss = await startQueue(env.DATABASE_URL, logger, config.jobTimeoutSeconds);
  return { prisma: db, storage, boss, config, logger };
}

export async function startWorkers(ctx: ImagingContext): Promise<void> {
  await startImageWorker(ctx);
  await startCleanupWorker(ctx);
}

export async function stopImagingContext(ctx: ImagingContext): Promise<void> {
  // Graceful: lets in-flight jobs finish (up to the timeout) before closing.
  await ctx.boss.stop({ graceful: true, timeout: 30_000 }).catch(() => {});
  await ctx.prisma.$disconnect().catch(() => {});
}
