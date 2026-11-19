import { waitUntil } from '@vercel/functions';
import type { PgBoss } from 'pg-boss';
import type { Logger } from 'pino';
import { QUEUES, type ProcessImagePayload } from './queue';

/**
 * Decides WHERE image jobs run. Services only call `dispatch`; they never
 * know whether a queue or the current request does the work.
 */
export interface JobRunner {
  readonly mode: 'queue' | 'inline';
  /** Start processing these (already created, QUEUED) jobs. */
  dispatch(jobs: { id: string; priority: number }[]): Promise<void>;
  /** Wait for in-flight inline work (tests and graceful shutdown). */
  drain(): Promise<void>;
}

/** Long-running servers: jobs go to the PostgreSQL queue and a worker picks them up. */
export function createQueueRunner(boss: PgBoss, onQueued: (jobId: string, queueJobId: string | null) => Promise<void>): JobRunner {
  return {
    mode: 'queue',
    async dispatch(jobs) {
      for (const job of jobs) {
        const payload: ProcessImagePayload = { jobId: job.id };
        const queueJobId = await boss.send(QUEUES.processImage, payload, { priority: job.priority });
        await onQueued(job.id, queueJobId);
      }
    },
    async drain() {},
  };
}

/**
 * Serverless hosting (Vercel): there is no always-on worker, so jobs run in
 * the same function invocation, after the response has been sent
 * (`waitUntil` keeps the invocation alive up to its maximum duration).
 * Jobs are claimed atomically in the database, so a job dispatched twice
 * (e.g. re-kicked by a status poll) is still processed only once.
 */
export function createInlineRunner(process: (jobId: string) => Promise<void>, logger: Logger, concurrency: number): JobRunner {
  const inFlight = new Set<Promise<void>>();
  /** Jobs this instance is already working on (a re-dispatch of these is ignored). */
  const active = new Set<string>();

  const runAll = async (ids: string[]) => {
    let next = 0;
    const lane = async () => {
      while (next < ids.length) {
        const id = ids[next++]!;
        try {
          await process(id);
        } catch (err) {
          logger.error({ err, jobId: id }, 'inline job crashed');
        } finally {
          active.delete(id);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, lane));
  };

  return {
    mode: 'inline',
    async dispatch(jobs) {
      const fresh = jobs.filter((j) => !active.has(j.id));
      if (fresh.length === 0) return;
      for (const j of fresh) active.add(j.id);
      const ordered = [...fresh].sort((a, b) => b.priority - a.priority).map((j) => j.id);
      const work = runAll(ordered).finally(() => inFlight.delete(work));
      inFlight.add(work);
      // On Vercel this extends the invocation until the work is done; elsewhere it is a no-op
      // and the promise simply keeps running in this long-lived process.
      waitUntil(work);
    },
    async drain() {
      while (inFlight.size > 0) await Promise.allSettled([...inFlight]);
    },
  };
}
