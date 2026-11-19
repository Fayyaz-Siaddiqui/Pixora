import { upload as uploadToBlob } from '@vercel/blob/client';
import { apiUrl } from './config';
import type { Asset, Batch, Job, MetadataReport, Operation, OutputDraft, PublicConfig, UploadRejection } from './types';

/** An API failure with a user-readable message. */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const NETWORK_MESSAGE = "Can't reach the server. Check your connection and try again.";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${apiUrl}${path}`, {
      ...init,
      credentials: 'include',
      headers: { ...(init.body && typeof init.body === 'string' ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
    });
  } catch {
    throw new ApiError(NETWORK_MESSAGE, 'NETWORK', 0);
  }
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => null)) as { error?: { code: string; message: string } } | null;
  if (!res.ok) {
    throw new ApiError(body?.error?.message ?? `Request failed (${res.status}).`, body?.error?.code ?? 'UNKNOWN', res.status);
  }
  return body as T;
}

const json = (data: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(data) });

export interface UploadResult {
  uploaded: Asset[];
  rejected: UploadRejection[];
}

/** Upload with progress (fetch cannot report upload progress, XHR can). */
function uploadMultipart(files: File[], onProgress?: (fraction: number) => void, signal?: AbortSignal): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    for (const f of files) form.append('files', f, f.name);
    xhr.open('POST', `${apiUrl}/api/images/upload`);
    xhr.withCredentials = true;
    xhr.responseType = 'json';
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      const body = xhr.response as (UploadResult & { error?: { code: string; message: string } }) | null;
      // 422 = every file rejected; it still carries the per-file reasons.
      if ((xhr.status === 201 || xhr.status === 422) && body?.uploaded) return resolve(body);
      reject(new ApiError(body?.error?.message ?? `Upload failed (${xhr.status}).`, body?.error?.code ?? 'UNKNOWN', xhr.status));
    };
    xhr.onerror = () => reject(new ApiError(NETWORK_MESSAGE, 'NETWORK', 0));
    xhr.onabort = () => reject(new ApiError('Upload cancelled.', 'CANCELED', 0));
    signal?.addEventListener('abort', () => xhr.abort());
    xhr.send(form);
  });
}

let configPromise: Promise<PublicConfig> | null = null;
/** The public config rarely changes; fetch it once per page load. */
function getConfig(): Promise<PublicConfig> {
  configPromise ??= request<PublicConfig>('/api/config').catch((err: unknown) => {
    configPromise = null;
    throw err;
  });
  return configPromise;
}

interface DirectUploadInfo {
  prefix: string;
  tokenUrl: string;
  maxBytes: number;
  maxFiles: number;
}

/** Files at once going straight to storage. */
const DIRECT_CONCURRENCY = 3;

/**
 * Direct upload (serverless hosting): each file goes from the browser
 * straight to the private Blob store, then the API validates and registers
 * it. This avoids the hosting platform's request-size limit. Needs the API
 * on the same origin as the website (proxy mode), so the visitor cookie is sent.
 */
async function uploadDirect(files: File[], onProgress?: (fraction: number) => void, signal?: AbortSignal): Promise<UploadResult> {
  const info = await request<DirectUploadInfo>('/api/images/direct-upload');
  const rejected: UploadRejection[] = [];
  const maxMb = (info.maxBytes / 1024 / 1024).toFixed(0);

  let accepted = files;
  if (files.length > info.maxFiles) {
    accepted = files.slice(0, info.maxFiles);
    rejected.push({ name: '(extra files)', code: 'VALIDATION_FAILED', message: `Only ${info.maxFiles} files can be uploaded at once; the rest were ignored.` });
  }
  const sized = accepted.filter((f) => {
    if (f.size <= info.maxBytes) return true;
    rejected.push({ name: f.name, code: 'PAYLOAD_TOO_LARGE', message: `File is larger than the ${maxMb} MB limit.` });
    return false;
  });

  const loaded = new Map<File, number>();
  const total = sized.reduce((s, f) => s + f.size, 0) || 1;
  const report = () => onProgress?.([...loaded.values()].reduce((s, n) => s + n, 0) / total);

  const done: { key: string; name: string }[] = [];
  let next = 0;
  const lane = async () => {
    while (next < sized.length) {
      const file = sized[next++]!;
      const key = `${info.prefix}${crypto.randomUUID()}`;
      try {
        await uploadToBlob(key, file, {
          access: 'private',
          handleUploadUrl: `${apiUrl}${info.tokenUrl}`,
          contentType: file.type || 'application/octet-stream',
          multipart: file.size > 8 * 1024 * 1024,
          abortSignal: signal,
          onUploadProgress: (e) => {
            loaded.set(file, e.loaded);
            report();
          },
        });
        loaded.set(file, file.size);
        report();
        done.push({ key, name: file.name });
      } catch (err) {
        if (signal?.aborted) throw new ApiError('Upload cancelled.', 'CANCELED', 0);
        rejected.push({ name: file.name, code: 'UPLOAD_FAILED', message: err instanceof Error && err.message ? `Upload failed: ${err.message}` : 'Upload failed. Please try again.' });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(DIRECT_CONCURRENCY, sized.length) }, lane));
  if (done.length === 0) return { uploaded: [], rejected };

  // 422 = every file failed validation; it still carries the per-file reasons.
  let res: Response;
  try {
    res = await fetch(`${apiUrl}/api/images/register`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: done }),
    });
  } catch {
    throw new ApiError(NETWORK_MESSAGE, 'NETWORK', 0);
  }
  const body = (await res.json().catch(() => null)) as (UploadResult & { error?: { code: string; message: string } }) | null;
  if ((res.status === 201 || res.status === 422) && body?.uploaded) return { uploaded: body.uploaded, rejected: [...rejected, ...body.rejected] };
  throw new ApiError(body?.error?.message ?? `Upload failed (${res.status}).`, body?.error?.code ?? 'UNKNOWN', res.status);
}

/** Upload images the way this deployment supports: straight to storage, or through the API. */
async function upload(files: File[], onProgress?: (fraction: number) => void, signal?: AbortSignal): Promise<UploadResult> {
  const config = await getConfig();
  return config.features.directUploads ? uploadDirect(files, onProgress, signal) : uploadMultipart(files, onProgress, signal);
}

export const api = {
  config: getConfig,
  listImages: (kind: 'ORIGINAL' | 'RESULT' = 'ORIGINAL') => request<{ images: Asset[] }>(`/api/images?kind=${kind}`).then((r) => r.images),
  upload,
  deleteImage: (id: string) => request<void>(`/api/images/${id}`, { method: 'DELETE' }),
  metadata: (id: string) => request<{ metadata: MetadataReport }>(`/api/images/${id}/metadata`).then((r) => r.metadata),
  process: (assetId: string, operations: Operation[], output?: OutputDraft) =>
    request<{ job: Job }>('/api/images/process', json({ assetId, operations, output })).then((r) => r.job),
  batch: (assetIds: string[], operations: Operation[], output?: OutputDraft) =>
    request<{ batch: Batch }>('/api/images/batch', json({ assetIds, operations, output })).then((r) => r.batch),
  job: (id: string) => request<{ job: Job }>(`/api/jobs/${id}`).then((r) => r.job),
  getBatch: (id: string) => request<{ batch: Batch }>(`/api/batches/${id}`).then((r) => r.batch),
  cancelJob: (id: string) => request<{ job: Job }>(`/api/jobs/${id}/cancel`, { method: 'POST' }).then((r) => r.job),
  retryJob: (id: string) => request<{ job: Job }>(`/api/jobs/${id}/retry`, { method: 'POST' }).then((r) => r.job),
};

/** Absolute URL for an API file path such as asset.urls.download. */
export const fileUrl = (path: string) => `${apiUrl}${path}`;

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong. Please try again.';
}
