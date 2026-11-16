'use client';

import { CheckCircle2, Download, FileArchive, Loader2, RotateCcw, X, XCircle } from 'lucide-react';
import { BeforeAfter } from '@/components/tools/before-after';
import { linkButtonClass } from '@/components/ui/button-styles';
import { Button, Notice, ProgressBar } from '@/components/ui/controls';
import type { RunState } from '@/hooks/use-job-runner';
import { fileUrl } from '@/lib/api';
import { cx, formatBytes, formatDims, formatLabel } from '@/lib/format';
import type { Asset, Job } from '@/lib/types';
import { useWorkspace } from '@/stores/workspace';

const statusLabel: Record<Job['status'], string> = {
  QUEUED: 'Waiting',
  PROCESSING: 'Processing',
  SUCCEEDED: 'Done',
  FAILED: 'Failed',
  CANCELED: 'Cancelled',
};

export function ResultsPanel({
  state,
  onRetry,
  onCancel,
  compare = true,
}: {
  state: RunState;
  onRetry: (jobId: string) => void;
  onCancel: (jobId: string) => void;
  /** Show the before/after slider for a single result. */
  compare?: boolean;
}) {
  const images = useWorkspace((s) => s.images);
  if (state.phase === 'idle') return null;

  if (state.phase === 'starting') {
    return (
      <section aria-live="polite" className="flex items-center gap-2 rounded-card border border-line bg-surface p-5 text-sm text-ink-muted">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Starting…
      </section>
    );
  }
  if (state.phase === 'error') {
    return <Notice tone="error">{state.message}</Notice>;
  }

  const { jobs, batch } = state;
  const byId = new Map(images.map((i) => [i.id, i]));
  const succeeded = jobs.filter((j) => j.status === 'SUCCEEDED');
  const single = jobs.length === 1 ? jobs[0]! : null;
  const original = single ? byId.get(single.inputAssetId) : undefined;

  return (
    <section aria-labelledby="results-heading" aria-live="polite" className="space-y-4 rounded-card border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="results-heading" className="font-display text-lg font-semibold">
          {state.phase === 'running' ? 'Processing…' : 'Results'}
          {batch && (
            <span className="ml-2 text-sm font-normal text-ink-muted">
              {batch.counts.succeeded} of {batch.totalCount} done{batch.counts.failed ? `, ${batch.counts.failed} failed` : ''}
            </span>
          )}
        </h2>
        {batch && succeeded.length > 0 && state.phase === 'done' && (
          <a href={fileUrl(batch.downloadUrl)} className={linkButtonClass('primary')}>
            <FileArchive className="size-4" aria-hidden="true" /> Download all (ZIP)
          </a>
        )}
      </div>

      {single?.status === 'SUCCEEDED' && single.result && original && compare && (
        <BeforeAfter
          aspect={single.result.width / single.result.height}
          before={
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fileUrl(original.urls.file)} alt="Original" className="size-full object-contain" />
          }
          after={
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fileUrl(single.result.asset.urls.file)} alt="Result" className="size-full object-contain" />
          }
        />
      )}

      <ul className="divide-y divide-line">
        {jobs.map((job) => (
          <JobRow key={job.id} job={job} input={byId.get(job.inputAssetId)} onRetry={onRetry} onCancel={onCancel} />
        ))}
      </ul>
    </section>
  );
}

function JobRow({ job, input, onRetry, onCancel }: { job: Job; input?: Asset; onRetry: (id: string) => void; onCancel: (id: string) => void }) {
  const r = job.result;
  const active = job.status === 'QUEUED' || job.status === 'PROCESSING';
  return (
    <li className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
      <span className="checkerboard size-14 shrink-0 overflow-hidden rounded-ctl border border-line">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {(r || input) && <img src={fileUrl(r ? r.asset.urls.file : input!.urls.thumbnail)} alt="" className="size-full object-contain" />}
      </span>

      <div className="min-w-0 flex-1 space-y-1">
        <p className="truncate text-sm font-medium">{r?.asset.name ?? input?.name ?? 'Image'}</p>
        {active && <ProgressBar value={job.progress} label={`Progress for ${input?.name ?? 'image'}`} />}
        {r && (
          <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-muted">
            <span>{formatDims(r.width, r.height)} px</span>
            <span>{formatLabel(r.format)}</span>
            <span>
              {r.originalSizeBytes !== null && <>{formatBytes(r.originalSizeBytes)} → </>}
              <span className="font-medium text-ink">{formatBytes(r.sizeBytes)}</span>
            </span>
            {r.savedPercent !== null && (
              <span className={cx('font-medium', r.savedPercent >= 0 ? 'text-ok' : 'text-ink-muted')}>
                {r.savedPercent >= 0 ? `${r.savedPercent}% smaller` : `${Math.abs(r.savedPercent)}% larger`}
              </span>
            )}
          </p>
        )}
        {r?.details?.targetMet === false && (
          <p className="text-xs text-accent">
            Target size couldn’t be reached without unacceptable quality loss. This is the smallest good-quality version; reduce the dimensions to go smaller.
          </p>
        )}
        {r?.details?.flattenedTransparency && <p className="text-xs text-ink-muted">Transparent areas were filled with your background colour.</p>}
        {job.error && <p className="text-xs text-bad">{job.error.message}</p>}
      </div>

      <div className="flex items-center gap-2">
        <span
          className={cx(
            'inline-flex items-center gap-1 text-xs font-medium',
            job.status === 'SUCCEEDED' && 'text-ok',
            job.status === 'FAILED' && 'text-bad',
            (active || job.status === 'CANCELED') && 'text-ink-muted',
          )}
        >
          {job.status === 'SUCCEEDED' && <CheckCircle2 className="size-3.5" aria-hidden="true" />}
          {job.status === 'FAILED' && <XCircle className="size-3.5" aria-hidden="true" />}
          {active && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
          {statusLabel[job.status]}
        </span>
        {job.status === 'QUEUED' && (
          <Button size="sm" variant="ghost" onClick={() => onCancel(job.id)} aria-label="Cancel">
            <X className="size-4" aria-hidden="true" />
          </Button>
        )}
        {(job.status === 'FAILED' || job.status === 'CANCELED') && (
          <Button size="sm" onClick={() => onRetry(job.id)}>
            <RotateCcw className="size-3.5" aria-hidden="true" /> Retry
          </Button>
        )}
        {r && (
          <a href={fileUrl(r.asset.urls.download)} className={linkButtonClass('secondary')} download>
            <Download className="size-4" aria-hidden="true" /> Download
          </a>
        )}
      </div>
    </li>
  );
}
