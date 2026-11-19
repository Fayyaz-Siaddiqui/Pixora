import { Router } from 'express';
import { requireOwner } from '../middleware/identity';
import { getOwnedAsset, streamZip } from '../services/asset.service';
import type { ImagingContext } from '../services/context';
import { cancelJob, getOwnedBatch, getOwnedJob, kickStalledJobs, listOwnedJobs, retryJob } from '../services/job.service';
import { serializeBatch, serializeJob } from '../services/serializers';

export function jobRoutes(ctx: ImagingContext): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const jobs = await listOwnedJobs(ctx, requireOwner(req));
    res.json({ jobs: jobs.map(serializeJob) });
  });

  /** Poll this for status and progress (0-100). */
  router.get('/:id', async (req, res) => {
    const job = await getOwnedJob(ctx, requireOwner(req), req.params.id);
    await kickStalledJobs(ctx, [job]);
    res.set('Cache-Control', 'no-store').json({ job: serializeJob(job) });
  });

  router.post('/:id/cancel', async (req, res) => {
    const job = await cancelJob(ctx, requireOwner(req), req.params.id);
    res.json({ job: serializeJob(job) });
  });

  router.post('/:id/retry', async (req, res) => {
    const job = await retryJob(ctx, requireOwner(req), req.params.id);
    res.status(202).json({ job: serializeJob(job) });
  });

  return router;
}

export function batchRoutes(ctx: ImagingContext): Router {
  const router = Router();

  router.get('/:id', async (req, res) => {
    const { batch, jobs } = await getOwnedBatch(ctx, requireOwner(req), req.params.id);
    await kickStalledJobs(ctx, jobs);
    res.set('Cache-Control', 'no-store').json({ batch: serializeBatch(batch, jobs) });
  });

  /** ZIP of every successful result in the batch, streamed. */
  router.get('/:id/download', async (req, res) => {
    const owner = requireOwner(req);
    const { jobs } = await getOwnedBatch(ctx, owner, req.params.id);
    const resultIds = jobs.flatMap((j) => (j.status === 'SUCCEEDED' && j.result && !j.result.outputAsset.deletedAt ? [j.result.outputAssetId] : []));
    const assets = await Promise.all(resultIds.map((id) => getOwnedAsset(ctx, owner, id)));
    await streamZip(ctx, assets, `batch-${req.params.id.slice(0, 8)}.zip`, res);
  });

  return router;
}
