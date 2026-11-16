'use client';

import type { OutputFormat } from '@app/image-core';
import { ColorField, Notice, NumberField, Segmented, SelectField, Slider, Switch } from '@/components/ui/controls';
import type { Asset, OutputDraft } from '@/lib/types';

const FORMAT_OPTIONS: { value: OutputFormat | 'keep'; label: string }[] = [
  { value: 'keep', label: 'Same as original' },
  { value: 'jpeg', label: 'JPG' },
  { value: 'png', label: 'PNG' },
  { value: 'webp', label: 'WebP' },
  { value: 'avif', label: 'AVIF' },
];

/** Effective output format for one image, mirroring the server's rule. */
export function effectiveFormat(img: Asset, format: OutputFormat | undefined): OutputFormat {
  if (format) return format;
  if (['jpeg', 'png', 'webp', 'avif'].includes(img.format)) return img.format as OutputFormat;
  return img.hasAlpha ? 'png' : 'jpeg';
}

/** True when some selected image would lose transparency with these settings. */
export function needsBackground(images: Asset[], draft: OutputDraft, producesAlpha = false): boolean {
  if (draft.background) return false;
  return images.some((i) => (i.hasAlpha || producesAlpha) && effectiveFormat(i, draft.format) === 'jpeg');
}

export function OutputSettings({
  value,
  onChange,
  images,
  showFormat = true,
  allowKeep = true,
  showQuality = true,
  showTargetSize = false,
  producesAlpha = false,
}: {
  value: OutputDraft;
  onChange: (v: OutputDraft) => void;
  images: Asset[];
  showFormat?: boolean;
  allowKeep?: boolean;
  showQuality?: boolean;
  showTargetSize?: boolean;
  /** The operations add transparency (e.g. circle crop, transparent padding). */
  producesAlpha?: boolean;
}) {
  const set = (patch: Partial<OutputDraft>) => onChange({ ...value, ...patch });
  const preset = value.preset ?? 'balanced';
  const formats = images.map((i) => effectiveFormat(i, value.format));
  const allPng = formats.length > 0 && formats.every((f) => f === 'png');
  const anyAlpha = images.some((i) => i.hasAlpha) || producesAlpha;
  const jpegTarget = formats.some((f) => f === 'jpeg');
  const needsBg = anyAlpha && jpegTarget;

  return (
    <div className="space-y-4">
      {showFormat && (
        <SelectField
          label="Output format"
          value={value.format ?? 'keep'}
          onChange={(f) => set({ format: f === 'keep' ? undefined : f })}
          options={allowKeep ? FORMAT_OPTIONS : FORMAT_OPTIONS.filter((o) => o.value !== 'keep')}
          hint={value.format === 'avif' ? 'AVIF gives the smallest files; encoding is slower.' : undefined}
        />
      )}

      {showQuality && (
        <>
          <Segmented
            label="Quality"
            value={preset}
            onChange={(p) => set({ preset: p, quality: p === 'custom' ? (value.quality ?? 80) : undefined })}
            options={[
              { value: 'best', label: 'Best', title: 'Highest quality, larger files' },
              { value: 'balanced', label: 'Balanced', title: 'Good quality, smaller files' },
              { value: 'smallest', label: 'Smallest', title: 'Smallest files, visible quality loss possible' },
              { value: 'custom', label: 'Custom' },
            ]}
          />
          {preset === 'custom' && !allPng && (
            <Slider label="Quality level" value={value.quality ?? 80} min={1} max={100} onChange={(q) => set({ quality: q })} />
          )}
          {allPng && (
            <p className="text-xs text-ink-muted">
              PNG is lossless. “Smallest” reduces the colour palette, which is lossy but often invisible on graphics.
            </p>
          )}
        </>
      )}

      {showTargetSize && (
        <NumberField
          label="Target file size (optional)"
          value={value.targetSizeKB ?? ''}
          onChange={(v) => set({ targetSizeKB: v === '' || v <= 0 ? undefined : Math.round(v) })}
          min={1}
          suffix="KB"
          placeholder="e.g. 200"
          hint={allPng ? 'Not available for PNG (lossless). Choose JPG, WebP or AVIF.' : 'We find the highest quality under this size. If it can’t be reached without poor quality, we tell you.'}
          disabled={allPng}
        />
      )}

      {anyAlpha && (jpegTarget || value.background) && (
        <ColorField
          label="Background for transparent areas"
          value={value.background ?? '#ffffff'}
          onChange={(c) => set({ background: c })}
          hint="JPG cannot store transparency, so transparent areas are filled with this colour."
        />
      )}
      {needsBg && (
        <Notice tone="warn">
          Some images have transparent areas and JPG can’t keep them. They will be filled with the colour above. Choose PNG, WebP or AVIF to keep transparency.
        </Notice>
      )}

      <Switch
        label="Keep photo details (EXIF)"
        checked={value.keepMetadata ?? false}
        onChange={(v) => set({ keepMetadata: v })}
        hint="Camera, author and date. GPS location is always removed."
      />
    </div>
  );
}

/** Make the draft sendable: fill the JPG background explicitly when the user saw the default. */
export function finalizeOutput(draft: OutputDraft, images: Asset[], producesAlpha = false): OutputDraft {
  const anyAlpha = images.some((i) => i.hasAlpha) || producesAlpha;
  const jpeg = images.some((i) => effectiveFormat(i, draft.format) === 'jpeg');
  if (anyAlpha && jpeg && !draft.background) return { ...draft, background: '#ffffff' };
  return draft;
}
