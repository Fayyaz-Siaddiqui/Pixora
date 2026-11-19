import { handleUpload as handleBlobUpload, type HandleUploadBody } from '@vercel/blob/client';
import { Router } from 'express';
import { z } from 'zod';
import type { JobType } from '@app/db';
import {
  adjustOpSchema,
  backgroundOpSchema,
  blurOpSchema,
  cropOpSchema,
  denoiseOpSchema,
  flipOpSchema,
  operationsSchema,
  resizeOpSchema,
  rotateOpSchema,
  sharpenOpSchema,
  type Operation,
} from '@app/shared';
import { ErrorCode } from '@app/shared';
import { HttpError } from '../lib/http-error';
import { parseInput } from '../lib/validate';
import { requireOwner } from '../middleware/identity';
import {
  deleteOwnedAsset,
  getMetadataReport,
  getOwnedAsset,
  getThumbnailAsset,
  listOwnedAssets,
  streamAsset,
  streamZip,
} from '../services/asset.service';
import type { ImagingContext } from '../services/context';
import { createBatch, createJob, looseOutputSchema } from '../services/job.service';
import { serializeAsset, serializeBatch, serializeJob } from '../services/serializers';
import { handleUpload, isOwnDirectUploadKey, ownerUploadPrefix, registerDirectUploads } from '../services/upload.service';
import { VercelBlobStorage } from '../storage/vercel-blob-storage';
import { maybeRunCleanup } from '../workers/cleanup.worker';

const assetId = z.string().uuid('assetId must be an image id');

/**
 * Single-purpose tool endpoints. Each turns its options into the shared
 * operation list, so every tool runs through the same validated pipeline.
 */
const toolEndpoints: Record<string, { type: JobType; body: z.ZodTypeAny; toOps: (o: any) => Operation[] }> = {
  resize: {
    type: 'RESIZE',
    body: z.object({ options: z.record(z.string(), z.unknown()) }),
    toOps: (o) => [resizeOpSchema.parse({ ...o, type: 'resize' })],
  },
  crop: {
    type: 'CROP',
    body: z.object({ options: z.record(z.string(), z.unknown()) }),
    toOps: (o) => {
      const { circle, ...rect } = o as { circle?: unknown };
      const ops: Operation[] = [cropOpSchema.parse({ ...rect, type: 'crop' })];
      if (circle === true) ops.push({ type: 'circle' });
      return ops;
    },
  },
  rotate: {
    type: 'ROTATE',
    body: z.object({ options: z.record(z.string(), z.unknown()) }),
    toOps: (o) => [rotateOpSchema.parse({ ...o, type: 'rotate' })],
  },
  flip: {
    type: 'FLIP',
    body: z.object({ options: z.record(z.string(), z.unknown()) }),
    toOps: (o) => [flipOpSchema.parse({ ...o, type: 'flip' })],
  },
  enhance: {
    type: 'ENHANCE',
    body: z.object({ options: z.record(z.string(), z.unknown()) }),
    toOps: (o) => {
      const { sharpen, denoise, ...adjust } = o as { sharpen?: object; denoise?: object };
      const ops: Operation[] = [];
      if (denoise) ops.push(denoiseOpSchema.parse({ ...denoise, type: 'denoise' }));
      ops.push(adjustOpSchema.parse({ ...adjust, type: 'adjust' }));
      if (sharpen) ops.push(sharpenOpSchema.parse({ ...sharpen, type: 'sharpen' }));
      return ops;
    },
  },
  sharpen: {
    type: 'SHARPEN',
    body: z.object({ options: z.record(z.string(), z.unknown()).default({}) }),
    toOps: (o) => [sharpenOpSchema.parse({ ...o, type: 'sharpen' })],
  },
  blur: {
    type: 'BLUR',
    body: z.object({ options: z.record(z.string(), z.unknown()).default({}) }),
    toOps: (o) => [blurOpSchema.parse({ ...o, type: 'blur' })],
  },
  background: {
    type: 'BACKGROUND',
    body: z.object({ options: z.record(z.string(), z.unknown()) }),
    toOps: (o) => [backgroundOpSchema.parse({ ...o, type: 'background' })],
  },
  compress: { type: 'COMPRESS', body: z.object({}), toOps: () => [] },
  convert: { type: 'CONVERT', body: z.object({}), toOps: () => [] },
};

