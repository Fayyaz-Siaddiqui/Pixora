export const OUTPUT_FORMATS = ['jpeg', 'png', 'webp', 'avif'] as const;
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

export interface FormatInfo {
  id: OutputFormat;
  label: string;
  mime: string;
  extension: string;
  supportsAlpha: boolean;
  lossy: boolean;
}

export const FORMATS: Record<OutputFormat, FormatInfo> = {
  jpeg: { id: 'jpeg', label: 'JPEG', mime: 'image/jpeg', extension: 'jpg', supportsAlpha: false, lossy: true },
  png: { id: 'png', label: 'PNG', mime: 'image/png', extension: 'png', supportsAlpha: true, lossy: false },
  webp: { id: 'webp', label: 'WebP', mime: 'image/webp', extension: 'webp', supportsAlpha: true, lossy: true },
  avif: { id: 'avif', label: 'AVIF', mime: 'image/avif', extension: 'avif', supportsAlpha: true, lossy: true },
};

export function isOutputFormat(value: string): value is OutputFormat {
  return (OUTPUT_FORMATS as readonly string[]).includes(value);
}

export type ConversionCheck =
  | { ok: true; flattensTransparency: false }
  | { ok: true; flattensTransparency: true; requiresBackground: true }
  | { ok: false; reason: string };

/**
 * Decide whether a conversion is safe. Converting a transparent image to a
 * format without alpha is only allowed when the user explicitly picks a
 * background colour, so transparency is never removed silently.
 */
export function checkConversion(
  sourceHasAlpha: boolean,
  target: OutputFormat,
  background?: string,
): ConversionCheck {
  if (!sourceHasAlpha || FORMATS[target].supportsAlpha) {
    return { ok: true, flattensTransparency: false };
  }
  if (!background) {
    return {
      ok: false,
      reason: `${FORMATS[target].label} does not support transparency. Choose a background colour or use PNG, WebP or AVIF.`,
    };
  }
  return { ok: true, flattensTransparency: true, requiresBackground: true };
}
