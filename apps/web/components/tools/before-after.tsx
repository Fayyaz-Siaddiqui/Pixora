'use client';

import { useId, useState, type ReactNode } from 'react';

/**
 * Drag the divider to compare. `before` and `after` are rendered on top of
 * each other in the same box, so differences in quality are easy to see.
 */
export function BeforeAfter({
  before,
  after,
  aspect,
  beforeLabel = 'Original',
  afterLabel = 'Result',
}: {
  before: ReactNode;
  after: ReactNode;
  /** width / height of the box. */
  aspect: number;
  beforeLabel?: string;
  afterLabel?: string;
}) {
  const [pos, setPos] = useState(50);
  const id = useId();
  return (
    <div className="checkerboard relative w-full overflow-hidden rounded-ctl border border-line" style={{ aspectRatio: String(aspect) }}>
      <div className="absolute inset-0">{after}</div>
      <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        {before}
      </div>
      <div className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.25)]" style={{ left: `${pos}%` }}>
        <span className="absolute top-1/2 left-1/2 grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-xs font-bold text-black shadow">
          ⇆
        </span>
      </div>
      <span className="pointer-events-none absolute top-2 left-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">{beforeLabel}</span>
      <span className="pointer-events-none absolute top-2 right-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">{afterLabel}</span>
      <label htmlFor={id} className="sr-only">
        Comparison position
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        value={pos}
        onChange={(e) => setPos(Number(e.target.value))}
        className="absolute inset-0 size-full cursor-ew-resize opacity-0"
      />
    </div>
  );
}
