'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import type { Batch, Job, Operation, OutputDraft } from '@/lib/types';

export type RunState =
  | { phase: 'idle' }
  | { phase: 'starting' }
  | { phase: 'running' | 'done'; jobs: Job[]; batch: Batch | null }
  | { phase: 'error'; message: string };

const TERMINAL = new Set(['SUCCEEDED', 'FAILED', 'CANCELED']);
const POLL_MS = 600;

/**
 * Start processing for one image (single job) or several (batch) and poll
 * until everything has finished. Polling stops when the component unmounts.
 */
export function useJobRunner() {
  const [state, setState] = useState<RunState>({ phase: 'idle' });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const poll = useCallback(async (kind: 'job' | 'batch', id: string) => {
    if (!alive.current) return;
    try {
      if (kind === 'job') {
        const job = await api.job(id);
        if (!alive.current) return;
        const done = TERMINAL.has(job.status);
        setState({ phase: done ? 'done' : 'running', jobs: [job], batch: null });
        if (!done) timer.current = setTimeout(() => void poll(kind, id), POLL_MS);
      } else {
        const batch = await api.getBatch(id);
        if (!alive.current) return;
        const done = batch.status !== 'PROCESSING' && batch.status !== 'PENDING';
        setState({ phase: done ? 'done' : 'running', jobs: batch.jobs, batch });
        if (!done) timer.current = setTimeout(() => void poll(kind, id), POLL_MS);
      }
    } catch (err) {
      if (!alive.current) return;
      // A failed poll (e.g. brief network drop) is retried a little later instead of giving up.
      timer.current = setTimeout(() => void poll(kind, id), POLL_MS * 3);
      setState((s) => (s.phase === 'running' ? s : { phase: 'error', message: errorMessage(err) }));
    }
  }, []);

  const run = useCallback(
    async (assetIds: string[], operations: Operation[], output?: OutputDraft) => {
      if (timer.current) clearTimeout(timer.current);
      setState({ phase: 'starting' });
      try {
        if (assetIds.length === 1) {
          const job = await api.process(assetIds[0]!, operations, output);
          setState({ phase: 'running', jobs: [job], batch: null });
          void poll('job', job.id);
        } else {
          const batch = await api.batch(assetIds, operations, output);
          setState({ phase: 'running', jobs: batch.jobs, batch });
          void poll('batch', batch.id);
        }
      } catch (err) {
        setState({ phase: 'error', message: errorMessage(err) });
      }
    },
    [poll],
  );

  const retry = useCallback(
    async (jobId: string) => {
      try {
        await api.retryJob(jobId);
        if (state.phase === 'done' || state.phase === 'running') {
          if (state.batch) void poll('batch', state.batch.id);
          else void poll('job', jobId);
        }
      } catch (err) {
        setState({ phase: 'error', message: errorMessage(err) });
      }
    },
    [poll, state],
  );

  const cancel = useCallback(async (jobId: string) => {
    try {
      await api.cancelJob(jobId);
    } catch {
      // Already processing or finished; the next poll shows the real state.
    }
  }, []);

  const reset = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setState({ phase: 'idle' });
  }, []);

  return { state, run, retry, cancel, reset };
}
