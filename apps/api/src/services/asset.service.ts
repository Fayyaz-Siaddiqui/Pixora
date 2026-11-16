import type { Response } from 'express';
import ZipStream from 'zip-stream';
import type { ImageAsset, StorageObject } from '@app/db';
import { ErrorCode } from '@app/shared';
import { HttpError } from '../lib/http-error';
import { ownerWhere, type Owner } from '../middleware/identity';
import { readMetadataReport } from '../processors/metadata';
import { safeFileName, type ImagingContext } from './context';

export type AssetWithStorage = ImageAsset & { storageObject: StorageObject };

/** Load an asset that belongs to `owner`. Other owners' assets are reported as not found. */
export async function getOwnedAsset(ctx: ImagingContext, owner: Owner, id: string): Promise<AssetWithStorage> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, ErrorCode.NOT_FOUND, 'Image not found.');
  const asset = await ctx.prisma.imageAsset.findFirst({
    where: { id, ...ownerWhere(owner) },
    include: { storageObject: true },
  });
  if (!asset) throw new HttpError(404, ErrorCode.NOT_FOUND, 'Image not found.');
  if (asset.deletedAt) throw new HttpError(410, ErrorCode.NOT_FOUND, 'This image has expired or was deleted.');
  return asset;
}

export async function listOwnedAssets(ctx: ImagingContext, owner: Owner, kind?: 'ORIGINAL' | 'RESULT') {
  return ctx.prisma.imageAsset.findMany({
    where: { ...ownerWhere(owner), deletedAt: null, kind: kind ?? { in: ['ORIGINAL', 'RESULT'] } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}

function contentDisposition(type: 'inline' | 'attachment', name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/** Stream a stored file to the client with correct headers. */
export async function streamAsset(ctx: ImagingContext, asset: AssetWithStorage, res: Response, download: boolean): Promise<void> {
  const stream = await ctx.storage.createReadStream(asset.storageObject.key).catch(() => {
    throw new HttpError(410, ErrorCode.NOT_FOUND, 'This image is no longer available.');
  });
  res.status(200);
  res.setHeader('Content-Type', asset.storageObject.contentType);
  res.setHeader('Content-Length', String(asset.storageObject.sizeBytes));
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.setHeader('ETag', `"${asset.storageObject.sha256}"`);
  res.setHeader('Content-Disposition', contentDisposition(download ? 'attachment' : 'inline', safeFileName(asset.originalName)));
  stream.on('error', (err) => {
    ctx.logger.error({ err }, 'download stream failed');
    res.destroy(err);
  });
  stream.pipe(res);
}

/** Return the thumbnail for an original, or the asset itself when none exists. */
export async function getThumbnailAsset(ctx: ImagingContext, asset: AssetWithStorage): Promise<AssetWithStorage> {
  const thumb = await ctx.prisma.imageAsset.findFirst({
    where: { parentAssetId: asset.id, kind: 'THUMBNAIL', deletedAt: null },
    include: { storageObject: true },
  });
  return thumb ?? asset;
}

export async function getMetadataReport(ctx: ImagingContext, asset: AssetWithStorage) {
  const buffer = await ctx.storage.getBuffer(asset.storageObject.key);
  const report = await readMetadataReport(buffer, ctx.config.maxInputPixels);
  return { id: asset.id, name: asset.originalName, sizeBytes: Number(asset.sizeBytes), ...report };
}

/** Delete an asset's stored bytes and mark it deleted (the row is kept for history). */
export async function deleteAssetFiles(ctx: ImagingContext, assets: AssetWithStorage[]): Promise<void> {
  const now = new Date();
  for (const a of assets) {
    await ctx.storage.delete(a.storageObject.key);
    await ctx.prisma.$transaction([
      ctx.prisma.storageObject.update({ where: { id: a.storageObjectId }, data: { deletedAt: now } }),
      ctx.prisma.imageAsset.update({ where: { id: a.id }, data: { deletedAt: now } }),
    ]);
  }
}

export async function deleteOwnedAsset(ctx: ImagingContext, owner: Owner, id: string): Promise<void> {
  const asset = await getOwnedAsset(ctx, owner, id);
  const thumbs = await ctx.prisma.imageAsset.findMany({
    where: { parentAssetId: asset.id, kind: 'THUMBNAIL', deletedAt: null },
    include: { storageObject: true },
  });
  await deleteAssetFiles(ctx, [asset, ...thumbs]);
}

/** Give every entry in a ZIP a unique name. */
export function uniqueNames(names: string[]): string[] {
  const used = new Map<string, number>();
  return names.map((n) => {
    const safe = safeFileName(n);
    const count = used.get(safe.toLowerCase()) ?? 0;
    used.set(safe.toLowerCase(), count + 1);
    if (count === 0) return safe;
    const dot = safe.lastIndexOf('.');
    return dot > 0 ? `${safe.slice(0, dot)} (${count})${safe.slice(dot)}` : `${safe} (${count})`;
  });
}

/** Stream a ZIP of the given assets. Images are already compressed, so entries are stored, not deflated. */
export async function streamZip(ctx: ImagingContext, assets: AssetWithStorage[], zipName: string, res: Response): Promise<void> {
  if (assets.length === 0) throw new HttpError(404, ErrorCode.NOT_FOUND, 'There are no finished files to download.');
  res.status(200);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Disposition', contentDisposition('attachment', zipName));

  const zip = new ZipStream({ store: true });
  zip.on('error', (err: Error) => {
    ctx.logger.error({ err }, 'zip stream failed');
    res.destroy(err);
  });
  zip.pipe(res);

  const names = uniqueNames(assets.map((a) => a.originalName));
  for (const [i, asset] of assets.entries()) {
    const stream = await ctx.storage.createReadStream(asset.storageObject.key);
    await new Promise<void>((resolve, reject) => {
      zip.entry(stream, { name: names[i]!, date: asset.createdAt }, (err) => (err ? reject(err) : resolve()));
    });
  }
  zip.finish();
}
