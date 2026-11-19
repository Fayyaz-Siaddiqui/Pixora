'use client';

import { useState } from 'react';
import { FORMATS, OUTPUT_FORMATS, type OutputFormat } from '@app/image-core';
import { finalizeOutput, OutputSettings } from '@/components/tools/output-settings';
import { ResultsPanel } from '@/components/tools/results-panel';
import { ToolShell } from '@/components/tools/tool-shell';
import { Notice } from '@/components/ui/controls';
import { useJobRunner } from '@/hooks/use-job-runner';
import { cx, formatLabel } from '@/lib/format';
import type { OutputDraft } from '@/lib/types';
import { useSelectedImages } from '@/stores/workspace';

const BLURB: Record<OutputFormat, string> = {
  jpeg: 'Opens everywhere. Best for photos. No transparency.',
  png: 'Opens everywhere, keeps transparency. Larger files.',
  webp: 'Smaller files for websites. Some Windows apps can’t open it.',
  avif: 'Smallest files for websites. Many Windows apps can’t open it.',
};

/** Formats that every computer and phone opens with a double-click. */
const OPENS_EVERYWHERE: OutputFormat[] = ['jpeg', 'png'];

export function ConverterTool() {
  const images = useSelectedImages();
  const runner = useJobRunner();
  const [chosen, setOutput] = useState<OutputDraft>({ preset: 'balanced' });
  // Until the user picks one: JPG (opens everywhere), or PNG when an image has transparency.
  const defaultFormat: OutputFormat = images.some((i) => i.hasAlpha) ? 'png' : 'jpeg';
  const output: OutputDraft = { ...chosen, format: chosen.format ?? defaultFormat };
  const webFormat = !OPENS_EVERYWHERE.includes(output.format as OutputFormat);

  return (
    <ToolShell
      multi
      runLabel={`Convert to ${formatLabel(output.format ?? defaultFormat)}`}
      running={runner.state.phase === 'starting' || runner.state.phase === 'running'}
      onRun={() => void runner.run(images.map((i) => i.id), [], finalizeOutput(output, images))}
      settings={
        <>
          <fieldset className="space-y-1.5">
            <legend className="mb-1.5 text-sm font-medium">Convert to</legend>
            <div className="grid grid-cols-2 gap-2">
              {OUTPUT_FORMATS.map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={output.format === f}
                  onClick={() => setOutput({ ...output, format: f })}
                  className={cx(
                    'rounded-ctl border px-3 py-2 text-left transition-colors',
                    output.format === f ? 'border-accent bg-accent-soft' : 'border-line hover:border-ink-muted/50',
                  )}
                >
                  <span className="block text-sm font-semibold">{FORMATS[f].label}</span>
                  <span className="block text-xs text-ink-muted">{BLURB[f]}</span>
                </button>
              ))}
            </div>
          </fieldset>
          {webFormat && (
            <Notice>
              {formatLabel(output.format!)} is made for websites. If you want to open the file by double-clicking it on Windows, choose JPG or PNG.
            </Notice>
          )}
          <OutputSettings value={output} onChange={setOutput} images={images} showFormat={false} />
        </>
      }
      results={<ResultsPanel state={runner.state} onRetry={(id) => void runner.retry(id)} onCancel={(id) => void runner.cancel(id)} />}
    />
  );
}