export function imageRoutes(ctx: ImagingContext): Router {
  const router = Router();

  router.post('/upload', async (req, res) => {
    const result = await handleUpload(req, requireOwner(req), ctx);
    const status = result.uploaded.length > 0 ? 201 : 422;
    res.status(status).json(result);
  });

  // ── Direct uploads: the browser sends files straight to the store, then registers them here. ──

  /** Where this visitor may upload directly (404 when the store doesn't support direct uploads). */
  router.get('/direct-upload', (req, res) => {
    if (!ctx.storage.directUploads) throw new HttpError(404, ErrorCode.NOT_FOUND, 'Direct uploads are not enabled.');
    res.set('Cache-Control', 'no-store').json({
      prefix: ownerUploadPrefix(ctx, requireOwner(req)),
      tokenUrl: '/api/images/upload-token',
      maxBytes: ctx.config.uploadMaxBytes,
      maxFiles: ctx.config.uploadMaxFiles,
    });
  });

  /** Issues a short-lived Vercel Blob client token for ONE path inside the visitor's own folder. */
  router.post('/upload-token', async (req, res) => {
    const storage = ctx.storage;
    if (!(storage instanceof VercelBlobStorage)) throw new HttpError(404, ErrorCode.NOT_FOUND, 'Direct uploads are not enabled.');
    const owner = requireOwner(req);
    const body = req.body as HandleUploadBody;
    // Only token requests are accepted; we don't use upload-completed callbacks.
    if (body?.type !== 'blob.generate-client-token') throw new HttpError(400, ErrorCode.BAD_REQUEST, 'Unsupported upload request.');
    const json = await handleBlobUpload({
      body,
      request: req,
      token: storage.token,
      onBeforeGenerateToken: async (pathname) => {
        if (!isOwnDirectUploadKey(ctx, owner, pathname)) throw new HttpError(403, ErrorCode.FORBIDDEN, 'Upload path not allowed.');
        return {
          maximumSizeInBytes: ctx.config.uploadMaxBytes,
          // The real format is checked from the file's bytes on registration; browsers send '' for some types.
          allowedContentTypes: ['image/*', 'application/octet-stream'],
          addRandomSuffix: false,
          allowOverwrite: false,
          validUntil: Date.now() + 10 * 60_000,
        };
      },
    }).catch((err: unknown) => {
      if (err instanceof HttpError) throw err;
      ctx.logger.error({ err }, 'upload token failed');
      throw new HttpError(502, ErrorCode.STORAGE_ERROR, 'Uploads are temporarily unavailable. Please try again.');
    });
    res.set('Cache-Control', 'no-store').json(json);
  });

  router.post('/register', async (req, res) => {
    if (!ctx.storage.directUploads) throw new HttpError(404, ErrorCode.NOT_FOUND, 'Direct uploads are not enabled.');
    const body = parseInput(
      z.object({ files: z.array(z.object({ key: z.string().max(200), name: z.string().max(255) })).min(1).max(ctx.config.uploadMaxFiles) }),
      req.body,
    );
    const result = await registerDirectUploads(ctx, requireOwner(req), body.files);
    maybeRunCleanup(ctx);
    res.status(result.uploaded.length > 0 ? 201 : 422).json(result);
  });

  router.get('/', async (req, res) => {
    const kind = req.query.kind === 'ORIGINAL' || req.query.kind === 'RESULT' ? req.query.kind : undefined;
    const assets = await listOwnedAssets(ctx, requireOwner(req), kind);
    res.json({ images: assets.map(serializeAsset) });
  });

  /** ZIP of selected images: GET /api/images/zip?ids=a,b,c */
  router.get('/zip', async (req, res) => {
    const ids = parseInput(
      z.string().transform((s) => [...new Set(s.split(',').map((x) => x.trim()).filter(Boolean))]).pipe(z.array(z.string().uuid()).min(1).max(ctx.config.batchMaxFiles)),
      req.query.ids,
    );
    const owner = requireOwner(req);
    const assets = await Promise.all(ids.map((id) => getOwnedAsset(ctx, owner, id)));
    await streamZip(ctx, assets, 'images.zip', res);
  });

  /** Advanced: an ordered list of operations (used by the editor). */
  router.post('/process', async (req, res) => {
    const body = parseInput(
      z.object({ assetId, operations: operationsSchema.min(0), output: looseOutputSchema.optional() }),
      req.body,
    );
    const job = await createJob(ctx, requireOwner(req), { assetId: body.assetId, type: 'PIPELINE', operations: body.operations, output: body.output });
    res.status(202).json({ job: serializeJob(job) });
  });

  router.post('/batch', async (req, res) => {
    const body = parseInput(
      z.object({ assetIds: z.array(assetId).min(1), operations: operationsSchema, output: looseOutputSchema.optional() }),
      req.body,
    );
    const { batch, jobs } = await createBatch(ctx, requireOwner(req), body);
    res.status(202).json({ batch: serializeBatch(batch, jobs) });
  });

  for (const [name, def] of Object.entries(toolEndpoints)) {
    router.post(`/${name}`, async (req, res) => {
      const body = parseInput(
        z.object({ assetId, output: looseOutputSchema.optional() }).and(def.body),
        req.body,
      ) as { assetId: string; output?: z.infer<typeof looseOutputSchema>; options?: Record<string, unknown> };
      let operations: Operation[];
      try {
        operations = def.toOps(body.options ?? {});
      } catch (err) {
        if (err instanceof z.ZodError) {
          const first = err.issues[0];
          throw new HttpError(400, ErrorCode.VALIDATION_FAILED, `Invalid options: ${first?.path.join('.') ? `${first.path.join('.')}: ` : ''}${first?.message ?? ''}`, err.issues);
        }
        throw err;
      }
      const job = await createJob(ctx, requireOwner(req), { assetId: body.assetId, type: def.type, operations, output: body.output });
      res.status(202).json({ job: serializeJob(job) });
    });
  }

  router.get('/:id', async (req, res) => {
    const asset = await getOwnedAsset(ctx, requireOwner(req), req.params.id);
    res.json({ image: serializeAsset(asset) });
  });

  router.get('/:id/file', async (req, res) => {
    const asset = await getOwnedAsset(ctx, requireOwner(req), req.params.id);
    await streamAsset(ctx, asset, res, req.query.download === '1');
  });

  router.get('/:id/thumbnail', async (req, res) => {
    const asset = await getOwnedAsset(ctx, requireOwner(req), req.params.id);
    await streamAsset(ctx, await getThumbnailAsset(ctx, asset), res, false);
  });

  router.get('/:id/metadata', async (req, res) => {
    const asset = await getOwnedAsset(ctx, requireOwner(req), req.params.id);
    res.json({ metadata: await getMetadataReport(ctx, asset) });
  });

  router.delete('/:id', async (req, res) => {
    await deleteOwnedAsset(ctx, requireOwner(req), req.params.id);
    res.status(204).end();
  });

  return router;
}
