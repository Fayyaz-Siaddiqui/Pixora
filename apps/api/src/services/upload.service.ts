import { createHash, createHmac, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Request } from 'express';
import busboy from 'busboy';
import { fileTypeFromBuffer } from 'file-type';
import sharp, { type Metadata } from 'sharp';
import { ErrorCode } from '@app/shared';
import { HttpError } from '../lib/http-error';
import type { Owner } from '../middleware/identity';
import { safeFileName, storageKey, type ImagingContext } from './context';
import { serializeAsset, type SerializedAsset } from './serializers';

/** Accepted input formats, detected from file CONTENT (magic bytes), never from the extension. */
const ALLOWED_INPUT: Record<string, { format: string; ext: string }> = {
  'image/jpeg': { format: 'jpeg', ext: 'jpg' },
  'image/png': { format: 'png', ext: 'png' },
  'image/webp': { format: 'webp', ext: 'webp' },
  'image/avif': { format: 'avif', ext: 'avif' },
  'image/gif': { format: 'gif', ext: 'gif' },
  'image/tiff': { format: 'tiff', ext: 'tif' },
};

const EXT_ALIASES: Record<string, string> = { jpg: 'jpeg', jpeg: 'jpeg', jpe: 'jpeg', png: 'png', webp: 'webp', avif: 'avif', gif: 'gif', tif: 'tiff', tiff: 'tiff' };

export interface UploadRejection {
  name: string;
  code: ErrorCode;
  message: string;
}

export interface UploadedFile extends SerializedAsset {
  /** True when the file's extension does not match its real format (Format Checker). */
  extensionMismatch: boolean;
  /** Number of frames; only the first frame of animated images is processed. */
  pages: number;
}

interface Received {
  name: string;
  tmpPath: string;
  size: number;
  sha256: string;
  truncated: boolean;
}

function receiveFile(stream: Readable, name: string, tempDir: string): Promise<Received> {
  const tmpPath = path.join(tempDir, `upload-${randomUUID()}`);
  const hash = createHash('sha256');
  let size = 0;
  const meter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      size += chunk.length;
      hash.update(chunk);
      cb(null, chunk);
    },
  });
  return pipeline(stream, meter, createWriteStream(tmpPath)).then(() => ({
    name,
    tmpPath,
    size,
    sha256: hash.digest('hex'),
    truncated: (stream as Readable & { truncated?: boolean }).truncated === true,
  }));
}

/** Stream a multipart upload to temp files, enforcing size and count limits while streaming. */
async function receiveMultipart(req: Request, ctx: ImagingContext): Promise<{ files: Received[]; tooManyFiles: boolean }> {
  if (!req.is('multipart/form-data')) {
    throw new HttpError(400, ErrorCode.BAD_REQUEST, 'Send files as multipart/form-data in a field named "files".');
  }
  const { uploadMaxBytes, uploadMaxFiles } = ctx.config;
  let bb: busboy.Busboy;
  try {
    bb = busboy({
      headers: req.headers,
      defParamCharset: 'utf8',
      limits: { fileSize: uploadMaxBytes, files: uploadMaxFiles, fields: 10, parts: uploadMaxFiles + 10, fieldSize: 1024 },
    });
  } catch {
    throw new HttpError(400, ErrorCode.BAD_REQUEST, 'Malformed multipart request.');
  }

  const pending: Promise<Received>[] = [];
  let tooManyFiles = false;

  await new Promise<void>((resolve, reject) => {
    bb.on('file', (_field, stream, info) => {
      const p = receiveFile(stream, safeFileName(info.filename ?? 'image'), ctx.storage.tempDir);
      p.catch(() => {}); // handled below via Promise.allSettled
      pending.push(p);
    });
    bb.on('filesLimit', () => {
      tooManyFiles = true;
    });
    bb.on('error', () => reject(new HttpError(400, ErrorCode.BAD_REQUEST, 'The upload was interrupted or malformed.')));
    bb.on('close', () => resolve());
    req.on('aborted', () => reject(new HttpError(400, ErrorCode.BAD_REQUEST, 'The upload was cancelled.')));
    req.pipe(bb);
  }).catch(async (err: unknown) => {
    const settled = await Promise.allSettled(pending);
    await Promise.all(settled.map((s) => (s.status === 'fulfilled' ? unlink(s.value.tmpPath).catch(() => {}) : undefined)));
    throw err;
  });

  const settled = await Promise.allSettled(pending);
  const files = settled.flatMap((s) => (s.status === 'fulfilled' ? [s.value] : []));
  if (settled.some((s) => s.status === 'rejected')) {
    await Promise.all(files.map((f) => unlink(f.tmpPath).catch(() => {})));
    throw new HttpError(400, ErrorCode.BAD_REQUEST, 'The upload was interrupted. Please try again.');
  }
  return { files, tooManyFiles };
}

