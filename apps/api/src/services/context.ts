import type { PrismaClient } from '@app/db';
import type { PgBoss } from 'pg-boss';
import type { Logger } from 'pino';
import type { ImagingConfig } from '../config/env';
import type { JobRunner } from '../queues/runner';
import type { StorageDriver } from '../storage/storage';

/** Everything the image services and worker need, created once per process. */
export interface ImagingContext {
  prisma: PrismaClient;
  storage: StorageDriver;
  /** Only in queue mode (long-running servers). */
  boss: PgBoss | null;
  runner: JobRunner;
  config: ImagingConfig;
  logger: Logger;
}

export function storageKey(prefix: 'originals' | 'thumbs' | 'results', id: string, ext: string): string {
  const d = new Date();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${prefix}/${d.getUTCFullYear()}/${mm}/${id}.${ext}`;
}

/** Strip paths, control characters and dangerous characters from a user-supplied file name. */
export function safeFileName(name: string, fallback = 'image'): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '').replace(/\s+/g, ' ').trim().slice(0, 180);
  return cleaned && cleaned !== '.' && cleaned !== '..' ? cleaned : fallback;
}

export function stripExtension(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) : name;
}
