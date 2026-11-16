import { Router } from 'express';
import sharp from 'sharp';
import { FORMATS, OUTPUT_FORMATS, SIZE_PRESETS } from '@app/image-core';
import { MAX_OPERATIONS } from '@app/shared';
import type { ImagingContext } from '../services/context';

/** Public, non-personal configuration the web app needs to render tools and validate input. */
export function metaRoutes(ctx: ImagingContext): Router {
  const router = Router();

  router.get('/config', (_req, res) => {
    const vipsFormats = sharp.format as unknown as Record<string, { output: { buffer: boolean } }>;
    res.set('Cache-Control', 'public, max-age=300').json({
      limits: {
        uploadMaxBytes: ctx.config.uploadMaxBytes,
        uploadMaxFiles: ctx.config.uploadMaxFiles,
        maxInputPixels: ctx.config.maxInputPixels,
        maxOutputPixels: ctx.config.maxOutputPixels,
        maxOutputDimension: ctx.config.maxOutputDimension,
        batchMaxFiles: ctx.config.batchMaxFiles,
        maxOperations: MAX_OPERATIONS,
        dailyJobLimit: ctx.config.guestDailyJobLimit,
        retentionHours: Math.round((ctx.config.retentionMs / 3_600_000) * 10) / 10,
      },
      inputFormats: ['jpeg', 'png', 'webp', 'avif', 'gif', 'tiff'],
      outputFormats: OUTPUT_FORMATS.filter((f) => vipsFormats[f === 'avif' ? 'heif' : f]?.output.buffer).map((f) => FORMATS[f]),
      resampling: ['lanczos3', 'mitchell', 'cubic', 'nearest'],
      sizePresets: SIZE_PRESETS,
      features: { aiUpscale: false },
    });
  });

  /** Built-in presets (editable by admins later). User presets arrive with accounts. */
  router.get('/presets', async (_req, res) => {
    const presets = await ctx.prisma.processingPreset.findMany({
      where: { userId: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, category: true, params: true },
    });
    res.json({ presets });
  });

  return router;
}
