import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runCleanup } from '../src/workers/cleanup.worker';
import {
  createTestApp,
  download,
  exifRotatedJpeg,
  noisyJpeg,
  solidPng,
  transparentPng,
  waitForBatch,
  waitForJob,
  WEB_ORIGIN,
} from './helpers';

let t: Awaited<ReturnType<typeof createTestApp>>;
let visitor: ReturnType<Awaited<ReturnType<typeof createTestApp>>['newVisitor']>;
const ids: Record<string, string> = {};

async function upload(files: { name: string; data: Buffer }[], agent = visitor) {
  let req = agent.post('/api/images/upload').set('Origin', WEB_ORIGIN);
  for (const f of files) req = req.attach('files', f.data, f.name);
  return req;
}

async function runTool(tool: string, body: object, agent = visitor) {
  const res = await agent.post(`/api/images/${tool}`).set('Origin', WEB_ORIGIN).send(body);
  if (res.status !== 202) throw new Error(`${tool} -> ${res.status} ${JSON.stringify(res.body)}`);
  return waitForJob(agent, res.body.job.id);
}

async function resultMeta(job: { result: { asset: { urls: { file: string } } } }) {
  const file = await download(visitor, job.result.asset.urls.file);
  expect(file.status).toBe(200);
  return { meta: await sharp(file.body).metadata(), file };
}

beforeAll(async () => {
  t = await createTestApp();
  visitor = t.newVisitor();
  const res = await upload([
    { name: 'landscape.jpg', data: await noisyJpeg(600, 400) },
    { name: 'phone-photo.jpg', data: await exifRotatedJpeg() },
    { name: 'logo.png', data: await transparentPng() },
  ]);
  expect(res.status).toBe(201);
  for (const a of res.body.uploaded) ids[a.name] = a.id;
});

afterAll(async () => {
  await t?.close();
});

describe('upload validation', () => {
  it('stores valid images with display dimensions (EXIF orientation applied)', async () => {
    const res = await visitor.get(`/api/images/${ids['phone-photo.jpg']}`);
    expect(res.body.image).toMatchObject({ width: 200, height: 300, format: 'jpeg', kind: 'ORIGINAL' });
    const logo = await visitor.get(`/api/images/${ids['logo.png']}`);
    expect(logo.body.image.hasAlpha).toBe(true);
    // Internal storage details are never exposed.
    expect(JSON.stringify(res.body)).not.toMatch(/originals\/|storage|key/);
  });

  it('rejects bad files individually with clear reasons', async () => {
    const good = await noisyJpeg(100, 100);
    const res = await upload([
      { name: 'ok.jpg', data: good },
      { name: 'truncated.jpg', data: good.subarray(0, Math.floor(good.length * 0.5)) },
      { name: 'notes.png', data: Buffer.from('this is not an image at all') },
      { name: 'huge-pixels.png', data: await solidPng(2100, 2100) },
      { name: 'too-big.jpg', data: randomBytes(2.5 * 1024 * 1024) },
    ]);
    expect(res.status).toBe(201);
    expect(res.body.uploaded.map((u: { name: string }) => u.name)).toEqual(['ok.jpg']);
    const codes = Object.fromEntries(res.body.rejected.map((r: { name: string; code: string }) => [r.name, r.code]));
    expect(codes).toEqual({
      'truncated.jpg': 'CORRUPT_IMAGE',
      'notes.png': 'UNSUPPORTED_FORMAT',
      'huge-pixels.png': 'IMAGE_TOO_LARGE',
      'too-big.jpg': 'PAYLOAD_TOO_LARGE',
    });
  });

  it('accepts every supported input format (regression: WebP/AVIF/GIF/TIFF uploads failed on Windows)', async () => {
    const base = sharp(await noisyJpeg(640, 480));
    const files = [
      { name: 'photo.webp', data: await base.clone().webp().toBuffer() },
      { name: 'photo.avif', data: await base.clone().avif().toBuffer() },
      { name: 'photo.gif', data: await base.clone().gif().toBuffer() },
      { name: 'photo.tiff', data: await base.clone().tiff().toBuffer() },
      { name: 'photo.png', data: await base.clone().png().toBuffer() },
    ];
    const res = await upload(files);
    expect(res.body.rejected).toEqual([]);
    expect(res.body.uploaded.map((u: { format: string }) => u.format)).toEqual(['webp', 'avif', 'gif', 'tiff', 'png']);
  });

  it('detects the real format regardless of the file extension', async () => {
    const res = await upload([{ name: 'actually-png.jpg', data: await solidPng(50, 50) }]);
    expect(res.body.uploaded[0]).toMatchObject({ format: 'png', extensionMismatch: true });
  });

  it('returns 422 when every file is rejected, and 400 for non-multipart', async () => {
    const res = await upload([{ name: 'x.png', data: Buffer.from('nope') }]);
    expect(res.status).toBe(422);
    const bad = await visitor.post('/api/images/upload').set('Origin', WEB_ORIGIN).send({ hello: 1 });
    expect(bad.status).toBe(400);
  });
});

