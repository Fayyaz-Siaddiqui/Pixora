import type { FormatInfo, OutputFormat, SizePreset } from '@app/image-core';
import type { Operation, OutputOptions } from '@app/shared';

/** Shapes returned by the API (see apps/api/src/services/serializers.ts). */

export interface Asset {
  id: string;
  kind: 'ORIGINAL' | 'RESULT' | 'THUMBNAIL';
  name: string;
  format: string;
  width: number;
  height: number;
  hasAlpha: boolean;
  sizeBytes: number;
  parentId: string | null;
  createdAt: string;
  expiresAt: string | null;
  urls: { file: string; download: string; thumbnail: string };
  extensionMismatch?: boolean;
  pages?: number;
}

export type JobStatus = 'QUEUED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED';

export interface Job {
  id: string;
  type: string;
  status: JobStatus;
  progress: number;
  batchId: string | null;
  inputAssetId: string;
  error: { code: string; message: string } | null;
  createdAt: string;
  finishedAt: string | null;
  result: {
    asset: Asset;
    width: number;
    height: number;
    format: OutputFormat;
    sizeBytes: number;
    originalSizeBytes: number | null;
    savedPercent: number | null;
    durationMs: number;
    details: {
      preset: string;
      quality: number | null;
      lossless: boolean;
      targetSizeKB: number | null;
      targetMet: boolean | null;
      flattenedTransparency: boolean;
      metadataKept: boolean;
    } | null;
  } | null;
}

export interface Batch {
  id: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'PARTIAL' | 'FAILED' | 'CANCELED';
  totalCount: number;
  counts: { queued: number; processing: number; succeeded: number; failed: number; canceled: number };
  downloadUrl: string;
  jobs: Job[];
}

export interface UploadRejection {
  name: string;
  code: string;
  message: string;
}

export interface PublicConfig {
  limits: {
    uploadMaxBytes: number;
    uploadMaxFiles: number;
    maxInputPixels: number;
    maxOutputPixels: number;
    maxOutputDimension: number;
    batchMaxFiles: number;
    maxOperations: number;
    dailyJobLimit: number;
    retentionHours: number;
  };
  inputFormats: string[];
  outputFormats: FormatInfo[];
  resampling: string[];
  sizePresets: SizePreset[];
  /** directUploads: files go from the browser straight to cloud storage (Vercel Blob). */
  features: { aiUpscale: boolean; directUploads?: boolean };
}

export interface MetadataReport {
  id: string;
  name: string;
  sizeBytes: number;
  format: string | undefined;
  width: number;
  height: number;
  displayWidth: number;
  displayHeight: number;
  orientation: number | null;
  channels: number | undefined;
  hasAlpha: boolean;
  colorSpace: string | undefined;
  bitDepth: string | undefined;
  density: number | null;
  isProgressive: boolean;
  hasIccProfile: boolean;
  pages: number;
  exif: Record<string, unknown> | null;
  containsGpsLocation: boolean;
}

/** Output options as the UI builds them; `format` undefined = keep the source format. */
export type OutputDraft = Partial<Omit<OutputOptions, 'format'>> & { format?: OutputFormat };

export type { Operation };
