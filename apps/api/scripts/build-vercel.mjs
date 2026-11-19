// Builds the API for Vercel using the Build Output API (v3):
//   apps/api/.vercel/output/config.json            routes + cron
//   apps/api/.vercel/output/functions/index.func/  one Node.js function
//
// Why not Vercel's zero-config Express support? Vercel does not bundle the
// app, and our internal @app/* workspace packages ship TypeScript source.
// So we bundle with esbuild ourselves, then trace the real npm dependencies
// (sharp's native binaries, Prisma's query compiler) into the function.
//
// Usage: node scripts/build-vercel.mjs [--migrate]
//   --migrate (automatic on Vercel): apply database migrations and the
//   idempotent seed before building, using DATABASE_URL_UNPOOLED when set.
import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nodeFileTrace } from '@vercel/nft';
import { build } from 'esbuild';

const apiDir = fileURLToPath(new URL('..', import.meta.url));
const repoRoot = path.resolve(apiDir, '../..');
const outputDir = path.join(apiDir, '.vercel', 'output');
const funcDir = path.join(outputDir, 'functions', 'index.func');
const bundleDir = path.join(apiDir, '.vercel-build');
const bundleFile = path.join(bundleDir, 'index.mjs');

const MAX_DURATION_SECONDS = 300; // Vercel Hobby maximum (Fluid compute)
const CLEANUP_CRON = '0 4 * * *'; // Hobby allows one run per day

const log = (msg) => console.log(`[build-vercel] ${msg}`);
const readJson = async (p) => JSON.parse((await readFile(p, 'utf8')).replace(/^﻿/, ''));

// ── 1. Database migrations (on Vercel, or when asked) ──
if (process.argv.includes('--migrate') || process.env.VERCEL === '1') {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set. Connect a Postgres database (e.g. Neon) to this Vercel project.');
  const env = { ...process.env, DATABASE_URL: url };
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  log('applying database migrations...');
  execFileSync(npm, ['run', 'migrate:deploy', '-w', '@app/db'], { cwd: repoRoot, env, stdio: 'inherit', shell: process.platform === 'win32' });
  log('seeding default plans and presets (idempotent)...');
  execFileSync(npm, ['run', 'seed', '-w', '@app/db'], { cwd: repoRoot, env, stdio: 'inherit', shell: process.platform === 'win32' });
}

// ── 2. Bundle our code (incl. @app/* TypeScript packages); npm deps stay external ──
const deps = async (p) => Object.keys((await readJson(path.join(repoRoot, p))).dependencies ?? {});
const external = [
  ...(await deps('apps/api/package.json')),
  ...(await deps('packages/db/package.json')),
  ...(await deps('packages/shared/package.json')),
].filter((n) => !n.startsWith('@app/'));

await rm(bundleDir, { recursive: true, force: true });
await rm(outputDir, { recursive: true, force: true }); // keep .vercel/project.json (CLI link)
log('bundling src/vercel.ts...');
await build({
  entryPoints: [path.join(apiDir, 'src', 'vercel.ts')],
  outfile: bundleFile,
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: 'linked',
  external: [...new Set(external), '@prisma/client/*', '@vercel/blob/*'],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'warning',
});

// ── 3. Trace every runtime file the bundle needs ──
log('tracing dependencies...');
const { fileList, warnings } = await nodeFileTrace([bundleFile], { base: repoRoot });
// Expected: optional pg-native / pino-pretty, Cloudflare-only sockets, and sharp's packages for OTHER platforms.
const expectedWarning = /Failed to resolve dependency "(pg-native|pino-pretty|supports-color|cloudflare:sockets|@img\/)/;
for (const w of warnings) if (!expectedWarning.test(String(w.message))) log(`trace warning: ${w.message}`);

// sharp loads its platform package with a computed require() that tracing can't follow.
const platformTag = `-${process.platform}-${process.arch}`;
const imgDir = path.join(repoRoot, 'node_modules', '@img');
for (const name of await readdir(imgDir).catch(() => [])) {
  if (name.endsWith(platformTag) || name.includes(`${platformTag}`)) {
    if (name.includes('musl')) continue; // Vercel runs glibc Linux
    fileList.add(path.join('node_modules', '@img', name));
  }
}

// ── 4. Assemble the function directory ──
await mkdir(funcDir, { recursive: true });
let copied = 0;
for (const rel of [...fileList].sort()) {
  const src = path.join(repoRoot, rel);
  const s = await stat(src).catch(() => null);
  if (!s) continue;
  await cp(src, path.join(funcDir, rel), { recursive: s.isDirectory(), dereference: true, force: true });
  copied++;
}
log(`copied ${copied} files/folders into the function`);

await writeFile(
  path.join(funcDir, '.vc-config.json'),
  JSON.stringify(
    {
      runtime: 'nodejs22.x',
      handler: path.relative(repoRoot, bundleFile).split(path.sep).join('/'),
      launcherType: 'Nodejs',
      shouldAddHelpers: false,
      supportsResponseStreaming: true,
      maxDuration: MAX_DURATION_SECONDS,
    },
    null,
    2,
  ),
);

// Every path goes to the one function. The original path is also passed as a
// query parameter so the app can restore it however the platform rewrites req.url.
await writeFile(
  path.join(outputDir, 'config.json'),
  JSON.stringify(
    {
      version: 3,
      routes: [{ src: '^/(.*)$', dest: '/index?__pixora_path=/$1' }],
      crons: [{ path: '/api/cron/cleanup', schedule: CLEANUP_CRON }],
    },
    null,
    2,
  ),
);

const size = async (dir) => {
  let total = 0;
  for (const e of await readdir(dir, { withFileTypes: true, recursive: true })) {
    if (e.isFile()) total += (await stat(path.join(e.parentPath, e.name))).size;
  }
  return total;
};
log(`function size: ${((await size(funcDir)) / 1024 / 1024).toFixed(1)} MB (Vercel limit 250 MB)`);
log(`done → ${path.relative(repoRoot, outputDir)}`);
