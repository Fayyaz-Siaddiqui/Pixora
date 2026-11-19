import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { ErrorCode, operationsSchema, outputSchema } from '@app/shared';
import { encode } from '../processors/encode';
import { ProcessingError, classifySharpError } from '../processors/errors';
import { safeExifSubset } from '../processors/metadata';
import { runPipeline } from '../processors/pipeline';
import { QUEUES, type ProcessImagePayload } from '../queues/queue';
import { StorageError } from '../storage/storage';
import { safeFileName, storageKey, stripExtension, type ImagingContext } from '../services/context';
import { refreshBatchStatus } from '../services/job.service';

/**
 * Process one job: read the ORIGINAL, run the operations, encode once,
 * store the result. Failures are recorded on the job with a user-safe
 * message; they are not rethrown, so pg-boss does not blindly retry
 * deterministic failures (users can retry from the UI).
 */
export async function processImageJob(ctx: ImagingContext, jobId: string): Promise<void> {
  const { prisma, storage, config, logger } = ctx;
  const started = Date.now();

  // Claim the job. A job stuck in PROCESSING (worker crashed) can be reclaimed after the timeout.
  const staleBefore = new Date(Date.now() - (config.jobTimeoutSeconds + 30) * 1000);
  const claimed = await prisma.processingJob.updateMany({
    where: {
      id: jobId,
      OR: [{ status: 'QUEUED' }, { status: 'PROCESSING', startedAt: { lt: staleBefore } }],
    },
    data: { status: 'PROCESSING', startedAt: new Date(), progress: 1, attempts: { increment: 1 } },
  });
  if (claimed.count === 0) return; // cancelled, finished, or being processed elsewhere

  const job = await prisma.processingJob.findUniqueOrThrow({
    where: { id: jobId },
    include: { inputAsset: { include: { storageObject: true } } },
  });

  let lastProgress = 0;
  const reportProgress = async (fraction: number) => {
    const p = Math.min(90, Math.max(1, Math.round(fraction * 90)));
    if (p - lastProgress < 5) return;
    lastProgress = p;
    await prisma.processingJob.update({ where: { id: jobId }, data: { progress: p } }).catch(() => {});
  };

  try {
    const source = job.inputAsset;
    if (source.deletedAt) throw new ProcessingError(ErrorCode.NOT_FOUND, 'The original image has expired or was deleted.');

    const params = job.params as { operations?: unknown; output?: unknown };
    const operations = operationsSchema.parse(params.operations ?? []);
    const output = outputSchema.parse(params.output);

    let input: Buffer;
    try {
      input = await storage.getBuffer(source.storageObject.key);
    } catch (err) {
      throw new ProcessingError(ErrorCode.STORAGE_ERROR, 'The original image could not be read from storage.', { cause: err });
    }

    const raw = await runPipeline(input, operations, {
      maxInputPixels: config.maxInputPixels,
      limits: { maxDimension: config.maxOutputDimension, maxPixels: config.maxOutputPixels },
      timeoutSeconds: config.jobTimeoutSeconds,
      onProgress: reportProgress,
    });

    const exif = output.keepMetadata ? safeExifSubset((await sharp(input).metadata()).exif) : null;
    const encoded = await encode(raw, output, { timeoutSeconds: config.jobTimeoutSeconds, exif });
    await reportProgress(0.97);

    const assetId = randomUUID();
    const key = storageKey('results', assetId, encoded.extension);
    try {
      await storage.putBuffer(key, encoded.data, encoded.mime);
    } catch (err) {
      throw new ProcessingError(ErrorCode.STORAGE_ERROR, 'The result could not be saved.', { cause: err });
    }

    const name = `${safeFileName(stripExtension(source.originalName))}-${encoded.width}x${encoded.height}.${encoded.extension}`;
    const expiresAt = new Date(Date.now() + config.retentionMs);

    await prisma.$transaction(async (tx) => {
      const so = await tx.storageObject.create({
        data: {
          provider: storage.provider,
          bucket: storage.bucket,
          key,
          contentType: encoded.mime,
          sizeBytes: BigInt(encoded.data.length),
          sha256: createHash('sha256').update(encoded.data).digest('hex'),
          expiresAt,
        },
      });
      await tx.imageAsset.create({
        data: {
          id: assetId,
          userId: job.userId,
          guestId: job.guestId,
          kind: 'RESULT',
          parentAssetId: source.id,
          storageObjectId: so.id,
          originalName: name,
          format: encoded.format,
          width: encoded.width,
          height: encoded.height,
          hasAlpha: raw.channels === 4 && !encoded.details.flattenedTransparency && encoded.format !== 'jpeg',
          colorSpace: 'srgb',
          sizeBytes: BigInt(encoded.data.length),
          expiresAt,
        },
      });
      await tx.processingResult.create({
        data: {
          jobId,
          outputAssetId: assetId,
          width: encoded.width,
          height: encoded.height,
          format: encoded.format,
          sizeBytes: BigInt(encoded.data.length),
          durationMs: Date.now() - started,
          details: encoded.details,
        },
      });
      await tx.processingJob.update({
        where: { id: jobId },
        data: { status: 'SUCCEEDED', progress: 100, finishedAt: new Date(), errorCode: null, errorMessage: null },
      });
    });
  } catch (err) {
    const pe =
      err instanceof ProcessingError ? err :
      err instanceof StorageError ? new ProcessingError(ErrorCode.STORAGE_ERROR, 'A storage error occurred.', { cause: err }) :
      classifySharpError(err);
    logger.warn({ jobId, code: pe.code, err: (pe.cause as Error | undefined) ?? pe }, 'image job failed');
    await prisma.processingJob.update({
      where: { id: jobId },
      data: { status: 'FAILED', errorCode: pe.code, errorMessage: pe.message, finishedAt: new Date() },
    });
  } finally {
    if (job.batchId) await refreshBatchStatus(ctx, job.batchId).catch(() => {});
  }
}

/** Start consuming the image queue in this process. */
export async function startImageWorker(ctx: ImagingContext): Promise<void> {
  if (!ctx.boss) throw new Error('startImageWorker needs queue mode (JOB_RUNNER=queue).');
  await ctx.boss.work<ProcessImagePayload>(
    QUEUES.processImage,
    {
      localConcurrency: ctx.config.workerConcurrency,
      pollingIntervalSeconds: ctx.config.workerPollSeconds,
      batchSize: 1,
    },
    async (jobs) => {
      for (const job of jobs) await processImageJob(ctx, job.data.jobId);
    },
  );
  ctx.logger.info(`Image worker started (concurrency ${ctx.config.workerConcurrency}).`);
}
