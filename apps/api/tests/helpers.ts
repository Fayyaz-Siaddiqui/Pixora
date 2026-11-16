import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pino } from 'pino';
import sharp from 'sharp';
import request from 'supertest';
import { inject } from 'vitest';
import { createApp } from '../src/app';
import { createImagingContext, startWorkers, stopImagingContext } from '../src/bootstrap';
import { parseEnv } from '../src/config/env';
import type { ImagingContext } from '../src/services/context';

export const WEB_ORIGIN = 'http://localhost:3000';

/** Real app + real database + real queue worker + temp storage. */
export async function createTestApp(overrides: Record<string, string> = {}) {
  const storageDir = mkdtempSync(path.join(tmpdir(), 'imgapp-storage-'));
  const env = parseEnv({
    NODE_ENV: 'test',
    DATABASE_URL: inject('databaseUrl'),
    COOKIE_SECRET: 'test-secret-test-secret-test-secret-123',
    WEB_ORIGIN,
    STORAGE_LOCAL_DIR: storageDir,
    UPLOAD_MAX_MB: '2',
    MAX_INPUT_MEGAPIXELS: '4',
    WORKER_POLL_SECONDS: '0.5',
    GUEST_DAILY_JOB_LIMIT: '1000',
    RATE_LIMIT_PER_MINUTE: '10000',
    ...overrides,
  });
  const logger = pino({ level: 'silent' });
  const ctx = await createImagingContext(env, logger);
  await startWorkers(ctx);
  const app = createApp({
    env,
    logger,
    version: 'test',
    dbCheck: async () => {
      await ctx.prisma.$queryRaw`SELECT 1`;
    },
    imaging: { ctx, cookieSecret: env.COOKIE_SECRET, secureCookies: false },
  });
  return {
    app,
    ctx,
    /** A browser-like client that keeps its own guest cookie. */
    newVisitor: () => request.agent(app),
    close: async () => {
      await stopImagingContext(ctx);
      rmSync(storageDir, { recursive: true, force: true });
    },
  };
}

type Agent = ReturnType<typeof request.agent>;

export async function waitForJob(agent: Agent, jobId: string, timeoutMs = 25_000) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const res = await agent.get(`/api/jobs/${jobId}`);
    if (res.status !== 200) throw new Error(`GET job ${res.status}: ${JSON.stringify(res.body)}`);
    if (['SUCCEEDED', 'FAILED', 'CANCELED'].includes(res.body.job.status)) return res.body.job;
    if (Date.now() > end) throw new Error(`Job ${jobId} still ${res.body.job.status}`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

export async function waitForBatch(agent: Agent, batchId: string, timeoutMs = 40_000) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const res = await agent.get(`/api/batches/${batchId}`);
    if (!['PENDING', 'PROCESSING'].includes(res.body.batch.status)) return res.body.batch;
    if (Date.now() > end) throw new Error(`Batch ${batchId} still ${res.body.batch.status}`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

/** Download a result as a Buffer. */
export async function download(agent: Agent, url: string): Promise<{ status: number; body: Buffer; headers: Record<string, string> }> {
  const res = await agent
    .get(url)
    .buffer(true)
    .parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
  return { status: res.status, body: res.body as Buffer, headers: res.headers as Record<string, string> };
}

// ───────────── Fixtures (generated, so tests need no binary files) ─────────────

/** Photo-like noisy RGB image (noise makes compression results realistic). */
export async function noisyJpeg(width: number, height: number, quality = 92): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 3);
  for (let i = 0; i < raw.length; i += 3) {
    const x = (i / 3) % width;
    raw[i] = (x * 255) / width + Math.random() * 40;
    raw[i + 1] = 120 + Math.random() * 60;
    raw[i + 2] = 200 - Math.random() * 80;
  }
  return sharp(raw, { raw: { width, height, channels: 3 } }).jpeg({ quality }).toBuffer();
}

/** 300x200 stored pixels with EXIF orientation 6 (displays as 200x300), camera fields and a GPS tag. */
export async function exifRotatedJpeg(): Promise<Buffer> {
  const base = await noisyJpeg(300, 200);
  return sharp(base)
    .withExif({
      IFD0: { Make: 'TestCam', Model: 'X100', Copyright: 'Test Author' },
      IFD3: { GPSLatitudeRef: 'N', GPSLongitudeRef: 'E' },
    })
    .withMetadata({ orientation: 6 })
    .jpeg({ quality: 90 })
    .toBuffer();
}

/** 200x200 RGBA with a transparent background and an opaque red square. */
export async function transparentPng(): Promise<Buffer> {
  return sharp({ create: { width: 200, height: 200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: { create: { width: 100, height: 100, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } }, left: 50, top: 50 }])
    .png()
    .toBuffer();
}

export async function solidPng(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#3366cc' } }).png().toBuffer();
}
