import exifReader from 'exif-reader';
import sharp from 'sharp';

type ExifTags = Record<string, unknown>;

/** Convert EXIF values into JSON-safe values (Buffers summarised, Dates to ISO). */
function jsonSafe(value: unknown): unknown {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (Buffer.isBuffer(value)) return `<${value.length} bytes>`;
  if (Array.isArray(value)) return value.length > 32 ? `<array of ${value.length}>` : value.map(jsonSafe);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, jsonSafe(v)]));
  }
  if (typeof value === 'string') return value.replace(/\0+$/, '').slice(0, 500);
  return value;
}

export interface ImageMetadataReport {
  format: string | undefined;
  width: number;
  height: number;
  /** Size as displayed, after applying EXIF orientation. */
  displayWidth: number;
  displayHeight: number;
  orientation: number | null;
  channels: number | undefined;
  hasAlpha: boolean;
  colorSpace: string | undefined;
  bitDepth: string | undefined;
  density: number | null;
  isProgressive: boolean;
  hasIccProfile: boolean;
  pages: number;
  exif: Record<string, unknown> | null;
  containsGpsLocation: boolean;
}

/** Full metadata report for the Metadata Viewer and Format Checker tools. */
export async function readMetadataReport(input: Buffer, maxInputPixels: number): Promise<ImageMetadataReport> {
  const m = await sharp(input, { limitInputPixels: maxInputPixels }).metadata();
  let exif: Record<string, unknown> | null = null;
  if (m.exif) {
    try {
      const parsed = exifReader(m.exif) as unknown as ExifTags;
      const { bigEndian: _be, ThumbnailTags: _thumb, ...rest } = parsed;
      exif = jsonSafe(rest) as Record<string, unknown>;
    } catch {
      exif = { error: 'EXIF data is present but could not be parsed.' };
    }
  }
  return {
    format: m.format,
    width: m.width,
    height: m.height,
    displayWidth: m.autoOrient.width,
    displayHeight: m.autoOrient.height,
    orientation: m.orientation ?? null,
    channels: m.channels,
    hasAlpha: Boolean(m.hasAlpha),
    colorSpace: m.space,
    bitDepth: m.depth,
    density: m.density ?? null,
    isProgressive: Boolean(m.isProgressive),
    hasIccProfile: Boolean(m.icc),
    pages: m.pages ?? 1,
    exif,
    containsGpsLocation: Boolean(exif && 'GPSInfo' in exif && exif.GPSInfo && Object.keys(exif.GPSInfo).length > 0),
  };
}

const IFD0_KEEP = ['Make', 'Model', 'Artist', 'Copyright', 'ImageDescription', 'Software'] as const;
const EXIF_KEEP = ['DateTimeOriginal', 'LensModel'] as const;

function exifString(v: unknown): string | undefined {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${v.getUTCFullYear()}:${p(v.getUTCMonth() + 1)}:${p(v.getUTCDate())} ${p(v.getUTCHours())}:${p(v.getUTCMinutes())}:${p(v.getUTCSeconds())}`;
  }
  if (typeof v === 'string') return v.replace(/\0+$/, '').slice(0, 200) || undefined;
  return undefined;
}

/**
 * Safe subset of EXIF to carry into the output when the user asks to keep
 * metadata: camera, author and capture date. GPS location and the embedded
 * thumbnail are never copied, and orientation is not needed because pixels
 * are already rotated.
 */
export function safeExifSubset(exifBuffer: Buffer | undefined): { IFD0?: Record<string, string>; IFD2?: Record<string, string> } | null {
  if (!exifBuffer) return null;
  try {
    const parsed = exifReader(exifBuffer) as unknown as { Image?: ExifTags; Photo?: ExifTags };
    const pick = (src: ExifTags | undefined, keys: readonly string[]) => {
      const out: Record<string, string> = {};
      for (const k of keys) {
        const s = exifString(src?.[k]);
        if (s) out[k] = s;
      }
      return Object.keys(out).length ? out : undefined;
    };
    const IFD0 = pick(parsed.Image, IFD0_KEEP);
    const IFD2 = pick(parsed.Photo, EXIF_KEEP);
    return IFD0 || IFD2 ? { ...(IFD0 && { IFD0 }), ...(IFD2 && { IFD2 }) } : null;
  } catch {
    return null;
  }
}
