import type { Readable } from 'node:stream';

/**
 * Storage abstraction. Keys are internal identifiers (e.g.
 * "originals/2026/11/<uuid>.jpg") and are NEVER exposed to clients; the API
 * always serves files through authorised routes.
 *
 * Implementations: LocalStorage (development / single server). An
 * S3-compatible driver (AWS S3, Cloudflare R2, MinIO) is added in the
 * deployment phase behind this same interface.
 */
export interface StorageDriver {
  readonly provider: 'LOCAL' | 'S3';
  readonly bucket: string;
  /** Directory for in-progress uploads (always local disk). */
  readonly tempDir: string;
  /** Move a finished temp file into storage. The temp file is consumed. */
  putFile(key: string, sourcePath: string, contentType: string): Promise<void>;
  putBuffer(key: string, data: Buffer, contentType: string): Promise<void>;
  getBuffer(key: string): Promise<Buffer>;
  createReadStream(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

export class StorageError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'StorageError';
  }
}
