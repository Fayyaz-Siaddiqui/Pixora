'use client';

import { Bookmark, Link2, Link2Off, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { DimensionError, planResize, SIZE_PRESETS, type FitMode } from '@app/image-core';
import { finalizeOutput, OutputSettings } from '@/components/tools/output-settings';
import { ResultsPanel } from '@/components/tools/results-panel';
import { ToolShell } from '@/components/tools/tool-shell';
import { Button, ColorField, Notice, NumberField, Segmented, SelectField, Switch } from '@/components/ui/controls';
import { useJobRunner } from '@/hooks/use-job-runner';
import { cx, formatDims } from '@/lib/format';
import type { Operation, OutputDraft } from '@/lib/types';
import { useSelectedImages } from '@/stores/workspace';

type Kernel = 'lanczos3' | 'mitchell' | 'cubic' | 'nearest';
interface SavedPreset {
  name: string;
  width: number;
  height: number;
  fit: FitMode;
}

const PRESET_KEY = 'pixora.sizePresets';

function loadSaved(): SavedPreset[] {
  try {
    const raw = JSON.parse(localStorage.getItem(PRESET_KEY) ?? '[]') as unknown;
    return Array.isArray(raw) ? (raw as SavedPreset[]).filter((p) => p && typeof p.name === 'string' && p.width > 0 && p.height > 0) : [];
  } catch {
    return [];
  }
}

const FIT_HELP: Record<Exclude<FitMode, 'inside'>, string> = {
  contain: 'Whole image visible; empty space is filled with a background.',
  cover: 'Fills the exact size; edges that don’t fit are trimmed.',
  stretch: 'Forces the exact size and distorts the image.',
};

export function ResizerTool({ batchFocus = false }: { batchFocus?: boolean }) {
  const images = useSelectedImages();
  const first = images[0];
  const runner = useJobRunner();

  const [mode, setMode] = useState<'pixels' | 'percent'>('pixels');
  const [width, setWidth] = useState<number | ''>('');
  const [height, setHeight] = useState<number | ''>('');
  const [lastEdited, setLastEdited] = useState<'width' | 'height'>('width');
  const [lock, setLock] = useState(true);
  const [percent, setPercent] = useState<number | ''>(50);
  const [fit, setFit] = useState<Exclude<FitMode, 'inside'>>('cover');
  const [kernel, setKernel] = useState<Kernel>('lanczos3');
  const [transparentPad, setTransparentPad] = useState(false);
  const [noEnlarge, setNoEnlarge] = useState(false);
  const [padColor, setPadColor] = useState('#ffffff');
  const [output, setOutput] = useState<OutputDraft>({});
  const [saved, setSaved] = useState<SavedPreset[]>([]);
  const [presetName, setPresetName] = useState('');

  useEffect(() => setSaved(loadSaved()), []);
  const persist = (list: SavedPreset[]) => {
    setSaved(list);
    try {
      localStorage.setItem(PRESET_KEY, JSON.stringify(list));
    } catch {
      /* storage unavailable: presets just won't persist */
    }
  };

  // When the (first) selected image changes: start from its size if nothing was typed, or,
  // with the ratio locked, recompute the other side from the one the user set (it may have
  // been typed before the upload finished).
  useEffect(() => {
    if (!first) return;
    if (width === '' && height === '') {
      setWidth(first.width);
      setHeight(first.height);
    } else if (lock) {
      if (lastEdited === 'width' && width !== '' && width > 0) setHeight(Math.max(1, Math.round((width * first.height) / first.width)));
      if (lastEdited === 'height' && height !== '' && height > 0) setWidth(Math.max(1, Math.round((height * first.width) / first.height)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [first?.id]);

  const editWidth = (v: number | '') => {
    setWidth(v);
    setLastEdited('width');
    if (lock && first && v !== '' && v > 0) setHeight(Math.max(1, Math.round((v * first.height) / first.width)));
  };
  const editHeight = (v: number | '') => {
    setHeight(v);
    setLastEdited('height');
    if (lock && first && v !== '' && v > 0) setWidth(Math.max(1, Math.round((v * first.width) / first.height)));
  };

  /** The resize operation sent to the server. */
  const op = useMemo((): Extract<Operation, { type: 'resize' }> | null => {
    const base = { type: 'resize' as const, kernel, position: 'centre' as const };
    if (mode === 'percent') return percent === '' || percent <= 0 ? null : { ...base, percent, fit: 'inside', withoutEnlargement: noEnlarge };
    if (lock) {
      // Locked: send only the side the user set, so every image keeps its own proportions.
      const v = lastEdited === 'width' ? width : height;
      if (v === '' || v <= 0) return null;
      return { ...base, fit: 'inside', withoutEnlargement: noEnlarge, ...(lastEdited === 'width' ? { width: v } : { height: v }) };
    }
    if (width === '' || height === '' || width <= 0 || height <= 0) return null;
    return { ...base, width, height, fit, withoutEnlargement: false, ...(fit === 'contain' && !transparentPad ? { background: padColor } : {}) };
  }, [mode, percent, lock, lastEdited, width, height, fit, kernel, transparentPad, padColor, noEnlarge]);

  type PlanItem = { name: string; out: string; upscale: boolean; kept: boolean; factor: number; distortion: number };
  const plans = useMemo(() => {
    if (!op) return { error: 'Enter a size.', items: [] as PlanItem[] };
    try {
      const items = images.map((img): PlanItem => {
        const req = { width: op.width, height: op.height, percent: op.percent, fit: op.fit };
        const wanted = planResize(img, req);
        const final = planResize(img, { ...req, withoutEnlargement: op.withoutEnlargement });
        return {
          name: img.name,
          out: formatDims(final.output.width, final.output.height),
          upscale: final.isUpscale,
          kept: wanted.isUpscale && !final.isUpscale,
          factor: Math.max(wanted.scaled.width / img.width, wanted.scaled.height / img.height),
          distortion: final.distortion,
        };
      });
      return { error: null, items };
    } catch (err) {
      return { error: err instanceof DimensionError ? err.message : 'Invalid size.', items: [] };
    }
  }, [op, images]);

  const producesAlpha = op?.fit === 'contain' && !op.background;
  const enlarged = plans.items.filter((p) => p.upscale);
  const keptCount = plans.items.filter((p) => p.kept).length;
  const canKeepSmall = op?.fit === 'inside';
  const maxDistortion = Math.max(0, ...plans.items.map((p) => p.distortion));

  const applyPreset = (w: number, h: number, f: FitMode = 'cover') => {
    setMode('pixels');
    setLock(false);
    setWidth(w);
    setHeight(h);
    setFit(f === 'inside' ? 'cover' : f);
  };

  const settings = (
    <>
      <Segmented label="Resize by" value={mode} onChange={setMode} options={[{ value: 'pixels', label: 'Pixels' }, { value: 'percent', label: 'Percentage' }]} />

      {mode === 'pixels' ? (
        <div className="space-y-3">
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <NumberField label="Width" value={width} onChange={editWidth} min={1} suffix="px" />
            <button
              type="button"
              onClick={() => setLock(!lock)}
              aria-pressed={lock}
              aria-label={lock ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
              title={lock ? 'Aspect ratio locked' : 'Aspect ratio unlocked'}
              className={cx('mb-0.5 grid size-9 place-items-center rounded-ctl border', lock ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink-muted')}
            >
              {lock ? <Link2 className="size-4" aria-hidden="true" /> : <Link2Off className="size-4" aria-hidden="true" />}
            </button>
            <NumberField label="Height" value={height} onChange={editHeight} min={1} suffix="px" />
          </div>
          <p className="text-xs text-ink-muted">
            {lock ? 'Proportions are kept. Each image keeps its own shape.' : 'Exact size. Choose how the image fits it.'}
          </p>
          {!lock && (
            <>
              <Segmented
                label="Fit mode"
                value={fit}
                onChange={setFit}
                options={[
                  { value: 'cover', label: 'Fill' },
                  { value: 'contain', label: 'Fit' },
                  { value: 'stretch', label: 'Stretch' },
                ]}
              />
              <p className="text-xs text-ink-muted">{FIT_HELP[fit]}</p>
              {fit === 'contain' && (
                <>
                  <Switch label="Transparent padding" checked={transparentPad} onChange={setTransparentPad} hint="Needs PNG, WebP or AVIF output." />
                  {!transparentPad && <ColorField label="Padding colour" value={padColor} onChange={setPadColor} />}
                </>
              )}
            </>
          )}
        </div>
      ) : (
        <NumberField label="Scale" value={percent} onChange={setPercent} min={1} max={1000} suffix="%" hint="Below 100% makes the image smaller." />
      )}

      <details className="group">
        <summary className="cursor-pointer text-sm font-medium">Size presets</summary>
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-1.5">
            {SIZE_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p.width, p.height)}
                className="rounded-ctl border border-line px-2 py-1.5 text-left text-xs hover:border-accent"
              >
                <span className="block font-medium">{p.label}</span>
                <span className="text-ink-muted">{formatDims(p.width, p.height)}</span>
              </button>
            ))}
          </div>
          {saved.length > 0 && (
            <ul className="space-y-1">
              {saved.map((p, i) => (
                <li key={`${p.name}-${i}`} className="flex items-center gap-2">
                  <button type="button" onClick={() => applyPreset(p.width, p.height, p.fit)} className="flex-1 rounded-ctl border border-line px-2 py-1.5 text-left text-xs hover:border-accent">
                    <span className="font-medium">{p.name}</span> <span className="text-ink-muted">{formatDims(p.width, p.height)}</span>
                  </button>
                  <button type="button" aria-label={`Delete preset ${p.name}`} onClick={() => persist(saved.filter((_, j) => j !== i))} className="text-ink-muted hover:text-bad">
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {mode === 'pixels' && width !== '' && height !== '' && (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const name = presetName.trim() || `${width}×${height}`;
                persist([...saved, { name, width: Number(width), height: Number(height), fit: lock ? 'cover' : fit }].slice(-20));
                setPresetName('');
              }}
            >
              <input
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="Preset name"
                aria-label="New preset name"
                maxLength={40}
                className="h-8 min-w-0 flex-1 rounded-ctl border border-line bg-surface px-2 text-xs"
              />
              <Button size="sm" type="submit">
                <Bookmark className="size-3.5" aria-hidden="true" /> Save size
              </Button>
            </form>
          )}
          <p className="text-xs text-ink-muted">Saved sizes are stored in this browser.</p>
        </div>
      </details>

      <details>
        <summary className="cursor-pointer text-sm font-medium">Resampling</summary>
        <div className="mt-3">
          <SelectField
            label="Algorithm"
            value={kernel}
            onChange={setKernel}
            options={[
              { value: 'lanczos3', label: 'Lanczos3 (sharpest, recommended)' },
              { value: 'mitchell', label: 'Mitchell (smoother, fewer halos)' },
              { value: 'cubic', label: 'Bicubic' },
              { value: 'nearest', label: 'Nearest (pixel art)' },
            ]}
          />
        </div>
      </details>

      <div className="border-t border-line pt-4">
        <OutputSettings value={output} onChange={setOutput} images={images} producesAlpha={producesAlpha} />
      </div>

      {plans.items.length > 0 && (
        <div className="rounded-ctl bg-surface-2 px-3 py-2 text-xs">
          <p className="font-medium">Output size</p>
          <ul className="mt-1 space-y-0.5 text-ink-muted">
            {plans.items.slice(0, 4).map((p, i) => (
              <li key={i} className="flex justify-between gap-2">
                <span className="truncate">{p.name}</span>
                <span className="shrink-0 font-mono text-ink">{p.out}</span>
              </li>
            ))}
            {plans.items.length > 4 && <li>…and {plans.items.length - 4} more</li>}
          </ul>
        </div>
      )}
      {plans.error && images.length > 0 && <Notice tone="error">{plans.error}</Notice>}
      {(enlarged.length > 0 || keptCount > 0) && (
        <Notice tone="info">
          {enlarged.length > 0 && (
            <p>
              {enlarged.length === 1 && images.length === 1
                ? `This is larger than your original, so the image will be enlarged ${Math.round(enlarged[0]!.factor * 100)}%.`
                : `${enlarged.length} of ${images.length} images are smaller than this size and will be enlarged (up to ${Math.round(Math.max(...enlarged.map((p) => p.factor)) * 100)}%).`}{' '}
              That works, but enlarging can’t add new detail, so the result looks slightly softer. Choose a smaller size to keep it fully sharp.
            </p>
          )}
          {keptCount > 0 && (
            <p>
              {keptCount === 1 ? '1 image is' : `${keptCount} images are`} already smaller than this size and will keep {keptCount === 1 ? 'its' : 'their'} original size.
            </p>
          )}
          {canKeepSmall && (
            <div className="mt-3">
              <Switch label="Keep smaller images at their original size" checked={noEnlarge} onChange={setNoEnlarge} hint="Only shrinks images; never enlarges them." />
            </div>
          )}
        </Notice>
      )}
      {maxDistortion > 0.01 && (
        <Notice tone="warn">Stretch will distort the image by about {Math.round(maxDistortion * 100)}%. Use Fill or Fit to keep proportions.</Notice>
      )}
    </>
  );

  return (
    <ToolShell
      multi
      settings={settings}
      runLabel={batchFocus ? 'Resize all' : 'Resize'}
      running={runner.state.phase === 'starting' || runner.state.phase === 'running'}
      disabledReason={plans.error}
      onRun={() => op && void runner.run(images.map((i) => i.id), [op], finalizeOutput(output, images, producesAlpha))}
      results={<ResultsPanel state={runner.state} onRetry={(id) => void runner.retry(id)} onCancel={(id) => void runner.cancel(id)} />}
    />
  );
}
