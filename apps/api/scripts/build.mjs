// Production build: bundles the API and the internal @app/* workspace
// packages (which ship TypeScript source) into dist/. Real npm dependencies
// stay external and are loaded from node_modules at runtime; sharp in
// particular must never be bundled because it uses native binaries.
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const readDeps = (path) =>
  Object.keys(JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8').replace(/^﻿/, '')).dependencies ?? {});

const external = [
  ...readDeps('../package.json'),
  ...readDeps('../../../packages/db/package.json'),
  ...readDeps('../../../packages/shared/package.json'),
].filter((name) => !name.startsWith('@app/'));

await build({
  entryPoints: ['src/server.ts', 'src/worker.ts'],
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  external: [...new Set(external), '@prisma/client/*'],
  // Allow bundled ESM code to use require() for any CommonJS dependency.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'info',
});
