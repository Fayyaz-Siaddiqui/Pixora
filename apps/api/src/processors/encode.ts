import type { Sharp } from 'sharp';
import { FORMATS, type OutputFormat } from '@app/image-core';
import { ErrorCode, type OutputOptions } from '@app/shared';
import { ProcessingError, classifySharpError } from './errors';
import { fromRaw, parseHex, type RawImage } from './pipeline';

type Preset = OutputOptions['preset'];

/** Tuned starting qualities. AVIF's scale is not comparable to JPEG's. */
const QUALITY: Record<OutputFormat, Record<Exclude<Preset, 'custom'>, number>> = {
  jpeg: { best: 92, balanced: 82, smallest: 65 },
  webp: { best: 90, balanced: 80, smallest: 60 },
  avif: { best: 70, balanced: 55, smallest: 40 },
  png: { best: 100, balanced: 100, smallest: 80 },
};

/** Lowest quality the target-size search will go to. Below this the result looks bad, so we stop and say so. */
const QUALITY_FLOOR: Record<'jpeg' | 'webp' | 'avif', number> = { jpeg: 30, webp: 30, avif: 20 };

export interface EncodeResult {
  data: Buffer;
  width: number;
  height: number;
  format: OutputFormat;
  mime: string;
  extension: string;
  details: {
    preset: Preset;
    quality: number | null;
    lossless: boolean;
    targetSizeKB: number | null;
    targetMet: boolean | null;
    flattenedTransparency: boolean;
    metadataKept: boolean;
    attempts: number;
  };
}

export interface EncodeOptions {
  timeoutSeconds: number;
  /** EXIF subset to embed when keepMetadata is requested. */
  exif?: { IFD0?: Record<string, string>; IFD2?: Record<string, string> } | null;
}

export function supportsTargetSize(output: Pick<OutputOptions, 'format' | 'lossless'>): boolean {
  return output.format !== 'png' && !output.lossless;
}

function startingQuality(output: OutputOptions): number {
  if (output.preset === 'custom') return output.quality ?? QUALITY[output.format].balanced;
  return output.quality ?? QUALITY[output.format][output.preset];
}

function applyEncoder(img: Sharp, output: OutputOptions, quality: number): Sharp {
  const effort = output.preset === 'smallest' ? 6 : 4;
  switch (output.format) {
    case 'jpeg':
      return img.jpeg({ quality, mozjpeg: true, chromaSubsampling: quality >= 90 ? '4:4:4' : '4:2:0' });
    case 'webp':
      return img.webp({
        quality,
        lossless: output.lossless,
        effort,
        alphaQuality: output.lossless ? 100 : Math.max(quality, 80),
        smartSubsample: true,
      });
    case 'avif':
      return img.avif({
        quality,
        lossless: output.lossless,
        effort: Math.min(effort, 5),
        chromaSubsampling: quality >= 80 || output.lossless ? '4:4:4' : '4:2:0',
      });
    case 'png': {
      // 'smallest' uses palette quantisation, which is LOSSY; other presets are lossless.
      const palette = output.preset === 'smallest' && !output.lossless;
      return img.png({
        compressionLevel: output.preset === 'best' ? 6 : 9,
        adaptiveFiltering: true,
        palette,
        ...(palette ? { quality, effort: 7 } : {}),
      });
    }
  }
}

/** Encode raw pixels once (or a few times for target-size search) into the output format. */
export async function encode(raw: RawImage, output: OutputOptions, opts: EncodeOptions): Promise<EncodeResult> {
  const info = FORMATS[output.format];
  let flattened = false;

  const base = (): Sharp => {
    let img = fromRaw(raw);
    if (raw.channels === 4 && output.background) {
      img = img.flatten({ background: parseHex(output.background) });
      flattened = true;
    } else if (raw.channels === 4 && !info.supportsAlpha) {
      throw new ProcessingError(
        ErrorCode.VALIDATION_FAILED,
        `${info.label} does not support transparency. Choose a background colour or use PNG, WebP or AVIF.`,
      );
    }
    if (output.keepMetadata && opts.exif) img = img.withExif(opts.exif);
    return img.timeout({ seconds: opts.timeoutSeconds });
  };

  let attempts = 0;
  const run = async (quality: number) => {
    attempts++;
    try {
      const { data, info: out } = await applyEncoder(base(), output, quality).toBuffer({ resolveWithObject: true });
      return { data, width: out.width, height: out.height };
    } catch (err) {
      throw classifySharpError(err);
    }
  };

  const q0 = startingQuality(output);
  const usesQuality = !(output.format === 'png' && !(output.preset === 'smallest' && !output.lossless)) && !output.lossless;
  let chosenQ = q0;
  let result = await run(q0);
  let targetMet: boolean | null = null;

  if (output.targetSizeKB !== undefined && supportsTargetSize(output)) {
    const target = output.targetSizeKB * 1024;
    if (result.data.length <= target) {
      targetMet = true;
    } else {
      // Binary search for the highest quality that fits, never below the floor.
      const floor = QUALITY_FLOOR[output.format as 'jpeg' | 'webp' | 'avif'];
      let lo = floor;
      let hi = q0 - 1;
      let best: { q: number; r: typeof result } | null = null;
      let smallest = { q: q0, r: result };
      while (lo <= hi && attempts < 8) {
        const mid = Math.floor((lo + hi) / 2);
        const r = await run(mid);
        if (r.data.length < smallest.r.data.length) smallest = { q: mid, r };
        if (r.data.length <= target) {
          best = { q: mid, r };
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      if (best) {
        result = best.r;
        chosenQ = best.q;
        targetMet = true;
      } else {
        // Could not reach the target without unacceptable quality loss: return the smallest acceptable result and say so.
        if (smallest.q !== floor) {
          const r = await run(floor);
          if (r.data.length < smallest.r.data.length) smallest = { q: floor, r };
        }
        result = smallest.r;
        chosenQ = smallest.q;
        targetMet = false;
      }
    }
  }

  return {
    data: result.data,
    width: result.width,
    height: result.height,
    format: output.format,
    mime: info.mime,
    extension: info.extension,
    details: {
      preset: output.preset,
      quality: usesQuality ? chosenQ : null,
      lossless: output.lossless || (output.format === 'png' && output.preset !== 'smallest'),
      targetSizeKB: output.targetSizeKB ?? null,
      targetMet,
      flattenedTransparency: flattened,
      metadataKept: Boolean(output.keepMetadata && opts.exif),
      attempts,
    },
  };
}
