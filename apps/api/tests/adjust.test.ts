import { describe, expect, it } from 'vitest';
import { adjustOpSchema } from '@app/shared';
import { applyAdjust, buildChannelLuts } from '../src/processors/adjust';

const adjust = (o: object) => adjustOpSchema.parse({ type: 'adjust', ...o });

describe('adjustments', () => {
  it('neutral settings are an exact identity', () => {
    const [r] = buildChannelLuts(adjust({}));
    for (let i = 0; i < 256; i++) expect(r[i]).toBe(i);
    const px = Buffer.from([10, 128, 250, 255]);
    applyAdjust(px, 4, adjust({}));
    expect([...px]).toEqual([10, 128, 250, 255]);
  });

  it('tone curves stay monotonic (no banding inversions)', () => {
    for (const o of [{ contrast: 100 }, { shadows: 100, highlights: -100 }, { brightness: -100 }, { exposure: 2, gamma: 2.2 }]) {
      const [r] = buildChannelLuts(adjust(o));
      for (let i = 1; i < 256; i++) expect(r[i]!).toBeGreaterThanOrEqual(r[i - 1]!);
    }
  });

  it('brightness, temperature and saturation move pixels the expected way', () => {
    const grey = () => Buffer.from([128, 128, 128]);
    const b = grey();
    applyAdjust(b, 3, adjust({ brightness: 50 }));
    expect(b[0]).toBeGreaterThan(128);

    const warm = grey();
    applyAdjust(warm, 3, adjust({ temperature: 100 }));
    expect(warm[0]).toBeGreaterThan(warm[2]!);

    const colour = Buffer.from([200, 100, 50]);
    applyAdjust(colour, 3, adjust({ saturation: -100 }));
    expect(Math.abs(colour[0]! - colour[2]!)).toBeLessThan(2); // fully desaturated
  });

  it('never touches the alpha channel', () => {
    const px = Buffer.from([100, 100, 100, 77]);
    applyAdjust(px, 4, adjust({ brightness: 100, contrast: 100 }));
    expect(px[3]).toBe(77);
  });
});
