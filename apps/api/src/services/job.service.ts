import type { JobType, ProcessingJob } from '@app/db';
import { DimensionError, OUTPUT_FORMATS, type OutputFormat } from '@app/image-core';
import { ErrorCode, outputSchema, planPipeline, type Operation, type OutputOptions } from '@app/shared';
import { z } from 'zod';
import { HttpError } from '../lib/http-error';
import { ownerWhere, type Owner } from '../middleware/identity';
import { supportsTargetSize } from '../processors/encode';
import { getOwnedAsset, type AssetWithStorage } from './asset.service';
import type { ImagingContext } from './context';

/** Stored in ProcessingJob.params. */
export const jobParamsSchema = z.object({
  operations: z.array(z.any()),
  output: outputSchema,
});
export type JobParams = { operations: Operation[]; output: OutputOptions };

/** Output options as sent by clients: `format` may be omitted to keep the source format. */
export const looseOutputSchema = outputSchema.extend({ format: z.enum(OUTPUT_FORMATS).optional() });
export type LooseOutput = z.infer<typeof looseOutputSchema>;

/** Keep the source format when it can be written; otherwise PNG for transparent images, JPEG for the rest. */
export function resolveOutput(asset: { format: string; hasAlpha: boolean }, loose: LooseOutput | undefined): OutputOptions {
  const fallback: OutputFormat = (OUTPUT_FORMATS as readonly string[]).includes(asset.format)
    ? (asset.format as OutputFormat)
    : asset.hasAlpha ? 'png' : 'jpeg';
  return outputSchema.parse({ ...(loose ?? {}), format: loose?.format ?? fallback });
}

function limits(ctx: ImagingContext) {
  return { maxDimension: ctx.config.maxOutputDimension, maxPixels: ctx.config.maxOutputPixels };
}

/** Validate a request against the source image WITHOUT decoding it. Throws a 422 HttpError. */
function validatePlan(ctx: ImagingContext, asset: AssetWithStorage, operations: Operation[], output: OutputOptions): void {
  if (asset.kind === 'THUMBNAIL') throw new HttpError(422, ErrorCode.VALIDATION_FAILED, 'Thumbnails cannot be processed.');
  if (output.targetSizeKB !== undefined && !supportsTargetSize(output)) {
    throw new HttpError(422, ErrorCode.VALIDATION_FAILED, 'A target file size works with JPEG, WebP or AVIF (lossy). PNG and lossless output cannot be size-targeted.');
  }
  try {
    planPipeline({ width: asset.width, height: asset.height, hasAlpha: asset.hasAlpha }, operations, output, limits(ctx));
  } catch (err) {
    if (err instanceof DimensionError) throw new HttpError(422, ErrorCode.INVALID_DIMENSIONS, err.message);
    throw err;
  }
}

async function enforceQuota(ctx: ImagingContext, owner: Owner, adding: number): Promise<void> {
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const count = await ctx.prisma.processingJob.count({ where: { ...ownerWhere(owner), createdAt: { gte: since } } });
  if (count + adding > ctx.config.guestDailyJobLimit) {
    throw new HttpError(
      429,
      ErrorCode.QUOTA_EXCEEDED,
      `Daily limit reached (${ctx.config.guestDailyJobLimit} images per 24 hours). Please try again later.`,
    );
  }
}

function enqueue(ctx: ImagingContext, jobs: ProcessingJob[]): Promise<void> {
  return ctx.runner.dispatch(jobs.map((j) => ({ id: j.id, priority: j.priority })));
}

/** A queued job that nobody picked up for this long is dispatched again (inline mode). */
const STALL_AFTER_MS = 20_000;

/**
 * Inline mode has no worker to recover from a crashed or timed-out function,
 * so status polls re-dispatch jobs that look stuck. The atomic claim in the
 * job processor guarantees a job never runs twice at the same time.
 */