describe('resize', () => {
  it('resizes by width keeping aspect ratio, with Lanczos3', async () => {
    const job = await runTool('resize', { assetId: ids['landscape.jpg'], options: { width: 300 }, output: { format: 'webp' } });
    expect(job.status).toBe('SUCCEEDED');
    expect(job.result).toMatchObject({ width: 300, height: 200, format: 'webp' });
    const { meta, file } = await resultMeta(job);
    expect(meta).toMatchObject({ format: 'webp', width: 300, height: 200 });
    expect(file.headers['content-type']).toBe('image/webp');
  });

  it('respects EXIF orientation of the original', async () => {
    const job = await runTool('resize', { assetId: ids['phone-photo.jpg'], options: { width: 100 } });
    expect(job.result).toMatchObject({ width: 100, height: 150, format: 'jpeg' });
  });

  it('supports percentage, contain (padding) and cover (crop to fill)', async () => {
    const pct = await runTool('resize', { assetId: ids['landscape.jpg'], options: { percent: 50 } });
    expect(pct.result).toMatchObject({ width: 300, height: 200 });

    const contain = await runTool('resize', {
      assetId: ids['landscape.jpg'],
      options: { width: 500, height: 500, fit: 'contain', background: '#ffffff' },
    });
    expect(contain.result).toMatchObject({ width: 500, height: 500 });

    const cover = await runTool('resize', { assetId: ids['landscape.jpg'], options: { width: 1080, height: 1350, fit: 'cover' } });
    expect(cover.result).toMatchObject({ width: 1080, height: 1350 });
  });

  it('withoutEnlargement keeps a smaller image at its original size', async () => {
    const job = await runTool('resize', { assetId: ids['landscape.jpg'], options: { width: 1200, withoutEnlargement: true } });
    expect(job.result).toMatchObject({ width: 600, height: 400 });
    const enlarged = await runTool('resize', { assetId: ids['landscape.jpg'], options: { width: 1200 } });
    expect(enlarged.result).toMatchObject({ width: 1200, height: 800 });
  });

  it('rejects impossible requests before processing', async () => {
    const res = await visitor
      .post('/api/images/resize')
      .set('Origin', WEB_ORIGIN)
      .send({ assetId: ids['landscape.jpg'], options: { width: 50_000 } });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_DIMENSIONS');

    const bad = await visitor.post('/api/images/resize').set('Origin', WEB_ORIGIN).send({ assetId: ids['landscape.jpg'], options: {} });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_FAILED');
  });
});

describe('convert and compress', () => {
  it('never silently drops transparency', async () => {
    const res = await visitor.post('/api/images/convert').set('Origin', WEB_ORIGIN).send({ assetId: ids['logo.png'], output: { format: 'jpeg' } });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toMatch(/transparency/i);

    const flat = await runTool('convert', { assetId: ids['logo.png'], output: { format: 'jpeg', background: '#ffffff' } });
    const { meta } = await resultMeta(flat);
    expect(meta.format).toBe('jpeg');
    expect(flat.result.details.flattenedTransparency).toBe(true);

    const webp = await runTool('convert', { assetId: ids['logo.png'], output: { format: 'webp' } });
    expect((await resultMeta(webp)).meta.hasAlpha).toBe(true);

    const avif = await runTool('convert', { assetId: ids['logo.png'], output: { format: 'avif' } });
    expect((await resultMeta(avif)).meta.format).toBe('heif');
  });

  it('hits a reachable target size and reports when one is not reachable', async () => {
    const ok = await runTool('compress', { assetId: ids['landscape.jpg'], output: { format: 'jpeg', targetSizeKB: 40 } });
    expect(ok.result.details.targetMet).toBe(true);
    expect(ok.result.sizeBytes).toBeLessThanOrEqual(40 * 1024);
    expect(ok.result.savedPercent).toBeGreaterThan(0);

    const impossible = await runTool('compress', { assetId: ids['landscape.jpg'], output: { format: 'jpeg', targetSizeKB: 1 } });
    expect(impossible.status).toBe('SUCCEEDED');
    expect(impossible.result.details.targetMet).toBe(false);
    expect(impossible.result.details.quality).toBe(30);
  });

  it('refuses a target size for lossless PNG', async () => {
    const res = await visitor.post('/api/images/compress').set('Origin', WEB_ORIGIN).send({ assetId: ids['logo.png'], output: { format: 'png', targetSizeKB: 5 } });
    expect(res.status).toBe(422);
  });

  it('presets trade size for quality', async () => {
    const best = await runTool('compress', { assetId: ids['landscape.jpg'], output: { preset: 'best' } });
    const small = await runTool('compress', { assetId: ids['landscape.jpg'], output: { preset: 'smallest' } });
    expect(small.result.sizeBytes).toBeLessThan(best.result.sizeBytes);
  });
});

