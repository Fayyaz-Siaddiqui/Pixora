import { describe, expect, it } from 'vitest';
import { checkConversion, isOutputFormat } from '../src/formats';
import { SIZE_PRESETS } from '../src/presets';

describe('checkConversion', () => {
  it('allows opaque images to any format', () => {
    expect(checkConversion(false, 'jpeg')).toEqual({ ok: true, flattensTransparency: false });
  });

  it('keeps transparency for formats with alpha', () => {
    for (const f of ['png', 'webp', 'avif'] as const) {
      expect(checkConversion(true, f).ok).toBe(true);
    }
  });

  it('refuses to silently flatten transparency into JPEG', () => {
    const result = checkConversion(true, 'jpeg');
    expect(result.ok).toBe(false);
  });

  it('allows flattening when a background is chosen', () => {
    expect(checkConversion(true, 'jpeg', '#ffffff')).toEqual({
      ok: true,
      flattensTransparency: true,
      requiresBackground: true,
    });
  });

  it('recognises output formats', () => {
    expect(isOutputFormat('webp')).toBe(true);
    expect(isOutputFormat('gif')).toBe(false);
  });
});

describe('SIZE_PRESETS', () => {
  it('has unique ids and positive sizes', () => {
    const ids = new Set(SIZE_PRESETS.map((p) => p.id));
    expect(ids.size).toBe(SIZE_PRESETS.length);
    for (const p of SIZE_PRESETS) {
      expect(p.width).toBeGreaterThan(0);
      expect(p.height).toBeGreaterThan(0);
    }
  });
});
