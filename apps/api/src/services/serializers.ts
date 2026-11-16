import type { ImageAsset, ProcessingBatch, ProcessingJob, ProcessingResult } from '@app/db';

/** Public shape of an image. Never includes storage keys or file paths. */
export function serializeAsset(a: ImageAsset) {
  return {
    id: a.id,
    kind: a.kind,
    name: a.originalName,
    format: a.format,
    width: a.width,
    height: a.height,
    hasAlpha: a.hasAlpha,
    sizeBytes: Number(a.sizeBytes),
    parentId: a.parentAssetId,
    createdAt: a.createdAt.toISOString(),
    expiresAt: a.expiresAt?.toISOString() ?? null,
    urls: {
      file: `/api/images/${a.id}/file`,
      download: `/api/images/${a.id}/file?download=1`,
      thumbnail: `/api/images/${a.id}/thumbnail`,
    },
  };
}

export type SerializedAsset = ReturnType<typeof serializeAsset>;

type JobWithRelations = ProcessingJob & {
  inputAsset?: ImageAsset | null;
  result?: (ProcessingResult & { outputAsset: ImageAsset }) | null;
};

export function serializeJob(j: JobWithRelations) {
  const inputSize = j.inputAsset ? Number(j.inputAsset.sizeBytes) : null;
  const outputSize = j.result ? Number(j.result.sizeBytes) : null;
  return {
    id: j.id,
    type: j.type,
    status: j.status,
    progress: j.progress,
    batchId: j.batchId,
    inputAssetId: j.inputAssetId,
    error: j.errorCode ? { code: j.errorCode, message: j.errorMessage ?? 'Processing failed.' } : null,
    createdAt: j.createdAt.toISOString(),
    startedAt: j.startedAt?.toISOString() ?? null,
    finishedAt: j.finishedAt?.toISOString() ?? null,
    result:
      j.result && !j.result.outputAsset.deletedAt
        ? {
            asset: serializeAsset(j.result.outputAsset),
            width: j.result.width,
            height: j.result.height,
            format: j.result.format,
            sizeBytes: outputSize,
            originalSizeBytes: inputSize,
            // Positive = smaller than the original.
            savedPercent:
              inputSize && outputSize !== null ? Math.round((1 - outputSize / inputSize) * 1000) / 10 : null,
            durationMs: j.result.durationMs,
            details: j.result.details,
          }
        : null,
  };
}

export function serializeBatch(b: ProcessingBatch, jobs: JobWithRelations[]) {
  const counts = { queued: 0, processing: 0, succeeded: 0, failed: 0, canceled: 0 };
  for (const j of jobs) {
    const key = j.status.toLowerCase() as keyof typeof counts;
    counts[key]++;
  }
  return {
    id: b.id,
    status: b.status,
    totalCount: b.totalCount,
    counts,
    createdAt: b.createdAt.toISOString(),
    downloadUrl: `/api/batches/${b.id}/download`,
    jobs: jobs.map(serializeJob),
  };
}
