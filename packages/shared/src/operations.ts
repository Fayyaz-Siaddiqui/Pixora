import { z } from 'zod';
import {
  DEFAULT_LIMITS,
  DimensionError,
  OUTPUT_FORMATS,
  checkConversion,
  planResize,
  type DimensionLimits,
  type Size,
} from '@app/image-core';

/**
 * Image operations. A job is an ordered list of operations applied to the
 * ORIGINAL upload, followed by a single encode. The same schemas validate
 * requests in the API and forms in the web app.
 */

const hexColor = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, 'Colour must be #RRGGBB or #RRGGBBAA');

const px = z.number().int().min(1).max(100_000);
const signed100 = z.number().min(-100).max(100);

export const resizeOpSchema = z
  .object({
    type: z.literal('resize'),
    width: px.optional(),
    height: px.optional(),
    percent: z.number().gt(0).max(1000).optional(),
    fit: z.enum(['inside', 'contain', 'cover', 'stretch']).default('inside'),
    kernel: z.enum(['lanczos3', 'mitchell', 'cubic', 'nearest']).default('lanczos3'),
    /** Padding colour for `contain`. Omit for transparent padding. */
    background: hexColor.optional(),
    /** Which part to keep for `cover`. */
    position: z.enum(['centre', 'top', 'bottom', 'left', 'right', 'attention', 'entropy']).default('centre'),
    /** Leave images that are already smaller than the target at their original size ('inside' only). */
    withoutEnlargement: z.boolean().default(false),
  })
  .refine((o) => o.width !== undefined || o.height !== undefined || o.percent !== undefined, {
    message: 'Provide a width, a height or a percentage.',
  });

export const cropOpSchema = z.object({
  type: z.literal('crop'),
  left: z.number().int().min(0),
  top: z.number().int().min(0),
  width: px,
  height: px,
});

/** Makes everything outside the inscribed circle/ellipse transparent. */
export const circleOpSchema = z.object({ type: z.literal('circle') });

export const rotateOpSchema = z.object({
  type: z.literal('rotate'),
  angle: z.number().min(-360).max(360),
  /** Fill for the corners exposed by non-right-angle rotation. Omit for transparent. */
  background: hexColor.optional(),
});

export const flipOpSchema = z
  .object({
    type: z.literal('flip'),
    horizontal: z.boolean().default(false),
    vertical: z.boolean().default(false),
  })
  .refine((o) => o.horizontal || o.vertical, { message: 'Choose horizontal and/or vertical.' });

export const adjustOpSchema = z.object({
  type: z.literal('adjust'),
  brightness: signed100.default(0),
  contrast: signed100.default(0),
  saturation: signed100.default(0),
  /** Exposure in stops (EV). */
  exposure: z.number().min(-5).max(5).default(0),
  temperature: signed100.default(0),
  tint: signed100.default(0),
  highlights: signed100.default(0),
  shadows: signed100.default(0),
  gamma: z.number().min(0.2).max(5).default(1),
});

export const sharpenOpSchema = z.object({
  type: z.literal('sharpen'),
  /** Radius of the sharpening, in pixels (Gaussian sigma). */
  sigma: z.number().min(0.3).max(10).default(1),
  /** Strength of sharpening applied to edges. */
  amount: z.number().min(0).max(10).default(2),
});

export const denoiseOpSchema = z.object({
  type: z.literal('denoise'),
  /** Median filter window size. Larger removes more noise and more detail. */
  size: z.union([z.literal(3), z.literal(5), z.literal(7)]).default(3),
});

export const blurOpSchema = z.object({
  type: z.literal('blur'),
  sigma: z.number().min(0.3).max(100).default(3),
});

/** Replace transparency with a solid colour. */
export const backgroundOpSchema = z.object({ type: z.literal('background'), color: hexColor });

