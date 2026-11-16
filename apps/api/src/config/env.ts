import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/** Repository root (works from src/config in dev and from dist in production). */
export const repoRoot = (() => {
  const candidates = [
    fileURLToPath(new URL('../../../../', import.meta.url)), // src/config -> repo root
    fileURLToPath(new URL('../../../', import.meta.url)), // dist -> repo root
  ];
  return candidates.find((p) => existsSync(path.join(p, 'package.json')) && existsSync(path.join(p, 'apps'))) ?? process.cwd();
})();

/**
 * Load the shared root `.env` (development). In production, variables come
 * from the host environment and no file is needed.
 */
export function loadRootEnvFile(): void {
  const file = path.join(repoRoot, '.env');
  if (existsSync(file)) process.loadEnvFile(file);
}

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required')
    .refine((v) => /^postgres(ql)?:\/\//.test(v), 'DATABASE_URL must be a postgresql:// URL'),
  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  WEB_ORIGIN: z
    .string()
    .default('http://localhost:3000')
    .transform((v) => v.split(',').map((o) => o.trim()).filter(Boolean))
    .pipe(z.array(z.url()).min(1)),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(300),
  /** Number of reverse proxies in front of the API (for correct client IPs). */
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),

  /** Signs the anonymous-visitor cookie. Generate with: node -e "console.log(crypto.randomBytes(32).toString('hex'))" */
  COOKIE_SECRET: z
    .string()
    .min(32, 'COOKIE_SECRET must be at least 32 characters')
    .refine((v) => !v.startsWith('replace-with'), 'COOKIE_SECRET is still the placeholder from .env.example; generate a random one'),

  // Storage
  STORAGE_DRIVER: z.enum(['local']).default('local'),
  /** Relative paths are resolved from the repository root. */
  STORAGE_LOCAL_DIR: z.string().default('storage'),
  FILE_RETENTION_HOURS: z.coerce.number().min(0.1).max(24 * 365).default(24),

  // Upload and processing limits
  UPLOAD_MAX_MB: z.coerce.number().min(0.01).max(1024).default(25),
  UPLOAD_MAX_FILES: z.coerce.number().int().min(1).max(500).default(20),
  MAX_INPUT_MEGAPIXELS: z.coerce.number().min(0.01).max(1000).default(50),
  MAX_OUTPUT_MEGAPIXELS: z.coerce.number().min(0.01).max(1000).default(100),
  MAX_OUTPUT_DIMENSION: z.coerce.number().int().min(16).max(65_535).default(16_384),
  BATCH_MAX_FILES: z.coerce.number().int().min(1).max(1000).default(50),
  GUEST_DAILY_JOB_LIMIT: z.coerce.number().int().min(1).default(200),

  // Worker
  /** Run the image worker inside the API process (convenient for development). */
  WORKER_EMBEDDED: bool.default(true),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(32).default(2),
  WORKER_POLL_SECONDS: z.coerce.number().min(0.5).max(60).default(1),
  JOB_TIMEOUT_SECONDS: z.coerce.number().int().min(5).max(3600).default(120),
});

export type Env = z.infer<typeof envSchema>;

/** Validate environment variables once at startup and fail fast with a readable message. */
export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}\nSee .env.example for the expected values.`);
  }
  return result.data;
}

/** Derived, ready-to-use limits shared by the upload service, job service and worker. */
export interface ImagingConfig {
  uploadMaxBytes: number;
  uploadMaxFiles: number;
  maxInputPixels: number;
  maxOutputPixels: number;
  maxOutputDimension: number;
  batchMaxFiles: number;
  guestDailyJobLimit: number;
  retentionMs: number;
  jobTimeoutSeconds: number;
  workerConcurrency: number;
  workerPollSeconds: number;
}

export function imagingConfig(env: Env): ImagingConfig {
  return {
    uploadMaxBytes: Math.round(env.UPLOAD_MAX_MB * 1024 * 1024),
    uploadMaxFiles: env.UPLOAD_MAX_FILES,
    maxInputPixels: Math.round(env.MAX_INPUT_MEGAPIXELS * 1_000_000),
    maxOutputPixels: Math.round(env.MAX_OUTPUT_MEGAPIXELS * 1_000_000),
    maxOutputDimension: env.MAX_OUTPUT_DIMENSION,
    batchMaxFiles: env.BATCH_MAX_FILES,
    guestDailyJobLimit: env.GUEST_DAILY_JOB_LIMIT,
    retentionMs: env.FILE_RETENTION_HOURS * 3_600_000,
    jobTimeoutSeconds: env.JOB_TIMEOUT_SECONDS,
    workerConcurrency: env.WORKER_CONCURRENCY,
    workerPollSeconds: env.WORKER_POLL_SECONDS,
  };
}

export function resolveStorageDir(env: Pick<Env, 'STORAGE_LOCAL_DIR'>): string {
  return path.isAbsolute(env.STORAGE_LOCAL_DIR) ? env.STORAGE_LOCAL_DIR : path.join(repoRoot, env.STORAGE_LOCAL_DIR);
}