type Validated =
  | { ok: true; name: string; size: number; sha256: string; format: string; ext: string; width: number; height: number; hasAlpha: boolean; space: string | undefined; hasIcc: boolean; orientation: number | null; pages: number; thumbnail: Buffer; extensionMismatch: boolean }
  | { ok: false; rejection: UploadRejection };

function tooLarge(ctx: ImagingContext, name: string): Validated {
  const maxMb = (ctx.config.uploadMaxBytes / 1024 / 1024).toFixed(0);
  return { ok: false, rejection: { name, code: ErrorCode.PAYLOAD_TOO_LARGE, message: `File is larger than the ${maxMb} MB limit.` } };
}

async function validateFile(file: Received, ctx: ImagingContext): Promise<Validated> {
  if (file.truncated) return tooLarge(ctx, file.name);
  if (file.size === 0) return { ok: false, rejection: { name: file.name, code: ErrorCode.BAD_REQUEST, message: 'File is empty.' } };
  // Inspect the file from memory, never by path: libvips keeps files it opened
  // (e.g. memory-mapped WebP) locked, and on Windows a locked temp file cannot
  // then be moved into storage (EBUSY). The size is already capped by the upload limit.
  return validateBuffer(file.name, await readFile(file.tmpPath), ctx);
}

/** Validate image bytes: real format from content, decompression-bomb guard, full decode + thumbnail. */
async function validateBuffer(name: string, data: Buffer, ctx: ImagingContext): Promise<Validated> {
  const reject = (code: ErrorCode, message: string): Validated => ({ ok: false, rejection: { name, code, message } });
  if (data.length === 0) return reject(ErrorCode.BAD_REQUEST, 'File is empty.');
  if (data.length > ctx.config.uploadMaxBytes) return tooLarge(ctx, name);

  const detected = await fileTypeFromBuffer(data).catch(() => undefined);
  const allowed = detected ? ALLOWED_INPUT[detected.mime] : undefined;
  if (!allowed) {
    return reject(
      ErrorCode.UNSUPPORTED_FORMAT,
      detected
        ? `Unsupported file type (${detected.mime}). Upload JPEG, PNG, WebP, AVIF, GIF or TIFF.`
        : 'This file is not a recognised image. Upload JPEG, PNG, WebP, AVIF, GIF or TIFF.',
    );
  }

  let meta: Metadata;
  try {
    meta = await sharp(data, { limitInputPixels: false }).metadata();
  } catch {
    return reject(ErrorCode.CORRUPT_IMAGE, 'The image file appears to be damaged and cannot be read.');
  }
  // Decompression-bomb guard: pixel count comes from the header, before any decoding.
  const pixels = meta.width * meta.height;
  if (pixels > ctx.config.maxInputPixels) {
    return reject(
      ErrorCode.IMAGE_TOO_LARGE,
      `Image is ${meta.width}x${meta.height} (${(pixels / 1e6).toFixed(1)} MP); the limit is ${(ctx.config.maxInputPixels / 1e6).toFixed(0)} MP.`,
    );
  }

  // Full decode while making the thumbnail: catches truncated/corrupt pixel data.
  let thumbnail: Buffer;
  try {
    thumbnail = await sharp(data, { limitInputPixels: ctx.config.maxInputPixels, failOn: 'error', animated: false })
      .timeout({ seconds: 30 })
      .autoOrient()
      .resize(480, 480, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 75 })
      .toBuffer();
  } catch {
    return reject(ErrorCode.CORRUPT_IMAGE, 'The image file appears to be damaged or incomplete.');
  }

  const declaredExt = path.extname(name).slice(1).toLowerCase();
  const extensionMismatch = declaredExt !== '' && EXT_ALIASES[declaredExt] !== allowed.format;

  return {
    ok: true,
    name,
    size: data.length,
    sha256: createHash('sha256').update(data).digest('hex'),
    format: allowed.format,
    ext: allowed.ext,
    // Stored dimensions are as displayed (EXIF orientation applied), matching what processing produces.
    width: meta.autoOrient.width,
    height: meta.autoOrient.height,
    hasAlpha: Boolean(meta.hasAlpha),
    space: meta.space,
    hasIcc: Boolean(meta.icc),
    orientation: meta.orientation ?? null,
    pages: meta.pages ?? 1,
    thumbnail,
    extensionMismatch,
  };
}

