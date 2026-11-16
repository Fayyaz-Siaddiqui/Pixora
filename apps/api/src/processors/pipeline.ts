import sharp, { type Sharp } from 'sharp';
import { ErrorCode, type Operation, type ResizeOp } from '@app/shared';
import { planResize, type DimensionLimits } from '@app/image-core';
import { applyAdjust } from './adjust';
import { ProcessingError, classifySharpError } from './errors';

/**
 * Decoded image held as raw 8-bit sRGB(A) pixels between operations.
 *
 * Why raw: libvips reorders chained operations into its own fixed order
 * (rotate -> extract -> resize ...), but users expect steps to apply in the
 * order they chose. Materialising raw pixels between steps keeps the exact
 * order, is lossless, and the image is still encoded only ONCE at the end.
 */
export interface RawImage {
  data: Buffer;
  width: number;
  height: number;
  channels: 3 | 4;
}

export interface PipelineOptions {
  maxInputPixels: number;
  limits: DimensionLimits;
  /** Wall-clock budget for the whole pipeline. */
  timeoutSeconds: number;
  onProgress?: (fraction: number) => void | Promise<void>;
}

type Rgba = { r: number; g: number; b: number; alpha: number };

export function parseHex(hex: string): Rgba {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
    alpha: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
  };
}

const TRANSPARENT: Rgba = { r: 0, g: 0, b: 0, alpha: 0 };

export function fromRaw(raw: RawImage): Sharp {
  return sharp(raw.data, {
    raw: { width: raw.width, height: raw.height, channels: raw.channels },
    limitInputPixels: false,
  });
}

async function toRaw(img: Sharp): Promise<RawImage> {
  const { data, info } = await img.raw({ depth: 'uchar' }).toBuffer({ resolveWithObject: true });
  if (info.channels !== 3 && info.channels !== 4) {
    throw new ProcessingError(ErrorCode.PROCESSING_FAILED, `Unexpected channel count ${info.channels}.`);
  }
  return { data, width: info.width, height: info.height, channels: info.channels };
}

/**
 * Decode the original: apply EXIF orientation, convert to sRGB 8-bit, and
 * reject decompression bombs via the pixel limit (checked from the header
 * before decoding).
 */
export async function decode(input: Buffer, maxInputPixels: number, timeoutSeconds: number): Promise<RawImage> {
  try {
    // toColourspace('srgb') also expands greyscale (1-2 channels) to RGB(A)
    // and converts CMYK / wide-gamut sources using their embedded profile.
    const img = sharp(input, { limitInputPixels: maxInputPixels, failOn: 'error', animated: false })
      .timeout({ seconds: timeoutSeconds })
      .autoOrient()
      .toColourspace('srgb');
    return await toRaw(img);
  } catch (err) {
    throw classifySharpError(err);
  }
}

function resizeStep(raw: RawImage, op: ResizeOp, limits: DimensionLimits): Sharp | null {
  const plan = planResize(
    { width: raw.width, height: raw.height },
    { width: op.width, height: op.height, percent: op.percent, fit: op.fit, withoutEnlargement: op.withoutEnlargement },
    limits,
  );
  // Nothing to do (e.g. withoutEnlargement kept a small image as is): skip resampling entirely.
  if ((op.fit === 'inside' || op.fit === 'stretch') && plan.output.width === raw.width && plan.output.height === raw.height) return null;
  const kernel = sharp.kernel[op.kernel];
  let img = fromRaw(raw);

  switch (op.fit) {
    case 'inside':
    case 'stretch':
      // The plan already computed exact dimensions (aspect preserved for 'inside').
      return img.resize(plan.output.width, plan.output.height, { fit: 'fill', kernel });
    case 'contain': {
      const background = op.background ? parseHex(op.background) : TRANSPARENT;
      if (!op.background || background.alpha < 1) img = img.ensureAlpha();
      return img.resize(plan.output.width, plan.output.height, { fit: 'contain', kernel, background });
    }
    case 'cover': {
      const position =
        op.position === 'attention' ? sharp.strategy.attention :
        op.position === 'entropy' ? sharp.strategy.entropy :
        op.position;
      return img.resize(plan.output.width, plan.output.height, { fit: 'cover', kernel, position });
    }
  }
}

