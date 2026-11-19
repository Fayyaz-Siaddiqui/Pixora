import { readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { waitUntil } from '@vercel/functions';
import { QUEUES } from '../queues/queue';
import { deleteAssetFiles } from '../services/asset.service';
import type { ImagingContext } from '../services/context';
import { INCOMING_PREFIX } from '../services/upload.service';

const TEMP_MAX_AGE_MS = 60 * 60 * 1000;
/** Direct uploads that were never registered (tab closed, invalid file...) are removed after this. */
const UNREGISTERED_MAX_AGE_MS = 60 * 60 * 1000;

/**
 * Retention policy: delete files whose expiry has passed, abandoned upload
 * temp files and unregistered direct uploads. Database rows are kept
 * (marked deleted) so history and statistics stay accurate.
 */
export async function runCleanup(ctx: ImagingContext): Promise<{ assets: number; tempFiles: number; unregistered: number }> {
  let assets = 0;
  for (;;) {
    const expired = await ctx.prisma.imageAsset.findMany({
      where: { deletedAt: null, expiresAt: { lt: new Date() } },
      include: { storageObject: true },
      take: 200,
    });
    if (expired.length === 0) break;
    await deleteAssetFiles(ctx, expired);
    assets += expired.length;
  }

  let tempFiles = 0;
  const entries = await readdir(ctx.storage.tempDir).catch(() => [] as string[]);
  for (const name of entries) {
    const p = path.join(ctx.storage.tempDir, name);
    const s = await stat(p).catch(() => null);
    if (s && Date.now() - s.mtimeMs > TEMP_MAX_AGE_MS) {
      await rm(p, { force: true, recursive: true });
      tempFiles++;
    }
  }

  let unregistered = 0;
  if (ctx.storage.listOlderThan) {
    const old = await ctx.storage.listOlderThan(INCOMING_PREFIX, new Date(Date.now() - UNREGISTERED_MAX_AGE_MS));
    // Registered direct uploads keep their key; only files with no database record are abandoned.
    for (let i = 0; i < old.length; i += 200) {
      const chunk = old.slice(i, i + 200);
      const known = new Set(
        (await ctx.prisma.storageObject.findMany({ where: { key: { in: chunk } }, select: { key: true } })).map((o) => o.key),
      );
      for (const key of chunk) {
        if (known.has(key)) continue;
        await ctx.storage.delete(key);
        unregistered++;
      }
    }
  }

  if (assets || tempFiles || unregistered) ctx.logger.info({ assets, tempFiles, unregistered }, 'cleanup removed expired files');
  return { assets, tempFiles, unregistered };
}

export async function startCleanupWorker(ctx: ImagingContext): Promise<void> {
  if (!ctx.boss) throw new Error('startCleanupWorker needs queue mode (JOB_RUNNER=queue).');
  await ctx.boss.schedule(QUEUES.cleanup, '*/15 * * * *');
  await ctx.boss.work(QUEUES.cleanup, async () => {
    await runCleanup(ctx);
  });
}

const OPPORTUNISTIC_INTERVAL_MS = 15 * 60 * 1000;
let lastOpportunisticRun = 0;

/**
 * Inline (serverless) mode has no scheduler that runs every 15 minutes
 * (Vercel Hobby cron runs once a day), so normal traffic triggers cleanup
 * at most every 15 minutes per instance, after the response is sent.
 */
export function maybeRunCleanup(ctx: ImagingContext): void {
  if (ctx.runner.mode !== 'inline' || Date.now() - lastOpportunisticRun < OPPORTUNISTIC_INTERVAL_MS) return;
  lastOpportunisticRun = Date.now();
  const work = runCleanup(ctx).then(
    () => undefined,
    (err: unknown) => ctx.logger.error({ err }, 'opportunistic cleanup failed'),
  );
  waitUntil(work);
}
