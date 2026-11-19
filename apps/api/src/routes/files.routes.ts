import { Router } from 'express';
import { ErrorCode } from '@app/shared';
import { HttpError } from '../lib/http-error';
import { streamAsset, streamZip } from '../services/asset.service';
import type { ImagingContext } from '../services/context';
import { verifyDownload } from '../services/download-links';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Downloads via signed links (see services/download-links.ts). The last path
 * segment is the file name, for browsers and download managers; the file
 * itself is always looked up by id, and its stored name is what we send.
 */
export function fileRoutes(ctx: ImagingContext): Router {
  const router = Router();
  const denied = () => new HttpError(404, ErrorCode.NOT_FOUND, 'This download link is invalid or has expired. Download the file again from the page.');

  router.get('/batch/:id/:name', async (req, res) => {
    const { id } = req.params;
    if (!UUID.test(id) || !verifyDownload('batch', id, req.query.exp, req.query.sig)) throw denied();
    const jobs = await ctx.prisma.processingJob.findMany({
      where: { batchId: id, status: 'SUCCEEDED' },
      include: { result: { include: { outputAsset: { include: { storageObject: true } } } } },
      orderBy: { createdAt: 'asc' },
    });
    const assets = jobs.flatMap((j) => (j.result && !j.result.outputAsset.deletedAt ? [j.result.outputAsset] : []));
    await streamZip(ctx, assets, `batch-${id.slice(0, 8)}.zip`, res);
  });

  router.get('/:id/:name', async (req, res) => {
    const { id } = req.params;
    if (!UUID.test(id) || !verifyDownload('image', id, req.query.exp, req.query.sig)) throw denied();
    const asset = await ctx.prisma.imageAsset.findUnique({ where: { id }, include: { storageObject: true } });
    if (!asset || asset.kind === 'THUMBNAIL') throw denied();
    if (asset.deletedAt) throw new HttpError(410, ErrorCode.NOT_FOUND, 'This image has expired or was deleted.');
    await streamAsset(ctx, asset, res, true);
  });

  return router;
}
