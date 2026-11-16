'use client';

import { Loader2, Play } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { ImageTray } from '@/components/tools/image-tray';
import { UploadDropzone } from '@/components/tools/upload-dropzone';
import { Button, Notice } from '@/components/ui/controls';
import { fileUrl } from '@/lib/api';
import { formatDims } from '@/lib/format';
import { useSelectedImages, useWorkspace } from '@/stores/workspace';

/**
 * Common layout for every tool: upload + image tray + preview on the left,
 * settings and the action button on the right, results underneath.
 */
export function ToolShell({
  multi,
  settings,
  preview,
  results,
  runLabel,
  onRun,
  running,
  disabledReason,
}: {
  multi: boolean;
  settings: ReactNode;
  /** Custom main area (cropper, enhancer). Defaults to a preview of the selection. */
  preview?: ReactNode;
  results: ReactNode;
  runLabel: string;
  onRun: () => void;
  running: boolean;
  /** When set, the run button is disabled and this explains why. */
  disabledReason?: string | null;
}) {
  const load = useWorkspace((s) => s.load);
  const loaded = useWorkspace((s) => s.loaded);
  const loadError = useWorkspace((s) => s.loadError);
  const images = useWorkspace((s) => s.images);
  const select = useWorkspace((s) => s.select);
  const selected = useSelectedImages();

  useEffect(() => {
    void load();
  }, [load]);

  // Single-image tools work on exactly one image.
  useEffect(() => {
    if (!multi && selected.length > 1) select([selected[0]!.id]);
  }, [multi, selected, select]);

  const empty = loaded && images.length === 0;
  const noSelection = !empty && selected.length === 0;
  const reason = noSelection ? (multi ? 'Select one or more images.' : 'Select an image.') : disabledReason;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <div className="min-w-0 space-y-5">
        {loadError && <Notice tone="error">{loadError}</Notice>}
        {!loaded && (
          <p className="flex items-center gap-2 text-sm text-ink-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Loading your images…
          </p>
        )}
        {empty ? (
          <UploadDropzone multiple={multi} />
        ) : (
          loaded && (
            <>
              {preview ?? <DefaultPreview />}
              <ImageTray multi={multi} />
              <UploadDropzone size="compact" multiple={multi} />
            </>
          )
        )}
        {results}
      </div>

      <aside aria-label="Settings" className="space-y-5 rounded-card border border-line bg-surface p-4 sm:p-5 lg:sticky lg:top-20">
        {settings}
        <div className="space-y-2 border-t border-line pt-4">
          <Button variant="primary" size="lg" className="w-full" onClick={onRun} disabled={running || Boolean(reason) || empty}>
            {running ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
            {running ? 'Processing…' : selected.length > 1 ? `${runLabel} (${selected.length})` : runLabel}
          </Button>
          {reason && !empty && <p className="text-center text-xs text-ink-muted">{reason}</p>}
        </div>
      </aside>
    </div>
  );
}

function DefaultPreview() {
  const selected = useSelectedImages();
  const img = selected[0];
  if (!img) return null;
  if (selected.length > 1) {
    return (
      <div className="rounded-card border border-line bg-surface px-4 py-3 text-sm">
        <span className="font-medium">{selected.length} images selected.</span>{' '}
        <span className="text-ink-muted">The same settings will be applied to each one; download them individually or as a ZIP.</span>
      </div>
    );
  }
  return (
    <figure className="space-y-2">
      <div className="checkerboard flex max-h-[28rem] justify-center overflow-hidden rounded-card border border-line">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={fileUrl(img.urls.file)} alt={img.name} className="max-h-[28rem] w-auto object-contain" />
      </div>
      <figcaption className="text-xs text-ink-muted">
        {img.name} · {formatDims(img.width, img.height)} px
      </figcaption>
    </figure>
  );
}
