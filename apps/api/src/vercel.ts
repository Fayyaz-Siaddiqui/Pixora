/**
 * Entry point for Vercel Functions (see scripts/build-vercel.mjs).
 *
 * The whole Express app runs as ONE function. There is no app.listen() and
 * no long-running worker: set JOB_RUNNER=inline so images are processed
 * inside the request lifecycle, and STORAGE_DRIVER=vercel-blob so files live
 * in a private Blob store instead of the (temporary) function disk.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from './app';
import { createImagingContext } from './bootstrap';
import { parseEnv } from './config/env';
import { createLogger } from './lib/logger';

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

const VERSION = process.env.npm_package_version ?? '0.1.0';

async function init(): Promise<Handler> {
  const env = parseEnv();
  const logger = createLogger(env);
  if (env.JOB_RUNNER !== 'inline') logger.warn('JOB_RUNNER should be "inline" on Vercel: there is no background worker to consume the queue.');
  if (env.STORAGE_DRIVER === 'local') logger.warn('STORAGE_DRIVER=local on Vercel: files are lost when the function instance stops. Use vercel-blob.');

  const ctx = await createImagingContext(env, logger);
  const prisma = ctx.prisma;
  return createApp({
    env,
    logger,
    version: VERSION,
    dbCheck: async () => {
      await prisma.$queryRaw`SELECT 1`;
    },
    imaging: { ctx, cookieSecret: env.COOKIE_SECRET, secureCookies: env.NODE_ENV === 'production', cronSecret: env.CRON_SECRET },
  }) as unknown as Handler;
}

/**
 * A misconfigured deployment answers every request with a 500. The details
 * (which variable is missing) go to the function logs only.
 */
function configErrorHandler(err: unknown): Handler {
  console.error('API startup failed:', err instanceof Error ? err.message : err);
  return (_req, res) => {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'The API is not configured correctly. See the deployment logs for details.' } }));
  };
}

/**
 * The Build Output config routes every path to this function as
 * `/index?__pixora_path=/<original path>`. Restore the original URL so
 * Express routing works whether or not the platform already did.
 */
export function restoreOriginalUrl(req: IncomingMessage): void {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const original = url.searchParams.get('__pixora_path');
  if (original === null) return;
  url.searchParams.delete('__pixora_path');
  const query = url.searchParams.toString();
  req.url = `${original.startsWith('/') ? original : `/${original}`}${query ? `?${query}` : ''}`;
}

// Created once per function instance and reused by every request it serves.
const app: Handler = await init().catch(configErrorHandler);

export default function handler(req: IncomingMessage, res: ServerResponse): void {
  restoreOriginalUrl(req);
  app(req, res);
}