async function applyOperation(raw: RawImage, op: Operation, opts: PipelineOptions, secondsLeft: number): Promise<RawImage> {
  const t = { seconds: Math.max(1, Math.floor(secondsLeft)) };

  switch (op.type) {
    case 'adjust':
      applyAdjust(raw.data, raw.channels, op);
      return raw;

    case 'resize': {
      const step = resizeStep(raw, op, opts.limits);
      return step ? toRaw(step.timeout(t)) : raw;
    }

    case 'crop':
      if (op.left + op.width > raw.width || op.top + op.height > raw.height) {
        throw new ProcessingError(ErrorCode.INVALID_DIMENSIONS, 'The crop area is outside the image.');
      }
      return toRaw(fromRaw(raw).extract(op).timeout(t));

    case 'circle': {
      const { width: w, height: h } = raw;
      const mask = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2}" ry="${h / 2}" fill="#fff"/></svg>`,
      );
      // Materialise alpha first so the mask composites onto an RGBA image.
      const withAlpha = await toRaw(fromRaw(raw).ensureAlpha());
      return toRaw(fromRaw(withAlpha).composite([{ input: mask, blend: 'dest-in' }]).timeout(t));
    }

    case 'rotate': {
      const angle = ((op.angle % 360) + 360) % 360;
      if (angle === 0) return raw;
      if (angle % 90 === 0) return toRaw(fromRaw(raw).rotate(angle).timeout(t));
      const background = op.background ? parseHex(op.background) : TRANSPARENT;
      let img = fromRaw(raw);
      if (background.alpha < 1) img = fromRaw(await toRaw(img.ensureAlpha()));
      return toRaw(img.rotate(angle, { background }).timeout(t));
    }

    case 'flip': {
      let img = fromRaw(raw);
      if (op.vertical) img = img.flip();
      if (op.horizontal) img = img.flop();
      return toRaw(img.timeout(t));
    }

    case 'sharpen':
      return toRaw(fromRaw(raw).sharpen({ sigma: op.sigma, m1: 1, m2: op.amount }).timeout(t));

    case 'denoise':
      return toRaw(fromRaw(raw).median(op.size).timeout(t));

    case 'blur':
      return toRaw(fromRaw(raw).blur(op.sigma).timeout(t));

    case 'background':
      if (raw.channels === 3) return raw;
      return toRaw(fromRaw(raw).flatten({ background: parseHex(op.color) }).timeout(t));
  }
}

/** Decode the original and apply every operation in order. */
export async function runPipeline(input: Buffer, operations: Operation[], opts: PipelineOptions): Promise<RawImage> {
  const deadline = Date.now() + opts.timeoutSeconds * 1000;
  const secondsLeft = () => {
    const s = (deadline - Date.now()) / 1000;
    if (s <= 0) {
      throw new ProcessingError(ErrorCode.PROCESSING_TIMEOUT, 'Processing took too long and was stopped. Try a smaller image or fewer steps.');
    }
    return s;
  };

  let raw = await decode(input, opts.maxInputPixels, opts.timeoutSeconds);
  const steps = operations.length + 1;
  await opts.onProgress?.(1 / (steps + 1));

  for (const [i, op] of operations.entries()) {
    try {
      raw = await applyOperation(raw, op, opts, secondsLeft());
    } catch (err) {
      throw classifySharpError(err);
    }
    if (raw.width > opts.limits.maxDimension || raw.height > opts.limits.maxDimension || raw.width * raw.height > opts.limits.maxPixels) {
      throw new ProcessingError(ErrorCode.INVALID_DIMENSIONS, 'The result would exceed the maximum allowed size.');
    }
    await opts.onProgress?.((i + 2) / (steps + 1));
  }
  return raw;
}
