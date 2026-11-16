import sharp from 'sharp';
import type { HealthResponse } from '@app/shared';
import { OUTPUT_FORMATS } from '@app/image-core';

export type DatabaseCheck = () => Promise<void>;

const startedAt = Date.now();

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e: unknown) => { clearTimeout(timer); reject(e instanceof Error ? e : new Error(String(e))); },
    );
  });
}

async function checkDatabase(check: DatabaseCheck): Promise<HealthResponse['checks']['database']> {
  const t0 = performance.now();
  try {
    await withTimeout(check(), 3000);
    return { status: 'up', latencyMs: Math.round(performance.now() - t0) };
  } catch {
    // Do not leak connection strings or driver errors to the client.
    return { status: 'down', message: 'Database is unreachable.' };
  }
}

function checkImageEngine(): HealthResponse['checks']['imageEngine'] {
  try {
    const formats: Record<string, { input: boolean; output: boolean }> = {};
    const sharpFormats = sharp.format as unknown as Record<string, { input: { buffer: boolean }; output: { buffer: boolean } }>;
    for (const f of OUTPUT_FORMATS) {
      // libvips registers AVIF under the HEIF loader/saver.
      const info = sharpFormats[f === 'avif' ? 'heif' : f];
      formats[f] = { input: Boolean(info?.input.buffer), output: Boolean(info?.output.buffer) };
    }
    return {
      status: 'up',
      sharpVersion: sharp.versions.sharp,
      libvipsVersion: sharp.versions.vips,
      formats,
    };
  } catch {
    return { status: 'down', message: 'Image engine failed to load.' };
  }
}

export async function getHealth(dbCheck: DatabaseCheck, version: string): Promise<HealthResponse> {
  const database = await checkDatabase(dbCheck);
  const imageEngine = checkImageEngine();
  return {
    status: database.status === 'up' && imageEngine.status === 'up' ? 'ok' : 'degraded',
    version,
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    timestamp: new Date().toISOString(),
    checks: { database, imageEngine },
  };
}
