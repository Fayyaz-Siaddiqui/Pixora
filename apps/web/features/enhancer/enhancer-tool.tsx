'use client';

import { Loader2, Redo2, RotateCcw, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { applyAdjust, isIdentityAdjust, NEUTRAL_ADJUST, type AdjustSettings } from '@app/image-core';
import { BeforeAfter } from '@/components/tools/before-after';
import { finalizeOutput, OutputSettings } from '@/components/tools/output-settings';
import { ResultsPanel } from '@/components/tools/results-panel';
import { ToolShell } from '@/components/tools/tool-shell';
import { Button, Notice, Segmented, Slider } from '@/components/ui/controls';
import { useJobRunner } from '@/hooks/use-job-runner';
import { fileUrl } from '@/lib/api';
import type { Asset, Operation, OutputDraft } from '@/lib/types';
import { useSelectedImages } from '@/stores/workspace';

interface Settings extends AdjustSettings {
  sharpen: number; // 0 = off
  denoise: 0 | 3 | 5;
}

const NEUTRAL: Settings = { ...NEUTRAL_ADJUST, sharpen: 0, denoise: 0 };
const PREVIEW_MAX = 1200;

const signed = (v: number) => (v > 0 ? `+${v}` : String(v));

/** Undo/redo history of committed settings. */
function useHistory(initial: Settings) {
  const [stack, setStack] = useState<Settings[]>([initial]);
  const [index, setIndex] = useState(0);
  const commit = useCallback(
    (s: Settings) => {
      setStack((st) => {
        const cur = st[index];
        if (cur && JSON.stringify(cur) === JSON.stringify(s)) return st;
        const next = [...st.slice(0, index + 1), s].slice(-50);
        setIndex(next.length - 1);
        return next;
      });
    },
    [index],
  );
  const undo = (): Settings | null => {
    if (index === 0) return null;
    setIndex(index - 1);
    return stack[index - 1]!;
  };
  const redo = (): Settings | null => {
    if (index >= stack.length - 1) return null;
    setIndex(index + 1);
    return stack[index + 1]!;
  };
  return { commit, undo, redo, canUndo: index > 0, canRedo: index < stack.length - 1 };
}

/** Live preview: the browser applies the same adjustment math as the server to a downscaled copy. */
function PreviewCanvas({ img, settings }: { img: Asset; settings: AdjustSettings }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const base = useRef<ImageData | null>(null);
  const frame = useRef(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    setStatus('loading');
    base.current = null;
    const el = new Image();
    // Credentials + CORS so the canvas can read the pixels for the preview.
    el.crossOrigin = 'use-credentials';
    el.onload = () => {
      const scale = Math.min(1, PREVIEW_MAX / Math.max(el.naturalWidth, el.naturalHeight));
      const w = Math.max(1, Math.round(el.naturalWidth * scale));
      const h = Math.max(1, Math.round(el.naturalHeight * scale));
      const c = canvasRef.current;
      if (!c) return;
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      if (!ctx) return setStatus('error');
      ctx.drawImage(el, 0, 0, w, h);
      try {
        base.current = ctx.getImageData(0, 0, w, h);
        setStatus('ready');
      } catch {
        setStatus('error');
      }
    };
    el.onerror = () => setStatus('error');
    el.src = `${fileUrl(img.urls.file)}?preview=1`;
  }, [img.id, img.urls.file]);

  useEffect(() => {
    if (status !== 'ready') return;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const c = canvasRef.current;
      const src = base.current;
      if (!c || !src) return;
      const out = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height);
      applyAdjust(out.data, 4, settings);
      c.getContext('2d')?.putImageData(out, 0, 0);
    });
    return () => cancelAnimationFrame(frame.current);
  }, [settings, status]);

  return (
    <>
      <canvas ref={canvasRef} className="size-full object-contain" aria-label="Edited preview" />
      {status === 'loading' && (
        <span className="absolute inset-0 grid place-items-center text-sm text-ink-muted">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
        </span>
      )}
      {status === 'error' && <span className="absolute inset-0 grid place-items-center p-4 text-center text-sm text-bad">Preview unavailable. Your settings will still be applied when you export.</span>}
    </>
  );
}

