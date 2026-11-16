'use client';

import { useState } from 'react';
import { finalizeOutput, OutputSettings } from '@/components/tools/output-settings';
import { ResultsPanel } from '@/components/tools/results-panel';
import { ToolShell } from '@/components/tools/tool-shell';
import { useJobRunner } from '@/hooks/use-job-runner';
import type { OutputDraft } from '@/lib/types';
import { useSelectedImages } from '@/stores/workspace';

export function CompressorTool() {
  const images = useSelectedImages();
  const runner = useJobRunner();
  const [output, setOutput] = useState<OutputDraft>({ preset: 'balanced' });

  return (
    <ToolShell
      multi
      runLabel="Compress"
      running={runner.state.phase === 'starting' || runner.state.phase === 'running'}
      onRun={() => void runner.run(images.map((i) => i.id), [], finalizeOutput(output, images))}
      settings={
        <>
          <p className="text-sm text-ink-muted">
            Smaller files with the same dimensions. Compare the result with the slider before downloading.
          </p>
          <OutputSettings value={output} onChange={setOutput} images={images} showTargetSize />
        </>
      }
      results={<ResultsPanel state={runner.state} onRetry={(id) => void runner.retry(id)} onCancel={(id) => void runner.cancel(id)} />}
    />
  );
}