/**
 * Handle POST /api/images/upload. Each file is validated independently, so
 * one bad file does not reject the others.
 */
export async function handleUpload(
  req: Request,
  owner: Owner,
  ctx: ImagingContext,
): Promise<{ uploaded: UploadedFile[]; rejected: UploadRejection[] }> {
  const { files, tooManyFiles } = await receiveMultipart(req, ctx);
  const uploaded: UploadedFile[] = [];
  const rejected: UploadRejection[] = [];
  if (tooManyFiles) {
    rejected.push({ name: '(extra files)', code: ErrorCode.VALIDATION_FAILED, message: `Only ${ctx.config.uploadMaxFiles} files can be uploaded at once; the rest were ignored.` });
  }
  if (files.length === 0 && !tooManyFiles) {
    throw new HttpError(400, ErrorCode.BAD_REQUEST, 'No files were received. Use a field named "files".');
  }

  // Validate one at a time to bound memory use.
  for (const file of files) {
    let v: Validated;
    try {
      v = await validateFile(file, ctx);
    } catch (err) {
      ctx.logger.error({ err }, 'upload validation failed unexpectedly');
      v = { ok: false, rejection: { name: file.name, code: ErrorCode.PROCESSING_FAILED, message: 'The file could not be checked. Please try again.' } };
    }
    if (!v.ok) {
      rejected.push(v.rejection);
      await unlink(file.tmpPath).catch(() => {});
      continue;
    }

    const stored = await persistValidated(ctx, owner, v, (key, mime) => ctx.storage.putFile(key, file.tmpPath, mime));
    if (stored.ok) uploaded.push(stored.file);
    else {
      await unlink(file.tmpPath).catch(() => {});
      rejected.push(stored.rejection);
    }
  }

  return { uploaded, rejected };
}

const MIME_BY_FORMAT = Object.fromEntries(Object.entries(ALLOWED_INPUT).map(([mime, x]) => [x.format, mime]));

/**
 * Store a validated original (via `storeOriginal`, or already stored at
 * `existingKey`), its thumbnail, and the database rows. On failure every
 * stored object is removed again.
 */
async function persistValidated(
  ctx: ImagingContext,
  owner: Owner,
  v: Extract<Validated, { ok: true }>,
  storeOriginal: ((key: string, mime: string) => Promise<void>) | null,
  existingKey?: string,
): Promise<{ ok: true; file: UploadedFile } | { ok: false; rejection: UploadRejection }> {
  const expiresAt = new Date(Date.now() + ctx.config.retentionMs);
  const assetId = randomUUID();
  const thumbId = randomUUID();
  const originalKey = existingKey ?? storageKey('originals', assetId, v.ext);
  const thumbKey = storageKey('thumbs', thumbId, 'webp');
  const mime = MIME_BY_FORMAT[v.format]!;

  try {
    if (storeOriginal) await storeOriginal(originalKey, mime);
    await ctx.storage.putBuffer(thumbKey, v.thumbnail, 'image/webp');
    const thumbMeta = await sharp(v.thumbnail).metadata();
    const asset = await ctx.prisma.$transaction(async (tx) => {
      const so = await tx.storageObject.create({
        data: { provider: ctx.storage.provider, bucket: ctx.storage.bucket, key: originalKey, contentType: mime, sizeBytes: BigInt(v.size), sha256: v.sha256, expiresAt },
      });
      const a = await tx.imageAsset.create({
        data: {
          id: assetId,
          userId: owner.userId,
          guestId: owner.userId ? null : owner.guestId,
          kind: 'ORIGINAL',
          storageObjectId: so.id,
          originalName: v.name,
          format: v.format,
          width: v.width,
          height: v.height,
          hasAlpha: v.hasAlpha,
          colorSpace: v.space ?? null,
          hasIccProfile: v.hasIcc,
          exifOrientation: v.orientation,
          sizeBytes: BigInt(v.size),
          expiresAt,
        },
      });
      const tso = await tx.storageObject.create({
        data: { provider: ctx.storage.provider, bucket: ctx.storage.bucket, key: thumbKey, contentType: 'image/webp', sizeBytes: BigInt(v.thumbnail.length), sha256: createHash('sha256').update(v.thumbnail).digest('hex'), expiresAt },
      });
      await tx.imageAsset.create({
        data: {
          id: thumbId,
          userId: owner.userId,
          guestId: owner.userId ? null : owner.guestId,
          kind: 'THUMBNAIL',
          parentAssetId: assetId,
          storageObjectId: tso.id,
          originalName: `thumb-${v.name}`,
          format: 'webp',
          width: thumbMeta.width,
          height: thumbMeta.height,
          hasAlpha: Boolean(thumbMeta.hasAlpha),
          sizeBytes: BigInt(v.thumbnail.length),
          expiresAt,
        },
      });
      return a;
    });
    return { ok: true, file: { ...serializeAsset(asset), extensionMismatch: v.extensionMismatch, pages: v.pages } };
  } catch (err) {
    ctx.logger.error({ err }, 'failed to store upload');
    await Promise.all([ctx.storage.delete(originalKey).catch(() => {}), ctx.storage.delete(thumbKey).catch(() => {})]);
    return { ok: false, rejection: { name: v.name, code: ErrorCode.STORAGE_ERROR, message: 'The file could not be saved. Please try again.' } };
  }
}