describe('crop, rotate, flip and adjustments', () => {
  it('crops, and circle crop makes corners transparent', async () => {
    const job = await runTool('crop', {
      assetId: ids['landscape.jpg'],
      options: { left: 100, top: 50, width: 200, height: 200, circle: true },
      output: { format: 'png' },
    });
    expect(job.result).toMatchObject({ width: 200, height: 200 });
    const file = await download(visitor, job.result.asset.urls.file);
    const { data } = await sharp(file.body).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(data[3]).toBe(0); // top-left corner alpha
    expect(data[(100 * 200 + 100) * 4 + 3]).toBe(255); // centre is opaque
  });

  it('rotates by 90 degrees and flips', async () => {
    const rot = await runTool('rotate', { assetId: ids['landscape.jpg'], options: { angle: 90 } });
    expect(rot.result).toMatchObject({ width: 400, height: 600 });
    const flip = await runTool('flip', { assetId: ids['landscape.jpg'], options: { horizontal: true } });
    expect(flip.status).toBe('SUCCEEDED');
  });

  it('applies operations in the given order', async () => {
    const res = await visitor
      .post('/api/images/process')
      .set('Origin', WEB_ORIGIN)
      .send({
        assetId: ids['landscape.jpg'],
        operations: [
          { type: 'crop', left: 0, top: 0, width: 400, height: 400 },
          { type: 'resize', width: 100 },
          { type: 'rotate', angle: 90 },
        ],
        output: { format: 'png' },
      });
    expect(res.status).toBe(202);
    const job = await waitForJob(visitor, res.body.job.id);
    expect(job.result).toMatchObject({ width: 100, height: 100 });
  });

  it('enhance brightens the image measurably', async () => {
    const up = await upload([{ name: 'grey.png', data: await sharp({ create: { width: 64, height: 64, channels: 3, background: '#808080' } }).png().toBuffer() }]);
    const job = await runTool('enhance', { assetId: up.body.uploaded[0].id, options: { brightness: 50, sharpen: { sigma: 1 } }, output: { format: 'png' } });
    const stats = await sharp((await download(visitor, job.result.asset.urls.file)).body).stats();
    expect(stats.channels[0]!.mean).toBeGreaterThan(150); // source is 128
  });

  it('blur, sharpen and background tools work', async () => {
    expect((await runTool('blur', { assetId: ids['landscape.jpg'], options: { sigma: 4 } })).status).toBe('SUCCEEDED');
    expect((await runTool('sharpen', { assetId: ids['landscape.jpg'], options: {} })).status).toBe('SUCCEEDED');
    const bg = await runTool('background', { assetId: ids['logo.png'], options: { color: '#00ff00' }, output: { format: 'jpeg' } });
    expect(bg.status).toBe('SUCCEEDED');
  });
});

describe('metadata', () => {
  it('strips metadata by default and keeps a safe subset (no GPS) on request', async () => {
    const stripped = await runTool('resize', { assetId: ids['phone-photo.jpg'], options: { width: 80 } });
    expect((await resultMeta(stripped)).meta.exif).toBeUndefined();

    const kept = await runTool('resize', { assetId: ids['phone-photo.jpg'], options: { width: 80 }, output: { keepMetadata: true } });
    const { file } = await resultMeta(kept);
    const report = await visitor.get(`/api/images/${kept.result.asset.id}/metadata`);
    expect(report.body.metadata.exif.Image).toMatchObject({ Make: 'TestCam', Copyright: 'Test Author' });
    expect(report.body.metadata.containsGpsLocation).toBe(false);
    expect(file.body.length).toBeGreaterThan(0);
  });

  it('reports original metadata including GPS presence', async () => {
    const res = await visitor.get(`/api/images/${ids['phone-photo.jpg']}/metadata`);
    expect(res.body.metadata).toMatchObject({ orientation: 6, width: 300, height: 200, displayWidth: 200, displayHeight: 300, containsGpsLocation: true });
  });
});