export async function kickStalledJobs(ctx: ImagingContext, jobs: Pick<ProcessingJob, 'id' | 'priority' | 'status' | 'createdAt' | 'startedAt' | 'updatedAt'>[]): Promise<void> {
  if (ctx.runner.mode !== 'inline') return;
  const now = Date.now();
  const processingTimeoutMs = (ctx.config.jobTimeoutSeconds + 30) * 1000;
  const stalled = jobs.filter(
    (j) =>
      (j.status === 'QUEUED' && now - j.updatedAt.getTime() > STALL_AFTER_MS) ||
      (j.status === 'PROCESSING' && j.startedAt !== null && now - j.startedAt.getTime() > processingTimeoutMs),
  );
  // Claim the right to re-dispatch (touching updatedAt) so concurrent polls don't all kick the same job.
  const kicked: ProcessingJob[] = [];
  for (const j of stalled) {
    const { count } = await ctx.prisma.processingJob.updateMany({
      where: { id: j.id, status: j.status, updatedAt: j.updatedAt },
      data: { queueJobId: `inline-retry-${now}` },
    });
    if (count === 1) kicked.push(j as ProcessingJob);
  }
  if (kicked.length > 0) {
    ctx.logger.warn({ jobs: kicked.map((j) => j.id) }, 're-dispatching stalled jobs');
    await enqueue(ctx, kicked);
  }
}

const jobInclude = { inputAsset: true, result: { include: { outputAsset: true } } } as const;

export async function createJob(
  ctx: ImagingContext,
  owner: Owner,
  input: { assetId: string; type: JobType; operations: Operation[]; output?: LooseOutput },
) {
  const asset = await getOwnedAsset(ctx, owner, input.assetId);
  const output = resolveOutput(asset, input.output);
  validatePlan(ctx, asset, input.operations, output);
  await enforceQuota(ctx, owner, 1);

  const params: JobParams = { operations: input.operations, output };
  const job = await ctx.prisma.processingJob.create({
    data: {
      userId: owner.userId,
      guestId: owner.userId ? null : owner.guestId,
      inputAssetId: asset.id,
      type: input.type,
      params: params as object,
    },
  });
  await enqueue(ctx, [job]);
  return ctx.prisma.processingJob.findUniqueOrThrow({ where: { id: job.id }, include: jobInclude });
}

export async function createBatch(
  ctx: ImagingContext,
  owner: Owner,
  input: { assetIds: string[]; operations: Operation[]; output?: LooseOutput },
) {
  const ids = [...new Set(input.assetIds)];
  if (ids.length === 0) throw new HttpError(422, ErrorCode.VALIDATION_FAILED, 'Select at least one image.');
  if (ids.length > ctx.config.batchMaxFiles) {
    throw new HttpError(422, ErrorCode.VALIDATION_FAILED, `A batch can contain at most ${ctx.config.batchMaxFiles} images.`);
  }
  await enforceQuota(ctx, owner, ids.length);

  // Resolve every asset first so an unknown id fails the whole request.
  const assets = await Promise.all(ids.map((id) => getOwnedAsset(ctx, owner, id)));

  const batch = await ctx.prisma.processingBatch.create({
    data: {
      userId: owner.userId,
      guestId: owner.userId ? null : owner.guestId,
      status: 'PROCESSING',
      totalCount: assets.length,
      settings: { operations: input.operations, output: input.output ?? {} } as object,
    },
  });

  const queued: ProcessingJob[] = [];
  for (const asset of assets) {
    // Per-image validation: one unsuitable image fails on its own instead of blocking the batch.
    let output: OutputOptions | null = null;
    let error: { code: string; message: string } | null = null;
    try {
      output = resolveOutput(asset, input.output);
      validatePlan(ctx, asset, input.operations, output);
    } catch (err) {
      error = err instanceof HttpError ? { code: err.code, message: err.message } : { code: ErrorCode.VALIDATION_FAILED, message: 'Invalid settings for this image.' };
    }
    const job = await ctx.prisma.processingJob.create({
      data: {
        userId: owner.userId,
        guestId: owner.userId ? null : owner.guestId,
        batchId: batch.id,
        inputAssetId: asset.id,
        type: 'PIPELINE',
        params: { operations: input.operations, output: output ?? input.output ?? {} } as object,
        ...(error ? { status: 'FAILED' as const, errorCode: error.code, errorMessage: error.message, finishedAt: new Date() } : {}),
      },
    });
    if (!error) queued.push(job);
  }
  await refreshBatchStatus(ctx, batch.id);
  await enqueue(ctx, queued);
  return getOwnedBatch(ctx, owner, batch.id);
}