export const operationSchema = z.discriminatedUnion('type', [
  resizeOpSchema,
  cropOpSchema,
  circleOpSchema,
  rotateOpSchema,
  flipOpSchema,
  adjustOpSchema,
  sharpenOpSchema,
  denoiseOpSchema,
  blurOpSchema,
  backgroundOpSchema,
]);

export type Operation = z.infer<typeof operationSchema>;
export type ResizeOp = z.infer<typeof resizeOpSchema>;
export type AdjustOp = z.infer<typeof adjustOpSchema>;

export const outputSchema = z.object({
  format: z.enum(OUTPUT_FORMATS),
  /** best / balanced / smallest pick tuned defaults; custom uses `quality`. */
  preset: z.enum(['best', 'balanced', 'smallest', 'custom']).default('balanced'),
  quality: z.number().int().min(1).max(100).optional(),
  lossless: z.boolean().default(false),
  /** Aim for at most this size. Best effort: the result reports whether it was met. */
  targetSizeKB: z.number().int().min(1).max(100_000).optional(),
  /** Flatten transparency onto this colour (required for transparent -> JPEG). */
  background: hexColor.optional(),
  /** Keep basic camera/author EXIF fields. GPS location is always removed. */
  keepMetadata: z.boolean().default(false),
});

export type OutputOptions = z.infer<typeof outputSchema>;

export const MAX_OPERATIONS = 20;
export const operationsSchema = z.array(operationSchema).max(MAX_OPERATIONS);

export interface PipelinePlan {
  size: Size;
  hasAlpha: boolean;
}

/**
 * Dry-run a pipeline using only dimensions, so invalid requests are rejected
 * before any pixels are decoded. Throws DimensionError with a user-safe message.
 */
export function planPipeline(
  source: Size & { hasAlpha: boolean },
  operations: Operation[],
  output: OutputOptions,
  limits: DimensionLimits = DEFAULT_LIMITS,
): PipelinePlan {
  let size: Size = { width: source.width, height: source.height };
  let hasAlpha = source.hasAlpha;

  for (const op of operations) {
    switch (op.type) {
      case 'resize': {
        const plan = planResize(
          size,
          { width: op.width, height: op.height, percent: op.percent, fit: op.fit, withoutEnlargement: op.withoutEnlargement },
          limits,
        );
        size = plan.output;
        if (op.fit === 'contain' && !op.background) hasAlpha = true;
        break;
      }
      case 'crop':
        if (op.left + op.width > size.width || op.top + op.height > size.height) {
          throw new DimensionError(
            `Crop area ${op.width}x${op.height} at (${op.left}, ${op.top}) is outside the ${size.width}x${size.height} image.`,
          );
        }
        size = { width: op.width, height: op.height };
        break;
      case 'circle':
        hasAlpha = true;
        break;
      case 'rotate': {
        const a = ((op.angle % 360) + 360) % 360;
        if (a % 90 === 0) {
          if (a === 90 || a === 270) size = { width: size.height, height: size.width };
        } else {
          const r = (a * Math.PI) / 180;
          const cos = Math.abs(Math.cos(r));
          const sin = Math.abs(Math.sin(r));
          size = {
            width: Math.ceil(size.width * cos + size.height * sin),
            height: Math.ceil(size.width * sin + size.height * cos),
          };
          if (!op.background || op.background.length === 9) hasAlpha = true;
        }
        break;
      }
      case 'background':
        hasAlpha = false;
        break;
      case 'flip':
      case 'adjust':
      case 'sharpen':
      case 'denoise':
      case 'blur':
        break;
    }
    if (size.width > limits.maxDimension || size.height > limits.maxDimension || size.width * size.height > limits.maxPixels) {
      throw new DimensionError(`An intermediate step would produce ${size.width}x${size.height}px, which exceeds the limits.`);
    }
  }

  if (hasAlpha && !output.background) {
    const check = checkConversion(true, output.format);
    if (!check.ok) throw new DimensionError(check.reason);
  }
  if (output.background) hasAlpha = false;

  return { size, hasAlpha };
}