describe('batch processing', () => {
  it('processes several images and downloads them as one ZIP', async () => {
    const res = await visitor
      .post('/api/images/batch')
      .set('Origin', WEB_ORIGIN)
      .send({
        assetIds: [ids['landscape.jpg'], ids['phone-photo.jpg'], ids['logo.png']],
        operations: [{ type: 'resize', width: 120 }],
        output: { format: 'webp' },
      });
    expect(res.status).toBe(202);
    const batch = await waitForBatch(visitor, res.body.batch.id);
    expect(batch.status).toBe('COMPLETED');
    expect(batch.counts.succeeded).toBe(3);

    const zip = await download(visitor, batch.downloadUrl);
    expect(zip.status).toBe(200);
    expect(zip.headers['content-type']).toBe('application/zip');
    // Count central-directory entries (signature PK\x01\x02).
    const entries = zip.body.toString('latin1').split('PK\x01\x02').length - 1;
    expect(entries).toBe(3);
  });

  it('fails unsuitable images individually instead of the whole batch', async () => {
    const res = await visitor
      .post('/api/images/batch')
      .set('Origin', WEB_ORIGIN)
      .send({ assetIds: [ids['landscape.jpg'], ids['logo.png']], operations: [], output: { format: 'jpeg' } });
    const batch = await waitForBatch(visitor, res.body.batch.id);
    expect(batch.status).toBe('PARTIAL');
    const failed = batch.jobs.find((j: { status: string }) => j.status === 'FAILED');
    expect(failed.error.message).toMatch(/transparency/i);
  });
});

describe('privacy, security and lifecycle', () => {
  it('isolates visitors from each other', async () => {
    const stranger = t.newVisitor();
    expect((await stranger.get(`/api/images/${ids['landscape.jpg']}`)).status).toBe(404);
    expect((await stranger.get(`/api/images/${ids['landscape.jpg']}/file`)).status).toBe(404);
    const steal = await stranger.post('/api/images/resize').set('Origin', WEB_ORIGIN).send({ assetId: ids['landscape.jpg'], options: { width: 10 } });
    expect(steal.status).toBe(404);
    expect((await stranger.get('/api/images')).body.images).toEqual([]);
  });

  it('blocks state-changing requests from foreign origins (CSRF)', async () => {
    const res = await visitor.post('/api/images/resize').set('Origin', 'https://evil.example').send({ assetId: ids['landscape.jpg'], options: { width: 10 } });
    expect(res.status).toBe(403);
  });

  it('downloads with attachment disposition and serves thumbnails', async () => {
    const dl = await download(visitor, `/api/images/${ids['landscape.jpg']}/file?download=1`);
    expect(dl.headers['content-disposition']).toMatch(/^attachment; filename="landscape.jpg"/);
    const thumb = await download(visitor, `/api/images/${ids['landscape.jpg']}/thumbnail`);
    expect(thumb.headers['content-type']).toBe('image/webp');
  });

  it('retry and cancel only apply to suitable jobs', async () => {
    const job = await runTool('resize', { assetId: ids['landscape.jpg'], options: { width: 20 } });
    expect((await visitor.post(`/api/jobs/${job.id}/retry`).set('Origin', WEB_ORIGIN)).status).toBe(409);
    expect((await visitor.post(`/api/jobs/${job.id}/cancel`).set('Origin', WEB_ORIGIN)).status).toBe(409);
  });

  it('deletes images on request and expires old files automatically', async () => {
    const up = await upload([{ name: 'temp.jpg', data: await noisyJpeg(50, 50) }, { name: 'old.jpg', data: await noisyJpeg(50, 50) }]);
    const [temp, old] = up.body.uploaded;
    expect((await visitor.delete(`/api/images/${temp.id}`).set('Origin', WEB_ORIGIN)).status).toBe(204);
    expect((await visitor.get(`/api/images/${temp.id}/file`)).status).toBe(410);

    await t.ctx.prisma.imageAsset.update({ where: { id: old.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const removed = await runCleanup(t.ctx);
    expect(removed.assets).toBeGreaterThanOrEqual(1);
    expect((await visitor.get(`/api/images/${old.id}`)).status).toBe(410);
  });

  it('exposes public config and presets', async () => {
    const cfg = await visitor.get('/api/config');
    expect(cfg.body.limits.uploadMaxBytes).toBe(2 * 1024 * 1024);
    expect(cfg.body.outputFormats.map((f: { id: string }) => f.id)).toEqual(['jpeg', 'png', 'webp', 'avif']);
    const presets = await visitor.get('/api/presets');
    expect(Array.isArray(presets.body.presets)).toBe(true);
  });
});