export async function getOwnedJob(ctx: ImagingContext, owner: Owner, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, ErrorCode.NOT_FOUND, 'Job not found.');
  const job = await ctx.prisma.processingJob.findFirst({ where: { id, ...ownerWhere(owner) }, include: jobInclude });
  if (!job) throw new HttpError(404, ErrorCode.NOT_FOUND, 'Job not found.');
  return job;
}

export async function listOwnedJobs(ctx: ImagingContext, owner: Owner) {
  return ctx.prisma.processingJob.findMany({
    where: ownerWhere(owner),
    include: jobInclude,
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
}

export async function cancelJob(ctx: ImagingContext, owner: Owner, id: string) {
  const job = await getOwnedJob(ctx, owner, id);
  const { count } = await ctx.prisma.processingJob.updateMany({
    where: { id: job.id, status: 'QUEUED' },
    data: { status: 'CANCELED', finishedAt: new Date() },
  });
  if (count === 0) {
    throw new HttpError(409, ErrorCode.CONFLICT, job.status === 'PROCESSING' ? 'This image is already being processed and can no longer be cancelled.' : `Job is already ${job.status.toLowerCase()}.`);
  }
  if (job.batchId) await refreshBatchStatus(ctx, job.batchId);
  return getOwnedJob(ctx, owner, id);
}

export async function retryJob(ctx: ImagingContext, owner: Owner, id: string) {
  const job = await getOwnedJob(ctx, owner, id);
  if (job.status !== 'FAILED' && job.status !== 'CANCELED') {
    throw new HttpError(409, ErrorCode.CONFLICT, 'Only failed or cancelled jobs can be retried.');
  }
  // Re-validate: the job may have failed validation originally.
  const asset = await getOwnedAsset(ctx, owner, job.inputAssetId);
  const parsed = jobParamsSchema.safeParse(job.params);
  if (!parsed.success) throw new HttpError(422, ErrorCode.VALIDATION_FAILED, 'This job cannot be retried with its current settings.');
  validatePlan(ctx, asset, parsed.data.operations as Operation[], parsed.data.output);
  await enforceQuota(ctx, owner, 1);

  const updated = await ctx.prisma.processingJob.update({
    where: { id: job.id },
    data: { status: 'QUEUED', progress: 0, errorCode: null, errorMessage: null, startedAt: null, finishedAt: null },
  });
  await enqueue(ctx, [updated]);
  if (job.batchId) await refreshBatchStatus(ctx, job.batchId);
  return getOwnedJob(ctx, owner, id);
}

export async function getOwnedBatch(ctx: ImagingContext, owner: Owner, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, ErrorCode.NOT_FOUND, 'Batch not found.');
  const batch = await ctx.prisma.processingBatch.findFirst({ where: { id, ...ownerWhere(owner) } });
  if (!batch) throw new HttpError(404, ErrorCode.NOT_FOUND, 'Batch not found.');
  const jobs = await ctx.prisma.processingJob.findMany({ where: { batchId: id }, include: jobInclude, orderBy: { createdAt: 'asc' } });
  return { batch, jobs };
}

/** Recompute a batch's overall status from its jobs. */
export async function refreshBatchStatus(ctx: ImagingContext, batchId: string): Promise<void> {
  const groups = await ctx.prisma.processingJob.groupBy({ by: ['status'], where: { batchId }, _count: { _all: true } });
  const n = (s: string) => groups.find((g) => g.status === s)?._count._all ?? 0;
  const active = n('QUEUED') + n('PROCESSING');
  const ok = n('SUCCEEDED');
  const total = groups.reduce((s, g) => s + g._count._all, 0);
  const status =
    active > 0 ? 'PROCESSING' :
    ok === total ? 'COMPLETED' :
    ok === 0 ? (n('CANCELED') === total ? 'CANCELED' : 'FAILED') :
    'PARTIAL';
  await ctx.prisma.processingBatch.update({ where: { id: batchId }, data: { status } });
}
