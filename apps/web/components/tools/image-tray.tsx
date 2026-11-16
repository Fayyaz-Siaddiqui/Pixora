'use client';

import { Check, Trash2, TriangleAlert } from 'lucide-react';
import { fileUrl } from '@/lib/api';
import { cx, formatBytes, formatDims, formatLabel } from '@/lib/format';
import { useWorkspace } from '@/stores/workspace';

/** The visitor's uploaded images. Click to select (single mode) or toggle (multi mode). */
export function ImageTray({ multi }: { multi: boolean }) {
  const images = useWorkspace((s) => s.images);
  const selected = useWorkspace((s) => s.selectedIds);
  const toggle = useWorkspace((s) => s.toggle);
  const select = useWorkspace((s) => s.select);
  const remove = useWorkspace((s) => s.remove);

  if (images.length === 0) return null;

  return (
    <section aria-label="Your images" className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium">
          Your images <span className="text-ink-muted">({images.length})</span>
        </h2>
        {multi && images.length > 1 && (
          <div className="flex gap-3 text-sm">
            <button type="button" className="text-ink-muted hover:text-ink" onClick={() => select(images.map((i) => i.id))}>
              Select all
            </button>
            <button type="button" className="text-ink-muted hover:text-ink" onClick={() => select([])}>
              Clear
            </button>
          </div>
        )}
      </div>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2">
        {images.map((img) => {
          const isSel = selected.includes(img.id);
          return (
            <li key={img.id} className="group relative">
              <button
                type="button"
                aria-pressed={isSel}
                onClick={() => (multi ? toggle(img.id) : select([img.id]))}
                className={cx(
                  'block w-full overflow-hidden rounded-ctl border bg-surface text-left transition-colors',
                  isSel ? 'border-accent ring-2 ring-accent/30' : 'border-line hover:border-ink-muted/50',
                )}
              >
                <span className="checkerboard block aspect-[4/3]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={fileUrl(img.urls.thumbnail)} alt="" loading="lazy" className="size-full object-contain" />
                </span>
                <span className="block space-y-0.5 px-2 py-1.5">
                  <span className="block truncate text-xs font-medium" title={img.name}>
                    {img.name}
                  </span>
                  <span className="block truncate text-[0.6875rem] text-ink-muted">{formatDims(img.width, img.height)} px</span>
                  <span className="block truncate text-[0.6875rem] text-ink-muted">
                    {formatLabel(img.format)} · {formatBytes(img.sizeBytes)}
                  </span>
                </span>
              </button>
              {isSel && (
                <span className="pointer-events-none absolute left-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-accent text-accent-ink">
                  <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
                </span>
              )}
              {img.extensionMismatch && (
                <span
                  title={`The file name says otherwise, but this is really a ${formatLabel(img.format)} image.`}
                  className="absolute bottom-12 left-1.5 inline-flex items-center gap-1 rounded bg-surface/90 px-1.5 py-0.5 text-[0.6875rem]"
                >
                  <TriangleAlert className="size-3 text-accent" aria-hidden="true" /> Renamed
                </span>
              )}
              <button
                type="button"
                onClick={() => void remove(img.id)}
                aria-label={`Delete ${img.name}`}
                title="Delete from server"
                className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-full bg-surface/90 text-ink-muted opacity-0 shadow-sm transition-opacity hover:text-bad focus:opacity-100 group-hover:opacity-100"
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
