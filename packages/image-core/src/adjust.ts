/**
 * Colour/tone adjustments on 8-bit sRGB(A) pixels.
 *
 * These are classic, deterministic photo adjustments, not AI. The SAME code
 * runs on the server (final export) and in the browser (live preview), so
 * the preview matches the result.
 *
 * Every per-channel step (exposure, white balance, brightness, contrast,
 * shadows/highlights, gamma) is folded into one 256-entry lookup table per
 * channel, so the cost is a single pass over the pixels. Saturation needs the
 * pixel's luminance and runs in the same pass only when used.
 */

export interface AdjustSettings {
  brightness: number; // -100..100
  contrast: number; // -100..100
  saturation: number; // -100..100
  exposure: number; // EV, -5..5
  temperature: number; // -100..100 (+ warmer)
  tint: number; // -100..100 (+ magenta)
  highlights: number; // -100..100
  shadows: number; // -100..100
  gamma: number; // 0.2..5 (1 = neutral)
}

export const NEUTRAL_ADJUST: AdjustSettings = {
  brightness: 0, contrast: 0, saturation: 0, exposure: 0, temperature: 0, tint: 0, highlights: 0, shadows: 0, gamma: 1,
};

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

export function isIdentityAdjust(s: AdjustSettings): boolean {
  return (Object.keys(NEUTRAL_ADJUST) as (keyof AdjustSettings)[]).every((k) => s[k] === NEUTRAL_ADJUST[k]);
}

/** Lookup tables for R, G and B. */
export function buildChannelLuts(s: AdjustSettings): [Uint8Array, Uint8Array, Uint8Array] {
  const exposureGain = 2 ** s.exposure;
  const t = s.temperature / 100;
  const m = s.tint / 100;
  const gains = [1 + 0.15 * t + 0.05 * m, 1 - 0.1 * m, 1 - 0.15 * t + 0.05 * m];
  const brightness = (s.brightness / 100) * 0.35;
  const c = s.contrast / 100;
  const contrastK = c >= 0 ? 1 + c * 1.5 : 1 + c * 0.9;
  const sh = s.shadows / 100;
  const hi = s.highlights / 100;
  const invGamma = 1 / s.gamma;

  return gains.map((gain) => {
    const lut = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      let v = i / 255;
      v = clamp01(v * exposureGain * gain);
      v = v + brightness * (1 - Math.abs(2 * v - 1) * 0.5);
      v = clamp01((clamp01(v) - 0.5) * contrastK + 0.5);
      v = v + sh * 0.3 * (1 - smoothstep(0, 0.6, v)) + hi * 0.3 * smoothstep(0.4, 1, v);
      v = clamp01(v) ** invGamma;
      lut[i] = Math.round(clamp01(v) * 255);
    }
    return lut;
  }) as [Uint8Array, Uint8Array, Uint8Array];
}

/**
 * Apply adjustments in place. `channels` is the pixel stride: 3 (RGB) or 4
 * (RGBA, e.g. canvas ImageData). Alpha is never modified.
 */
export function applyAdjust(data: Uint8Array | Uint8ClampedArray, channels: number, s: AdjustSettings): void {
  if (channels !== 3 && channels !== 4) throw new Error(`Unsupported channel count ${channels}`);
  if (isIdentityAdjust(s)) return;

  const [lr, lg, lb] = buildChannelLuts(s);
  const sat = 1 + s.saturation / 100;
  const doSat = s.saturation !== 0;

  for (let i = 0; i < data.length; i += channels) {
    let r = lr[data[i]!]!;
    let g = lg[data[i + 1]!]!;
    let b = lb[data[i + 2]!]!;
    if (doSat) {
      const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = y + (r - y) * sat;
      g = y + (g - y) * sat;
      b = y + (b - y) * sat;
      r = r < 0 ? 0 : r > 255 ? 255 : r;
      g = g < 0 ? 0 : g > 255 ? 255 : g;
      b = b < 0 ? 0 : b > 255 ? 255 : b;
    }
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
}
