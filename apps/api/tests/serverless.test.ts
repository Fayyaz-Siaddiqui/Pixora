/**
 * Serverless mode (Vercel): jobs run inline in the request lifecycle, the
 * browser uploads straight to storage and registers the file, and a cron
 * endpoint runs the cleanup. Uses the real app, database and storage.
 */
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ownerUploadPrefix } from '../src/services/upload.service';
import { runCleanup } from '../src/workers/cleanup.worker';
import { createTestApp, download, noisyJpeg, waitForBatch, waitForJob, WEB_ORIGIN } from './helpers';

const CRON_SECRET = 'cron-secret-for-tests-1234';
let t: Awaited<ReturnType<typeof createTestApp>>;

beforeAll(async () => {
  t = await createTestApp({ JOB_RUNNER: 'inline', CRON_SECRET });
  // The local driver doesn't do direct uploads by default; enable the flow so the
  // registration logic runs against real storage (the Blob driver only adds the transport).
  Object.defineProperty(t.ctx.storage, 'directUploads', { value: true });
});
afterAll(async () => {
  await t?.close();
});

async function uploadOne(agent: ReturnType<typeof t.newVisitor>, name: string, data: Buffer) {
  const res = await agent.post('/api/images/upload').set('Origin', WEB_ORIGIN).attach('files', data, name);
  expect(res.status).toBe(201);
  return res.body.uploaded[0] as { id: string };
}

describe('inline job runner', () => {
  it('uses no queue and processes jobs without a worker', async () => {
    expect(t.ctx.runner.mode).toBe('inline');
    expect(t.ctx.boss).toBeNull();
    const v = t.newVisitor();
    const img = await uploadOne(v, 'a.jpg', await noisyJpeg(800, 600));
    const res = await v.post('/api/images/resize').set('Origin', WEB_ORIGIN).send({ assetId: img.id, options: { width: 400 } });
    expect(res.status).toBe(202);
    const job = await waitForJob(v, res.body.job.id);
    expect(job.status).toBe('SUCCEEDED');
    expect([job.result.width, job.result.height]).toEqual([400, 300]);
    const file = await download(v, job.result.asset.urls.download);
    expect((await sharp(file.body).metadata()).width).toBe(400);
  });

  it('runs a batch', async () => {
    const v = t.newVisitor();
    const a = await uploadOne(v, 'a.jpg', await noisyJpeg(300, 200));
    const b = await uploadOne(v, 'b.jpg', await noisyJpeg(200, 300));
    const res = await v.post('/api/images/batch').set('Origin', WEB_ORIGIN).send({ assetIds: [a.id, b.id], operations: [{ type: 'resize', width: 100 }] });
    expect(res.status).toBe(202);
    const batch = await waitForBatch(v, res.body.batch.id);
    expect(batch.status).toBe('COMPLETED');
  });

  it('a status poll re-dispatches a job that nobody picked up (crashed function)', async () => {
    const v = t.newVisitor();
    const img = await uploadOne(v, 'stuck.jpg', await noisyJpeg(300, 200));
    // Simulate a job created by an invocation that died before processing it.
    const owner = await t.ctx.prisma.imageAsset.findUniqueOrThrow({ where: { id: img.id } });
    const job = await t.ctx.prisma.processingJob.create({
      data: {
        guestId: owner.guestId,
        inputAssetId: img.id,
        type: 'RESIZE',
        params: { operations: [{ type: 'resize', width: 150, fit: 'inside', kernel: 'lanczos3', position: 'centre', withoutEnlargement: false }], output: { format: 'jpeg', quality: 82, lossless: false, keepMetadata: false, background: '#ffffff' } },
      },
    });
    await t.ctx.prisma.processingJob.update({ where: { id: job.id }, data: { updatedAt: new Date(Date.now() - 60_000) } });
    const done = await waitForJob(v, job.id);
    expect(done.status).toBe('SUCCEEDED');
    expect(done.result.width).toBe(150);
  });
});

