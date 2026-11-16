'use client';

import { FlipHorizontal2, FlipVertical2, RotateCcw, RotateCcwSquare, RotateCwSquare } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { finalizeOutput, OutputSettings } from '@/components/tools/output-settings';
import { ResultsPanel } from '@/components/tools/results-panel';
import { ToolShell } from '@/components/tools/tool-shell';
import { Button, NumberField, SelectField, Switch } from '@/components/ui/controls';
import { useJobRunner } from '@/hooks/use-job-runner';
import type { Operation, OutputDraft } from '@/lib/types';
import { useSelectedImages } from '@/stores/workspace';
import { CropArea, initialRect, rotatedSize, type Rect, type Rotation } from './crop-area';

type AspectKey = 'free' | 'original' | '1:1' | '4:5' | '3:4' | '4:3' | '3:2' | '16:9' | '9:16' | 'custom';

const ASPECTS: { value: AspectKey; label: string }[] = [
  { value: 'free', label: 'Free' },
  { value: 'original', label: 'Original ratio' },
  { value: '1:1', label: 'Square 1:1' },
  { value: '4:5', label: 'Portrait 4:5' },
  { value: '3:4', label: 'Portrait 3:4' },
  { value: '9:16', label: 'Story 9:16' },
  { value: '4:3', label: 'Landscape 4:3' },
  { value: '3:2', label: 'Photo 3:2' },
  { value: '16:9', label: 'Wide 16:9' },
  { value: 'custom', label: 'Custom ratio' },
];

