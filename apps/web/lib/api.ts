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
function upload(files: File[], onProgress?: (fraction: number) => void, signal?: AbortSignal): Promise<UploadResult> {
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

export const api = {
  config: () => request<PublicConfig>('/api/config'),
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