describe('direct uploads', () => {
  it('gives each visitor its own upload folder', async () => {
    const a = t.newVisitor();
    const b = t.newVisitor();
    const ra = await a.get('/api/images/direct-upload');
    const rb = await b.get('/api/images/direct-upload');
    expect(ra.status).toBe(200);
    expect(ra.body.prefix).toMatch(/^incoming\/[\w-]{24}\/$/);
    expect(rb.body.prefix).not.toBe(ra.body.prefix);
    expect(ra.body.tokenUrl).toBe('/api/images/upload-token');
    // A visitor's folder never changes.
    expect((await a.get('/api/images/direct-upload')).body.prefix).toBe(ra.body.prefix);
  });

  it('registers a file uploaded into the visitor folder, validating it like a normal upload', async () => {
    const v = t.newVisitor();
    const { prefix } = (await v.get('/api/images/direct-upload')).body;
    const key = `${prefix}${randomUUID()}`;
    await t.ctx.storage.putBuffer(key, await noisyJpeg(640, 480), 'image/jpeg');

    const res = await v.post('/api/images/register').set('Origin', WEB_ORIGIN).send({ files: [{ key, name: 'holiday.jpg' }] });
    expect(res.status).toBe(201);
    const [asset] = res.body.uploaded;
    expect(asset).toMatchObject({ name: 'holiday.jpg', format: 'jpeg', width: 640, height: 480 });
    expect((await v.get(`/api/images/${asset.id}/thumbnail`)).status).toBe(200);

    // The same file can't be registered twice.
    const again = await v.post('/api/images/register').set('Origin', WEB_ORIGIN).send({ files: [{ key, name: 'holiday.jpg' }] });
    expect(again.status).toBe(422);
    expect(again.body.rejected[0].code).toBe('CONFLICT');
  });

  it("refuses another visitor's upload and paths outside the visitor folder", async () => {
    const owner = t.newVisitor();
    const thief = t.newVisitor();
    const { prefix } = (await owner.get('/api/images/direct-upload')).body;
    const key = `${prefix}${randomUUID()}`;
    await t.ctx.storage.putBuffer(key, await noisyJpeg(100, 100), 'image/jpeg');

    const stolen = await thief.post('/api/images/register').set('Origin', WEB_ORIGIN).send({ files: [{ key, name: 'x.jpg' }] });
    expect(stolen.status).toBe(422);
    expect(stolen.body.rejected[0].code).toBe('FORBIDDEN');
    expect(await t.ctx.storage.exists(key)).toBe(true); // the owner's file is untouched

    const traversal = await owner.post('/api/images/register').set('Origin', WEB_ORIGIN).send({ files: [{ key: `${prefix}../originals/x`, name: 'x.jpg' }] });
    expect(traversal.body.rejected[0].code).toBe('FORBIDDEN');
  });

  it('rejects and deletes an invalid direct upload', async () => {
    const v = t.newVisitor();
    const { prefix } = (await v.get('/api/images/direct-upload')).body;
    const key = `${prefix}${randomUUID()}`;
    await t.ctx.storage.putBuffer(key, Buffer.from('not an image at all'), 'image/jpeg');
    const res = await v.post('/api/images/register').set('Origin', WEB_ORIGIN).send({ files: [{ key, name: 'fake.jpg' }] });
    expect(res.status).toBe(422);
    expect(res.body.rejected[0].code).toBe('UNSUPPORTED_FORMAT');
    expect(await t.ctx.storage.exists(key)).toBe(false);
  });

  it('cleanup removes direct uploads that were never registered', async () => {
    const v = t.newVisitor();
    const { prefix } = (await v.get('/api/images/direct-upload')).body;
    const orphan = `${prefix}${randomUUID()}`;
    await t.ctx.storage.putBuffer(orphan, await noisyJpeg(50, 50), 'image/jpeg');
    const storage = t.ctx.storage;
    const original = storage.listOlderThan;
    // Pretend the orphan is old (the local driver has no listing of its own).
    (storage as { listOlderThan?: typeof original }).listOlderThan = async (p) => (orphan.startsWith(p) ? [orphan] : []);
    try {
      const removed = await runCleanup(t.ctx);
      expect(removed.unregistered).toBe(1);
      expect(await storage.exists(orphan)).toBe(false);
    } finally {
      (storage as { listOlderThan?: typeof original }).listOlderThan = original;
    }
  });

  it('owner folders are derived from the identity, not random', () => {
    const owner = { userId: null, guestId: 'g'.repeat(32) };
    expect(ownerUploadPrefix(t.ctx, owner)).toBe(ownerUploadPrefix(t.ctx, { ...owner }));
    expect(ownerUploadPrefix(t.ctx, owner)).not.toBe(ownerUploadPrefix(t.ctx, { userId: null, guestId: 'h'.repeat(32) }));
  });
});

describe('cron cleanup endpoint', () => {
  it('requires the secret', async () => {
    const anon = t.newVisitor();
    expect((await anon.get('/api/cron/cleanup')).status).toBe(401);
    expect((await anon.get('/api/cron/cleanup').set('Authorization', 'Bearer wrong')).status).toBe(401);
    const ok = await anon.get('/api/cron/cleanup').set('Authorization', `Bearer ${CRON_SECRET}`);
    expect(ok.status).toBe(200);
    expect(ok.body.ok).toBe(true);
  });
});
