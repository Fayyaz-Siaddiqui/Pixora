import { readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { QUEUES } from '../queues/queue';
import { deleteAssetFiles } from '../services/asset.service';
import type { ImagingContext } from '../services/context';

const TEMP_MAX_AGE_MS = 60 * 60 * 1000;

/**
 * Retention policy: delete files whose expiry has passed, and abandoned
 * upload temp files. Database rows are kept (marked deleted) so history and
 * statistics stay accurate.
 */
export async function runCleanup(ctx: ImagingContext): Promise<{ assets: number; tempFiles: number }> {
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
  if (assets || tempFiles) ctx.logger.info({ assets, tempFiles }, 'cleanup removed expired files');
  return { assets, tempFiles };
}

export async function startCleanupWorker(ctx: ImagingContext): Promise<void> {
  await ctx.boss.schedule(QUEUES.cleanup, '*/15 * * * *');
  await ctx.boss.work(QUEUES.cleanup, async () => {
    await runCleanup(ctx);
  });
}
