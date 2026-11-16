import { PgBoss } from 'pg-boss';
import type { Logger } from 'pino';

export const QUEUES = {
  processImage: 'image-process',
  cleanup: 'maintenance-cleanup',
} as const;

export interface ProcessImagePayload {
  jobId: string;
}

/**
 * Job queue backed by PostgreSQL (pg-boss, in its own "pgboss" schema).
 * No Redis required. API processes only enqueue; worker processes consume.
 */
export async function startQueue(databaseUrl: string, logger: Logger, jobTimeoutSeconds: number): Promise<PgBoss> {
  const boss = new PgBoss({ connectionString: databaseUrl, schema: 'pgboss', application_name: 'image-platform' });
  boss.on('error', (err) => logger.error({ err }, 'queue error'));
  await boss.start();
  await boss.createQueue(QUEUES.processImage, {
    // A job running longer than this is considered crashed and is retried once.
    expireInSeconds: jobTimeoutSeconds + 60,
    retryLimit: 1,
    retryDelay: 5,
  });
  await boss.createQueue(QUEUES.cleanup, { expireInSeconds: 600, retryLimit: 0 });
  return boss;
}