export function CropperTool() {
  const [img] = useSelectedImages();
  const runner = useJobRunner();

  const [rotation, setRotation] = useState<Rotation>(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [aspectKey, setAspectKey] = useState<AspectKey>('free');
  const [customW, setCustomW] = useState<number | ''>(16);
  const [customH, setCustomH] = useState<number | ''>(9);
  const [circle, setCircle] = useState(false);
  const [outW, setOutW] = useState<number | ''>('');
  const [outH, setOutH] = useState<number | ''>('');
  const [output, setOutput] = useState<OutputDraft>({});
  const [rect, setRect] = useState<Rect>({ x: 0, y: 0, w: 1, h: 1 });

  const size = img ? rotatedSize(img, rotation) : { w: 1, h: 1 };
  const aspect = useMemo((): number | null => {
    if (circle) return 1;
    if (aspectKey === 'free') return null;
    if (aspectKey === 'original') return size.w / size.h;
    if (aspectKey === 'custom') return customW && customH ? Number(customW) / Number(customH) : null;
    const [a, b] = aspectKey.split(':').map(Number);
    return a! / b!;
  }, [aspectKey, customW, customH, circle, size.w, size.h]);

  // Reset the crop box when the image, rotation or ratio changes.
  useEffect(() => {
    if (img) setRect(initialRect(size.w, size.h, aspect));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img?.id, rotation, aspect]);

  // Circles need transparency; switch JPG sources to PNG unless the user chose a format.
  useEffect(() => {
    if (circle && !output.format && img && img.format === 'jpeg') setOutput((o) => ({ ...o, format: 'png' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [circle]);

  const resetAll = () => {
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
    setCircle(false);
    setAspectKey('free');
    setOutW('');
    setOutH('');
    if (img) setRect(initialRect(img.width, img.height, null));
  };

  const r = {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    w: Math.max(1, Math.min(Math.round(rect.w), size.w - Math.round(rect.x))),
    h: Math.max(1, Math.min(Math.round(rect.h), size.h - Math.round(rect.y))),
  };
  const setExact = (patch: Partial<typeof r>) => {
    const n = { ...r, ...patch };
    const w = Math.max(1, Math.min(n.w, size.w));
    const h = Math.max(1, Math.min(n.h, size.h));
    setRect({ x: Math.min(Math.max(0, n.x), size.w - w), y: Math.min(Math.max(0, n.y), size.h - h), w, h });
  };

  const operations: Operation[] = [];
  if (flipH || flipV) operations.push({ type: 'flip', horizontal: flipH, vertical: flipV });
  if (rotation) operations.push({ type: 'rotate', angle: rotation });
  const cropsSomething = r.x !== 0 || r.y !== 0 || r.w !== size.w || r.h !== size.h;
  if (cropsSomething) operations.push({ type: 'crop', left: r.x, top: r.y, width: r.w, height: r.h });
  if (circle) operations.push({ type: 'circle' });
  if (outW !== '' && outH !== '' && outW > 0 && outH > 0) {
    operations.push({ type: 'resize', width: outW, height: outH, fit: 'cover', kernel: 'lanczos3', position: 'centre', withoutEnlargement: false });
  }

  const settings = (
    <>
      <div className="space-y-1.5">
        <span className="block text-sm font-medium">Rotate & flip</span>
        <div className="grid grid-cols-4 gap-1.5">
          <Button size="sm" aria-label="Rotate left 90°" title="Rotate left" onClick={() => setRotation(((rotation + 270) % 360) as Rotation)}>
            <RotateCcwSquare className="size-4" aria-hidden="true" />
          </Button>
          <Button size="sm" aria-label="Rotate right 90°" title="Rotate right" onClick={() => setRotation(((rotation + 90) % 360) as Rotation)}>
            <RotateCwSquare className="size-4" aria-hidden="true" />
          </Button>
          <Button size="sm" aria-label="Flip horizontally" aria-pressed={flipH} title="Flip horizontal" onClick={() => setFlipH(!flipH)} className={flipH ? 'border-accent text-accent' : ''}>
            <FlipHorizontal2 className="size-4" aria-hidden="true" />
          </Button>
          <Button size="sm" aria-label="Flip vertically" aria-pressed={flipV} title="Flip vertical" onClick={() => setFlipV(!flipV)} className={flipV ? 'border-accent text-accent' : ''}>
            <FlipVertical2 className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      <SelectField label="Aspect ratio" value={aspectKey} onChange={setAspectKey} options={ASPECTS} />
      {aspectKey === 'custom' && (
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Ratio width" value={customW} onChange={setCustomW} min={1} />
          <NumberField label="Ratio height" value={customH} onChange={setCustomH} min={1} />
        </div>
      )}
      <Switch label="Circle crop" checked={circle} onChange={setCircle} hint="Corners become transparent (PNG, WebP or AVIF)." />

      <details>
        <summary className="cursor-pointer text-sm font-medium">Exact position & size</summary>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <NumberField label="X" value={r.x} onChange={(v) => v !== '' && setExact({ x: v })} min={0} suffix="px" />
          <NumberField label="Y" value={r.y} onChange={(v) => v !== '' && setExact({ y: v })} min={0} suffix="px" />
          <NumberField label="Width" value={r.w} onChange={(v) => v !== '' && !aspect && setExact({ w: v })} min={1} suffix="px" disabled={Boolean(aspect)} />
          <NumberField label="Height" value={r.h} onChange={(v) => v !== '' && !aspect && setExact({ h: v })} min={1} suffix="px" disabled={Boolean(aspect)} />
        </div>
        {aspect && <p className="mt-2 text-xs text-ink-muted">Width and height follow the aspect ratio; choose “Free” to type them.</p>}
      </details>

      <details>
        <summary className="cursor-pointer text-sm font-medium">Output size (optional)</summary>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <NumberField label="Width" value={outW} onChange={setOutW} min={1} suffix="px" />
          <NumberField label="Height" value={outH} onChange={setOutH} min={1} suffix="px" />
        </div>
        <p className="mt-2 text-xs text-ink-muted">Resize the cropped area to exactly this size.</p>
      </details>

      <Button size="sm" variant="ghost" onClick={resetAll}>
        <RotateCcw className="size-3.5" aria-hidden="true" /> Reset crop
      </Button>

      <div className="border-t border-line pt-4">
        <OutputSettings value={output} onChange={setOutput} images={img ? [img] : []} producesAlpha={circle} />
      </div>
    </>
  );

  return (
    <ToolShell
      multi={false}
      settings={settings}
      runLabel="Crop image"
      running={runner.state.phase === 'starting' || runner.state.phase === 'running'}
      disabledReason={operations.length === 0 ? 'Move the crop box, rotate or flip to make a change.' : null}
      onRun={() => img && void runner.run([img.id], operations, finalizeOutput(output, [img], circle))}
      preview={
        img && (
          <div className="space-y-2">
            <CropArea img={img} rotation={rotation} flipH={flipH} flipV={flipV} aspect={aspect} circle={circle} rect={rect} onRect={setRect} />
            <p className="text-center text-xs text-ink-muted">
              Selection: {r.w} × {r.h} px of {size.w} × {size.h} px
            </p>
          </div>
        )
      }
      results={<ResultsPanel state={runner.state} onRetry={(id) => void runner.retry(id)} onCancel={(id) => void runner.cancel(id)} compare={false} />}
    />
  );
}
