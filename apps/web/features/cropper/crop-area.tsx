'use client';

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { fileUrl } from '@/lib/api';
import { cx } from '@/lib/format';
import type { Asset } from '@/lib/types';

/** Crop rectangle in pixels of the image AFTER flip + rotation (what the server crops). */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Rotation = 0 | 90 | 180 | 270;
type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const MIN = 8;
const MAX_VIEW_HEIGHT = 460;

export function rotatedSize(img: Asset, rotation: Rotation) {
  return rotation % 180 === 0 ? { w: img.width, h: img.height } : { w: img.height, h: img.width };
}

/** Largest centred rectangle with the given aspect ratio (or the whole image). */
export function initialRect(W: number, H: number, aspect: number | null): Rect {
  if (!aspect) return { x: 0, y: 0, w: W, h: H };
  let w = W;
  let h = W / aspect;
  if (h > H) {
    h = H;
    w = H * aspect;
  }
  return { x: (W - w) / 2, y: (H - h) / 2, w, h };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function resize(start: Rect, handle: Handle, dx: number, dy: number, W: number, H: number, aspect: number | null): Rect {
  if (!aspect) {
    let { x, y, w, h } = start;
    if (handle.includes('w')) {
      const nx = clamp(x + dx, 0, x + w - MIN);
      w = x + w - nx;
      x = nx;
    }
    if (handle.includes('e')) w = clamp(w + dx, MIN, W - x);
    if (handle.includes('n')) {
      const ny = clamp(y + dy, 0, y + h - MIN);
      h = y + h - ny;
      y = ny;
    }
    if (handle.includes('s')) h = clamp(h + dy, MIN, H - y);
    return { x, y, w, h };
  }
  // Fixed ratio: corners only, anchored at the opposite corner.
  const east = handle.includes('e');
  const south = handle.includes('s');
  const ax = east ? start.x : start.x + start.w;
  const ay = south ? start.y : start.y + start.h;
  const w0 = east ? start.w + dx : start.w - dx;
  const h0 = south ? start.h + dy : start.h - dy;
  const maxW = east ? W - ax : ax;
  const maxH = south ? H - ay : ay;
  let w = Math.max(w0, h0 * aspect);
  w = clamp(w, Math.max(MIN, MIN * aspect), Math.min(maxW, maxH * aspect));
  const h = w / aspect;
  return { x: east ? ax : ax - w, y: south ? ay : ay - h, w, h };
}

export function CropArea({
  img,
  rotation,
  flipH,
  flipV,
  aspect,
  circle,
  rect,
  onRect,
}: {
  img: Asset;
  rotation: Rotation;
  flipH: boolean;
  flipV: boolean;
  aspect: number | null;
  circle: boolean;
  rect: Rect;
  onRect: (r: Rect) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(0);
  const drag = useRef<{ handle: Handle | 'move'; px: number; py: number; start: Rect } | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setContainerW(entry!.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { w: W, h: H } = rotatedSize(img, rotation);
  const s = containerW > 0 ? Math.min(containerW / W, MAX_VIEW_HEIGHT / H) : 0;
  const boxW = W * s;
  const boxH = H * s;

  const onDown = (handle: Handle | 'move') => (e: ReactPointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { handle, px: e.clientX, py: e.clientY, start: rect };
  };
  const onMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d || s === 0) return;
    const dx = (e.clientX - d.px) / s;
    const dy = (e.clientY - d.py) / s;
    if (d.handle === 'move') {
      onRect({ ...d.start, x: clamp(d.start.x + dx, 0, W - d.start.w), y: clamp(d.start.y + dy, 0, H - d.start.h) });
    } else {
      onRect(resize(d.start, d.handle, dx, dy, W, H, aspect));
    }
  };
  const onUp = () => {
    drag.current = null;
  };

  const handles: Handle[] = aspect ? ['nw', 'ne', 'sw', 'se'] : ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  const handlePos: Record<Handle, string> = {
    nw: 'left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize',
    n: 'left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize',
    ne: 'right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize',
    e: 'right-0 top-1/2 translate-x-1/2 -translate-y-1/2 cursor-ew-resize',
    se: 'right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize',
    s: 'left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-ns-resize',
    sw: 'left-0 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize',
    w: 'left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize',
  };

  return (
    <div ref={wrapRef} className="w-full">
      {s > 0 && (
        <div
          className="checkerboard relative mx-auto touch-none overflow-hidden rounded-ctl select-none"
          style={{ width: boxW, height: boxH }}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          {/* Flip is applied before rotation, matching the server's operation order. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={fileUrl(img.urls.file)}
            alt={img.name}
            draggable={false}
            className="pointer-events-none absolute max-w-none"
            style={{
              width: img.width * s,
              height: img.height * s,
              left: (boxW - img.width * s) / 2,
              top: (boxH - img.height * s) / 2,
              transform: `rotate(${rotation}deg) scale(${flipH ? -1 : 1}, ${flipV ? -1 : 1})`,
            }}
          />
          <div
            role="slider"
            tabIndex={0}
            aria-label="Crop area. Use arrow keys to move; hold Shift for larger steps."
            aria-valuetext={`${Math.round(rect.w)} by ${Math.round(rect.h)} pixels at ${Math.round(rect.x)}, ${Math.round(rect.y)}`}
            onPointerDown={onDown('move')}
            onKeyDown={(e) => {
              const step = e.shiftKey ? 10 : 1;
              const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
              const m = moves[e.key];
              if (!m) return;
              e.preventDefault();
              onRect({ ...rect, x: clamp(rect.x + m[0], 0, W - rect.w), y: clamp(rect.y + m[1], 0, H - rect.h) });
            }}
            className={cx('absolute cursor-move border-2 border-white outline-offset-2', circle && 'rounded-full')}
            style={{
              left: rect.x * s,
              top: rect.y * s,
              width: rect.w * s,
              height: rect.h * s,
              boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
            }}
          >
            {/* rule-of-thirds guides */}
            <span className="pointer-events-none absolute inset-y-0 left-1/3 w-px bg-white/40" />
            <span className="pointer-events-none absolute inset-y-0 left-2/3 w-px bg-white/40" />
            <span className="pointer-events-none absolute inset-x-0 top-1/3 h-px bg-white/40" />
            <span className="pointer-events-none absolute inset-x-0 top-2/3 h-px bg-white/40" />
            {handles.map((h) => (
              <span
                key={h}
                onPointerDown={onDown(h)}
                aria-hidden="true"
                className={cx('absolute size-4 rounded-sm border-2 border-white bg-accent', handlePos[h])}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