// ───────── Direct uploads (browser → storage, e.g. Vercel Blob) ─────────

/** Folder for files a visitor uploaded directly but has not registered yet. */
export const INCOMING_PREFIX = 'incoming/';

/**
 * A stable, unguessable folder name per visitor, derived from their identity
 * with an HMAC. Upload tokens are only issued for paths inside it, and only
 * files inside it can be registered, so nobody can claim another visitor's upload.
 */
export function ownerUploadPrefix(ctx: ImagingContext, owner: Owner): string {
  const who = owner.userId ? `u:${owner.userId}` : `g:${owner.guestId}`;
  const tag = createHmac('sha256', ctx.config.signingSecret).update(`direct-upload:${who}`).digest('base64url').slice(0, 24);
  return `${INCOMING_PREFIX}${tag}/`;
}

const UPLOAD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** True when `key` is a direct-upload path that belongs to `owner`. */
export function isOwnDirectUploadKey(ctx: ImagingContext, owner: Owner, key: string): boolean {
  const prefix = ownerUploadPrefix(ctx, owner);
  return key.startsWith(prefix) && UPLOAD_ID.test(key.slice(prefix.length));
}

/**
 * Register files the browser uploaded directly to storage. Each file is
 * validated exactly like a classic upload; rejected files are deleted.
 */
export async function registerDirectUploads(
  ctx: ImagingContext,
  owner: Owner,
  files: { key: string; name: string }[],
): Promise<{ uploaded: UploadedFile[]; rejected: UploadRejection[] }> {
  const uploaded: UploadedFile[] = [];
  const rejected: UploadRejection[] = [];

  for (const f of files) {
    const name = safeFileName(f.name);
    if (!isOwnDirectUploadKey(ctx, owner, f.key)) {
      rejected.push({ name, code: ErrorCode.FORBIDDEN, message: 'This upload does not belong to you.' });
      continue;
    }
    if (await ctx.prisma.storageObject.findFirst({ where: { key: f.key }, select: { id: true } })) {
      rejected.push({ name, code: ErrorCode.CONFLICT, message: 'This file was already added.' });
      continue;
    }

    let v: Validated;
    try {
      v = await validateBuffer(name, await ctx.storage.getBuffer(f.key), ctx);
    } catch (err) {
      ctx.logger.warn({ err }, 'direct upload could not be read');
      v = { ok: false, rejection: { name, code: ErrorCode.BAD_REQUEST, message: 'The upload was not found or is incomplete. Please try again.' } };
    }
    if (!v.ok) {
      rejected.push(v.rejection);
      await ctx.storage.delete(f.key).catch(() => {});
      continue;
    }
    const stored = await persistValidated(ctx, owner, v, null, f.key);
    if (stored.ok) uploaded.push(stored.file);
    else rejected.push(stored.rejection);
  }
  return { uploaded, rejected };
}
