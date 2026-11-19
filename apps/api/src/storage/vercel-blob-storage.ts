import { mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { BlobNotFoundError, del, get, head, list, put } from '@vercel/blob';
import { StorageError, type StorageDriver } from './storage';

const KEY_PATTERN = /^[a-z0-9][a-z0-9/_.-]{0,250}$/i;

function checkKey(key: string): string {
  if (!KEY_PATTERN.test(key) || key.includes('..') || key.includes('//')) throw new StorageError('Invalid storage key.');
  return key;
}

/**
 * Private Vercel Blob store. Every object is written with `access: 'private'`,
 * so files are only reachable through the API's authorised routes, exactly
 * like the local driver. Browsers upload originals straight to the store
 * (see the upload-token route), which avoids the 4.5 MB function body limit.
 */
export class VercelBlobStorage implements StorageDriver {
  readonly provider = 'VERCEL_BLOB' as const;
  readonly bucket = 'vercel-blob';
  readonly directUploads = true;
  /** Serverless functions may only write to the OS temp directory. */
  readonly tempDir = path.join(tmpdir(), 'pixora-uploads');

  /** Also signs browser upload tokens (see the upload-token route). */
  constructor(readonly token: string) {}

  async init(): Promise<void> {
    await mkdir(this.tempDir, { recursive: true });
  }

  async putFile(key: string, sourcePath: string, contentType: string): Promise<void> {
    const data = await readFile(sourcePath).catch((err: unknown) => {
      throw new StorageError('Could not read the uploaded file.', { cause: err });
    });
    await this.putBuffer(key, data, contentType);
    await rm(sourcePath, { force: true });
  }

  async putBuffer(key: string, data: Buffer, contentType: string): Promise<void> {
    try {
      await put(checkKey(key), data, {
        access: 'private',
        token: this.token,
        contentType,
        addRandomSuffix: false,
        // Keys are unique (random UUIDs); overwriting is only possible on an internal retry.
        allowOverwrite: true,
      });
    } catch (err) {
      throw new StorageError('Could not save the file.', { cause: err });
    }
  }

  private async open(key: string) {
    let result;
    try {
      result = await get(checkKey(key), { access: 'private', token: this.token });
    } catch (err) {
      throw new StorageError('Could not read the file.', { cause: err });
    }
    if (!result || result.statusCode !== 200) throw new StorageError('File not found in storage.');
    return result;
  }

  async getBuffer(key: string): Promise<Buffer> {
    const { stream } = await this.open(key);
    try {
      return Buffer.from(await new Response(stream).arrayBuffer());
    } catch (err) {
      throw new StorageError('Could not read the file.', { cause: err });
    }
  }

  async createReadStream(key: string): Promise<Readable> {
    const { stream } = await this.open(key);
    return Readable.fromWeb(stream as unknown as WebReadableStream<Uint8Array>);
  }

  async delete(key: string): Promise<void> {
    await del(checkKey(key), { token: this.token });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await head(checkKey(key), { token: this.token });
      return true;
    } catch (err) {
      if (err instanceof BlobNotFoundError) return false;
      throw new StorageError('Could not check the file.', { cause: err });
    }
  }

  async size(key: string): Promise<number | null> {
    try {
      return (await head(checkKey(key), { token: this.token })).size;
    } catch (err) {
      if (err instanceof BlobNotFoundError) return null;
      throw new StorageError('Could not check the file.', { cause: err });
    }
  }

  async listOlderThan(prefix: string, before: Date): Promise<string[]> {
    const keys: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({ prefix, cursor, limit: 1000, token: this.token });
      for (const b of page.blobs) if (b.uploadedAt < before) keys.push(b.pathname);
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return keys;
  }
}
