import { createPrismaClient, type PrismaClient } from '@app/db';
import type { Logger } from 'pino';
import { imagingConfig, resolveStorageDir, type Env } from './config/env';
import { startQueue } from './queues/queue';
import { createInlineRunner, createQueueRunner, type JobRunner } from './queues/runner';
import type { ImagingContext } from './services/context';
import { LocalStorage } from './storage/local-storage';
import type { StorageDriver } from './storage/storage';
import { VercelBlobStorage } from './storage/vercel-blob-storage';
import { startCleanupWorker } from './workers/cleanup.worker';
import { processImageJob, startImageWorker } from './workers/process-image.worker';

async function createStorage(env: Env): Promise<StorageDriver> {
  if (env.STORAGE_DRIVER === 'vercel-blob') {
    const blob = new VercelBlobStorage(env.BLOB_READ_WRITE_TOKEN!);
    await blob.init();
    return blob;
  }
  const local = new LocalStorage(resolveStorageDir(env));
  await local.init();
  return local;
}

/** Create the shared services used by the API server, the worker process and serverless functions. */
export async function createImagingContext(env: Env, logger: Logger, prisma?: PrismaClient): Promise<ImagingContext> {
  const db = prisma ?? createPrismaClient(env.DATABASE_URL);
  const config = imagingConfig(env);
  const storage = await createStorage(env);

  const ctx: ImagingContext = { prisma: db, storage, boss: null, runner: undefined as unknown as JobRunner, config, logger };
  if (env.JOB_RUNNER === 'inline') {
    ctx.runner = createInlineRunner((jobId) => processImageJob(ctx, jobId), logger, config.workerConcurrency);
  } else {
    const boss = await startQueue(env.DATABASE_URL, logger, config.jobTimeoutSeconds);
    ctx.boss = boss;
    ctx.runner = createQueueRunner(boss, async (jobId, queueJobId) => {
      await db.processingJob.update({ where: { id: jobId }, data: { queueJobId } });
    });
  }
  return ctx;
}

/** Queue mode only: consume image jobs and run the scheduled cleanup in this process. */
export async function startWorkers(ctx: ImagingContext): Promise<void> {
  if (!ctx.boss) return;
  await startImageWorker(ctx);
  await startCleanupWorker(ctx);
}

export async function stopImagingContext(ctx: ImagingContext): Promise<void> {
  await ctx.runner.drain();
  // Graceful: lets in-flight queue jobs finish (up to the timeout) before closing.
  await ctx.boss?.stop({ graceful: true, timeout: 30_000 }).catch(() => {});
  await ctx.prisma.$disconnect().catch(() => {});
}
