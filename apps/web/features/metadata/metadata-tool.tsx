'use client';

import { Loader2, MapPin, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ImageTray } from '@/components/tools/image-tray';
import { UploadDropzone } from '@/components/tools/upload-dropzone';
import { Notice } from '@/components/ui/controls';
import { api, errorMessage } from '@/lib/api';
import { formatBytes, formatDims, formatLabel } from '@/lib/format';
import type { MetadataReport } from '@/lib/types';
import { useSelectedImages, useWorkspace } from '@/stores/workspace';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-3 py-2 text-sm">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function flatten(obj: Record<string, unknown>, prefix = ''): [string, string][] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' && !Array.isArray(v) ? flatten(v as Record<string, unknown>, `${prefix}${k} › `) : [[`${prefix}${k}`, Array.isArray(v) ? v.join(', ') : String(v)] as [string, string]],
  );
}

/** Metadata Viewer and Format Checker: reads the file itself, not its name. */
export function MetadataTool() {
  const load = useWorkspace((s) => s.load);
  const loaded = useWorkspace((s) => s.loaded);
  const images = useWorkspace((s) => s.images);
  const select = useWorkspace((s) => s.select);
  const selected = useSelectedImages();
  const img = selected[0];
  const [report, setReport] = useState<MetadataReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => void load(), [load]);
  useEffect(() => {
    if (selected.length > 1) select([selected[0]!.id]);
  }, [selected, select]);
  useEffect(() => {
    if (!img) return;
    setReport(null);
    setError(null);
    let live = true;
    api
      .metadata(img.id)
      .then((r) => live && setReport(r))
      .catch((err: unknown) => live && setError(errorMessage(err)));
    return () => {
      live = false;
    };
  }, [img]);

  if (loaded && images.length === 0) return <UploadDropzone multiple={false} />;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div className="space-y-4">
        <ImageTray multi={false} />
        <UploadDropzone size="compact" multiple={false} />
      </div>
      <section aria-live="polite" className="rounded-card border border-line bg-surface p-4 sm:p-5">
        {!img && <p className="text-sm text-ink-muted">Select an image to inspect it.</p>}
        {img && !report && !error && (
          <p className="flex items-center gap-2 text-sm text-ink-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Reading metadata…
          </p>
        )}
        {error && <Notice tone="error">{error}</Notice>}
        {report && img && (
          <div className="space-y-4">
            <h2 className="truncate font-display text-lg font-semibold" title={report.name}>
              {report.name}
            </h2>
            {img.extensionMismatch ? (
              <Notice tone="warn">
                The file name doesn’t match its content: this is really a <strong>{formatLabel(report.format ?? '')}</strong> image.
              </Notice>
            ) : (
              <Notice tone="success">Format verified from the file’s content: {formatLabel(report.format ?? '')}.</Notice>
            )}
            {report.containsGpsLocation ? (
              <Notice tone="warn">
                <span className="inline-flex items-center gap-1 font-medium">
                  <MapPin className="size-3.5" aria-hidden="true" /> Contains GPS location.
                </span>{' '}
                Anyone with the original file can see where it was taken. Images exported from our tools never include GPS.
              </Notice>
            ) : (
              <Notice>
                <span className="inline-flex items-center gap-1">
                  <ShieldCheck className="size-3.5" aria-hidden="true" /> No GPS location found.
                </span>
              </Notice>
            )}
            <dl className="divide-y divide-line">
              <Row label="Format">{formatLabel(report.format ?? 'unknown')}</Row>
              <Row label="Dimensions">
                {formatDims(report.displayWidth, report.displayHeight)} px
                {(report.displayWidth !== report.width || report.displayHeight !== report.height) && (
                  <span className="text-ink-muted"> (stored as {formatDims(report.width, report.height)}, rotated by EXIF)</span>
                )}
              </Row>
              <Row label="Megapixels">{((report.width * report.height) / 1e6).toFixed(2)} MP</Row>
              <Row label="File size">{formatBytes(report.sizeBytes)}</Row>
              <Row label="Colour space">{report.colorSpace ?? '—'}{report.hasIccProfile ? ' (ICC profile embedded)' : ''}</Row>
              <Row label="Channels / depth">{report.channels ?? '—'} · {report.bitDepth ?? '—'}</Row>
              <Row label="Transparency">{report.hasAlpha ? 'Yes' : 'No'}</Row>
              <Row label="EXIF orientation">{report.orientation ?? 'None'}</Row>
              <Row label="Resolution (DPI)">{report.density ?? '—'}</Row>
              <Row label="Progressive">{report.isProgressive ? 'Yes' : 'No'}</Row>
              {report.pages > 1 && <Row label="Frames">{report.pages} (animated; tools use the first frame)</Row>}
            </dl>
            <div>
              <h3 className="mb-2 text-sm font-semibold">EXIF data</h3>
              {report.exif ? (
                <dl className="max-h-96 divide-y divide-line overflow-auto rounded-ctl border border-line px-3">
                  {flatten(report.exif).map(([k, v]) => (
                    <Row key={k} label={k}>
                      <span className="font-mono text-xs">{v}</span>
                    </Row>
                  ))}
                </dl>
              ) : (
                <p className="text-sm text-ink-muted">This image has no EXIF data.</p>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
