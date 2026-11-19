import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { Logger } from 'pino';
import { ErrorCode } from '@app/shared';
import type { Env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { identity } from './middleware/identity';
import { originCheck } from './middleware/origin-check';
import { healthRoutes } from './routes/health.routes';
import { imageRoutes } from './routes/images.routes';
import { fileRoutes } from './routes/files.routes';
import { batchRoutes, jobRoutes } from './routes/jobs.routes';
import { metaRoutes } from './routes/meta.routes';
import type { ImagingContext } from './services/context';
import type { DatabaseCheck } from './services/health.service';
import { runCleanup } from './workers/cleanup.worker';

export interface AppDeps {
  env: Pick<Env, 'WEB_ORIGIN' | 'RATE_LIMIT_PER_MINUTE' | 'TRUST_PROXY'>;
  logger: Logger;
  dbCheck: DatabaseCheck;
  version: string;
  /** Image features. Omitted in tests that only exercise the HTTP basics. */
  imaging?: {
    ctx: ImagingContext;
    cookieSecret: string;
    secureCookies: boolean;
    /** Enables GET /api/cron/cleanup, authorised with "Authorization: Bearer <secret>" (Vercel Cron). */
    cronSecret?: string;
  };
}

/**
 * Build the Express app. Dependencies are injected so tests can run the real
 * app against a test database.
 */
export function createApp({ env, logger, dbCheck, version, imaging }: AppDeps): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const incoming = req.headers['x-request-id'];
        const id = typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
      autoLogging: { ignore: (req) => req.url?.startsWith('/api/health') ?? false },
    }),
  );

  // The API only serves JSON and files, never HTML, so a strict CSP is safe.
  app.use(
    helmet({
      contentSecurityPolicy: { useDefaults: false, directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      // Images are displayed by the web app, which is a different origin on the same site.
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );

  app.use(
    cors({
      origin: env.WEB_ORIGIN,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      exposedHeaders: ['X-Request-Id', 'Content-Disposition'],
      maxAge: 600,
    }),
  );

  app.use(
    '/api',
    rateLimit({
      windowMs: 60_000,
      limit: env.RATE_LIMIT_PER_MINUTE,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      skip: (req) => req.path.startsWith('/health'),
      handler: (req, res) => {
        res.status(429).json({
          error: { code: ErrorCode.RATE_LIMITED, message: 'Too many requests. Please wait a moment and try again.', requestId: String(req.id) },
        });
      },
    }),
  );

  app.use('/api', originCheck(env.WEB_ORIGIN));

  // JSON bodies are small control messages; images are uploaded via streaming multipart.
  app.use(express.json({ limit: '100kb' }));

  app.use('/api/health', healthRoutes(dbCheck, version));

  const cronSecret = imaging?.cronSecret;
  if (imaging && cronSecret) {
    const digest = (v: string) => createHash('sha256').update(v).digest();
    const expected = digest(`Bearer ${cronSecret}`);
    app.get('/api/cron/cleanup', async (req, res) => {
      if (!timingSafeEqual(digest(req.get('authorization') ?? ''), expected)) {
        res.status(401).json({ error: { code: ErrorCode.UNAUTHENTICATED, message: 'Not authorised.', requestId: String(req.id) } });
        return;
      }
      res.set('Cache-Control', 'no-store').json({ ok: true, removed: await runCleanup(imaging.ctx) });
    });
  }

  if (imaging) {
    const { ctx } = imaging;
    app.use('/api', cookieParser(imaging.cookieSecret));
    const who = identity({ secureCookies: imaging.secureCookies });
    app.use('/api', metaRoutes(ctx));
    // Signed download links: authorised by the signature, not the visitor cookie.
    app.use('/api/files', fileRoutes(ctx));
    app.use('/api/images', who, imageRoutes(ctx));
    app.use('/api/jobs', who, jobRoutes(ctx));
    app.use('/api/batches', who, batchRoutes(ctx));
  }

  // Friendly answer for people who open the API address in a browser.
  app.get('/', (_req, res) => {
    res.json({
      service: 'Image processing API',
      version,
      message: `This is the API server. Open the website at ${env.WEB_ORIGIN[0]}`,
      website: env.WEB_ORIGIN[0],
      health: '/api/health',
    });
  });

  app.use('/api', notFoundHandler);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
