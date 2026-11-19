import { createReadStream } from 'node:fs';
import { copyFile, mkdir, readFile, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { StorageError, type StorageDriver } from './storage';

const KEY_PATTERN = /^[a-z0-9][a-z0-9/_.-]{0,250}$/i;

/** Stores files on the local disk under a single root directory. */
export class LocalStorage implements StorageDriver {
  readonly provider = 'LOCAL' as const;
  readonly bucket = 'local';
  readonly tempDir: string;
  private readonly objectsDir: string;

  constructor(rootDir: string) {
    this.objectsDir = path.resolve(rootDir, 'objects');
    this.tempDir = path.resolve(rootDir, 'tmp');
  }

  async init(): Promise<void> {
    await mkdir(this.objectsDir, { recursive: true });
    await mkdir(this.tempDir, { recursive: true });
  }

  /** Map a key to a path, refusing anything that could escape the root. */
  private pathFor(key: string): string {
    if (!KEY_PATTERN.test(key) || key.includes('..') || key.includes('//')) {
      throw new StorageError('Invalid storage key.');
    }
    const full = path.resolve(this.objectsDir, key);
    if (!full.startsWith(this.objectsDir + path.sep)) throw new StorageError('Invalid storage key.');
    return full;
  }

  async putFile(key: string, sourcePath: string): Promise<void> {
    const dest = this.pathFor(key);
    try {
      await mkdir(path.dirname(dest), { recursive: true });
      // On Windows a just-written file can be briefly locked (e.g. by antivirus
      // scanning it): retry a few times, then fall back to copying.
      for (let attempt = 0; ; attempt++) {
        try {
          await rename(sourcePath, dest);
          return;
        } catch (err) {
          const code = (err as NodeJS.ErrnoException).code;
          if ((code === 'EBUSY' || code === 'EPERM' || code === 'EACCES') && attempt < 4) {
            await new Promise((r) => setTimeout(r, 100 * 2 ** attempt));
            continue;
          }
          if (code !== 'EXDEV' && code !== 'EBUSY' && code !== 'EPERM' && code !== 'EACCES') throw err;
          // Cross-device move, or still locked: copy, then remove the temp file (cleanup retries later if needed).
          await copyFile(sourcePath, dest);
          await unlink(sourcePath).catch(() => {});
          return;
        }
      }
    } catch (err) {
      throw new StorageError('Could not save the file.', { cause: err });
    }
  }

  async putBuffer(key: string, data: Buffer): Promise<void> {
    const dest = this.pathFor(key);
    try {
      await mkdir(path.dirname(dest), { recursive: true });
      await writeFile(dest, data);
    } catch (err) {
      throw new StorageError('Could not save the file.', { cause: err });
    }
  }

  async getBuffer(key: string): Promise<Buffer> {
    try {
      return await readFile(this.pathFor(key));
    } catch (err) {
      throw new StorageError('Could not read the file.', { cause: err });
    }
  }

  async createReadStream(key: string): Promise<Readable> {
    const p = this.pathFor(key);
    try {
      await stat(p);
    } catch (err) {
      throw new StorageError('File not found in storage.', { cause: err });
    }
    return createReadStream(p);
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.pathFor(key));
      return true;
    } catch {
      return false;
    }
  }
}