export function EnhancerTool() {
  const [img] = useSelectedImages();
  const runner = useJobRunner();
  const [s, setS] = useState<Settings>(NEUTRAL);
  const [output, setOutput] = useState<OutputDraft>({});
  const history = useHistory(NEUTRAL);

  const set = (patch: Partial<Settings>) => setS((cur) => ({ ...cur, ...patch }));
  // Called when a slider is released: record the current settings as one undo step.
  const commit = () => history.commit(s);
  const undo = () => {
    const prev = history.undo();
    if (prev) setS(prev);
  };
  const redo = () => {
    const next = history.redo();
    if (next) setS(next);
  };
  const reset = () => {
    setS(NEUTRAL);
    history.commit(NEUTRAL);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
      if ((e.target as HTMLElement).tagName === 'INPUT' && (e.target as HTMLInputElement).type !== 'range') return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // New image: start from neutral settings.
  useEffect(() => {
    setS(NEUTRAL);
  }, [img?.id]);

  const adjust: AdjustSettings = {
    brightness: s.brightness, contrast: s.contrast, saturation: s.saturation, exposure: s.exposure,
    temperature: s.temperature, tint: s.tint, highlights: s.highlights, shadows: s.shadows, gamma: s.gamma,
  };
  const operations: Operation[] = [];
  if (s.denoise) operations.push({ type: 'denoise', size: s.denoise });
  if (!isIdentityAdjust(adjust)) operations.push({ type: 'adjust', ...adjust });
  if (s.sharpen > 0) operations.push({ type: 'sharpen', sigma: 1, amount: s.sharpen });

  const slider = (key: keyof AdjustSettings, label: string, min: number, max: number, step = 1, fmt: (v: number) => string = signed) => (
    <Slider
      label={label}
      value={s[key]}
      min={min}
      max={max}
      step={step}
      onChange={(v) => set({ [key]: v })}
      onCommit={commit}
      format={fmt}
      neutral={NEUTRAL[key]}
    />
  );

  const settings = (
    <>
      <div className="flex items-center gap-1.5">
        <Button size="sm" onClick={undo} disabled={!history.canUndo} aria-label="Undo" title="Undo (Ctrl+Z)">
          <Undo2 className="size-4" aria-hidden="true" />
        </Button>
        <Button size="sm" onClick={redo} disabled={!history.canRedo} aria-label="Redo" title="Redo (Ctrl+Shift+Z)">
          <Redo2 className="size-4" aria-hidden="true" />
        </Button>
        <Button size="sm" variant="ghost" onClick={reset} className="ml-auto">
          <RotateCcw className="size-3.5" aria-hidden="true" /> Reset all
        </Button>
      </div>

      <fieldset className="space-y-3">
        <legend className="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase">Light</legend>
        {slider('exposure', 'Exposure', -2, 2, 0.05, (v) => `${v > 0 ? '+' : ''}${v.toFixed(2)} EV`)}
        {slider('brightness', 'Brightness', -100, 100)}
        {slider('contrast', 'Contrast', -100, 100)}
        {slider('highlights', 'Highlights', -100, 100)}
        {slider('shadows', 'Shadows', -100, 100)}
        {slider('gamma', 'Gamma', 0.4, 2.5, 0.05, (v) => v.toFixed(2))}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase">Colour</legend>
        {slider('temperature', 'Temperature', -100, 100)}
        {slider('tint', 'Tint', -100, 100)}
        {slider('saturation', 'Saturation', -100, 100)}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase">Detail</legend>
        <Slider label="Sharpness" value={s.sharpen} min={0} max={5} step={0.5} onChange={(v) => set({ sharpen: v })} onCommit={commit} format={(v) => (v === 0 ? 'Off' : v.toFixed(1))} neutral={0} />
        <Segmented
          label="Noise reduction"
          value={String(s.denoise) as '0' | '3' | '5'}
          onChange={(v) => {
            const next = { ...s, denoise: Number(v) as 0 | 3 | 5 };
            setS(next);
            history.commit(next);
          }}
          options={[
            { value: '0', label: 'Off' },
            { value: '3', label: 'Light' },
            { value: '5', label: 'Strong' },
          ]}
        />
        <p className="text-xs text-ink-muted">Sharpness and noise reduction are applied on export; the preview shows light and colour.</p>
      </fieldset>

      <div className="border-t border-line pt-4">
        <OutputSettings value={output} onChange={setOutput} images={img ? [img] : []} />
      </div>
    </>
  );

  return (
    <ToolShell
      multi={false}
      settings={settings}
      runLabel="Apply & export"
      running={runner.state.phase === 'starting' || runner.state.phase === 'running'}
      disabledReason={operations.length === 0 ? 'Adjust a setting to make a change.' : null}
      onRun={() => img && void runner.run([img.id], operations, finalizeOutput(output, [img]))}
      preview={
        img && (
          <div className="space-y-2">
            <BeforeAfter
              aspect={img.width / img.height}
              before={
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fileUrl(img.urls.file)} alt="Original" className="size-full object-contain" />
              }
              after={
                <div className="relative size-full">
                  <PreviewCanvas img={img} settings={adjust} />
                </div>
              }
              afterLabel="Edited"
            />
            {operations.length === 0 && <Notice>Move a slider to see the change. Drag the divider to compare with the original.</Notice>}
          </div>
        )
      }
      results={<ResultsPanel state={runner.state} onRetry={(id) => void runner.retry(id)} onCancel={(id) => void runner.cancel(id)} />}
    />
  );
}
