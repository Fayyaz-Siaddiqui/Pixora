/**
 * Pure dimension math shared by the browser (live UI feedback) and the
 * server (authoritative processing). No I/O, no image decoding.
 */

export type FitMode =
  /** Scale to fit inside the box; output is the scaled size (no padding). */
  | 'inside'
  /** Scale to fit inside the box, then pad to exactly width x height with a background. */
  | 'contain'
  /** Scale to cover the box, then crop to exactly width x height. */
  | 'cover'
  /** Force exactly width x height, ignoring aspect ratio (distorts the image). */
  | 'stretch';

export interface Size {
  width: number;
  height: number;
}

export interface ResizeRequest {
  /** Target width in pixels. */
  width?: number;
  /** Target height in pixels. */
  height?: number;
  /** Uniform scale percentage (e.g. 50 = half size). Mutually exclusive with width/height. */
  percent?: number;
  /** How to reconcile width + height when both are given. Default: 'inside'. */
  fit?: FitMode;
  /**
   * Never make an image larger than its original ('inside' fit only: one-side,
   * percentage or proportional sizing). Smaller images are left at their size.
   */
  withoutEnlargement?: boolean;
}

export interface ResizePlan {
  /** Final output canvas size. */
  output: Size;
  /** Size the source pixels are resampled to before padding/cropping. */
  scaled: Size;
  fit: FitMode;
  /** True if any axis is enlarged beyond the source resolution. */
  isUpscale: boolean;
  /**
   * Relative aspect-ratio distortion of the image content (0 = none).
   * Only non-zero for 'stretch'. 0.1 means the content is stretched 10%.
   */
  distortion: number;
}

export interface DimensionLimits {
  /** Max width or height of the output, in pixels. */
  maxDimension: number;
  /** Max total output pixels (width x height). */
  maxPixels: number;
}

export const DEFAULT_LIMITS: DimensionLimits = {
  maxDimension: 16_384,
  maxPixels: 100_000_000,
};

export class DimensionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DimensionError';
  }
}

function assertPositiveInt(value: number, label: string): void {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
    throw new DimensionError(`${label} must be a whole number of at least 1 pixel.`);
  }
}

const roundPx = (n: number): number => Math.max(1, Math.round(n));

/**
 * When the aspect ratio is locked and the user edits one side, compute the
 * other side so the proportions of the source are preserved.
 */
export function linkedDimension(source: Size, changed: 'width' | 'height', value: number): Size {
  assertPositiveInt(source.width, 'Source width');
  assertPositiveInt(source.height, 'Source height');
  assertPositiveInt(value, changed === 'width' ? 'Width' : 'Height');
  return changed === 'width'
    ? { width: value, height: roundPx((value * source.height) / source.width) }
    : { width: roundPx((value * source.width) / source.height), height: value };
}

/**
 * Turn a user's resize request into exact pixel sizes, validating limits.
 * The server uses the same function, so the UI preview and the real output
 * always agree.
 */
export function planResize(
  source: Size,
  request: ResizeRequest,
  limits: DimensionLimits = DEFAULT_LIMITS,
): ResizePlan {
  assertPositiveInt(source.width, 'Source width');
  assertPositiveInt(source.height, 'Source height');

  const fit: FitMode = request.fit ?? 'inside';
  let scaled: Size;
  let output: Size;

  if (request.percent !== undefined) {
    if (request.width !== undefined || request.height !== undefined) {
      throw new DimensionError('Use either a percentage or pixel dimensions, not both.');
    }
    if (!Number.isFinite(request.percent) || request.percent <= 0) {
      throw new DimensionError('Percentage must be greater than 0.');
    }
    const f = request.percent / 100;
    scaled = { width: roundPx(source.width * f), height: roundPx(source.height * f) };
    output = scaled;
  } else if (request.width !== undefined && request.height !== undefined) {
    assertPositiveInt(request.width, 'Width');
    assertPositiveInt(request.height, 'Height');
    const box = { width: request.width, height: request.height };
    const sx = box.width / source.width;
    const sy = box.height / source.height;
    switch (fit) {
      case 'inside': {
        const s = Math.min(sx, sy);
        scaled = { width: roundPx(source.width * s), height: roundPx(source.height * s) };
        output = scaled;
        break;
      }
      case 'contain': {
        const s = Math.min(sx, sy);
        scaled = {
          width: Math.min(box.width, roundPx(source.width * s)),
          height: Math.min(box.height, roundPx(source.height * s)),
        };
        output = box;
        break;
      }
      case 'cover': {
        const s = Math.max(sx, sy);
        scaled = {
          width: Math.max(box.width, roundPx(source.width * s)),
          height: Math.max(box.height, roundPx(source.height * s)),
        };
        output = box;
        break;
      }
      case 'stretch':
        scaled = box;
        output = box;
        break;
    }
  } else if (request.width !== undefined) {
    scaled = linkedDimension(source, 'width', request.width);
    output = scaled;
  } else if (request.height !== undefined) {
    scaled = linkedDimension(source, 'height', request.height);
    output = scaled;
  } else {
    throw new DimensionError('Provide a width, a height, or a percentage.');
  }

  if (request.withoutEnlargement && fit === 'inside' && (scaled.width > source.width || scaled.height > source.height)) {
    scaled = { width: source.width, height: source.height };
    output = scaled;
  }

  for (const s of [scaled, output]) {
    if (s.width > limits.maxDimension || s.height > limits.maxDimension) {
      throw new DimensionError(
        `Output would be ${s.width}x${s.height}px; the maximum side length is ${limits.maxDimension}px.`,
      );
    }
    if (s.width * s.height > limits.maxPixels) {
      throw new DimensionError(
        `Output would be ${(s.width * s.height / 1e6).toFixed(1)} megapixels; the limit is ${(limits.maxPixels / 1e6).toFixed(0)} megapixels.`,
      );
    }
  }

  const sourceAspect = source.width / source.height;
  const scaledAspect = scaled.width / scaled.height;
  const distortion = fit === 'stretch' && request.percent === undefined
    ? Math.abs(scaledAspect / sourceAspect - 1)
    : 0;

  return {
    output,
    scaled,
    fit,
    isUpscale: scaled.width > source.width || scaled.height > source.height,
    distortion,
  };
}
