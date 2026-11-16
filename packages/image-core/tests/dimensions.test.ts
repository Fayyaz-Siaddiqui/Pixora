import { describe, expect, it } from 'vitest';
import { DimensionError, linkedDimension, planResize } from '../src/dimensions';

const landscape = { width: 4000, height: 3000 }; // 4:3
const portrait = { width: 3000, height: 4000 }; // 3:4

describe('linkedDimension', () => {
  it('keeps proportions when width changes', () => {
    expect(linkedDimension(landscape, 'width', 800)).toEqual({ width: 800, height: 600 });
  });

  it('keeps proportions when height changes', () => {
    expect(linkedDimension(portrait, 'height', 1000)).toEqual({ width: 750, height: 1000 });
  });

  it('never returns a zero dimension for extreme ratios', () => {
    expect(linkedDimension({ width: 10_000, height: 10 }, 'width', 100)).toEqual({ width: 100, height: 1 });
  });

  it('rejects non-integer and non-positive input', () => {
    expect(() => linkedDimension(landscape, 'width', 0)).toThrow(DimensionError);
    expect(() => linkedDimension(landscape, 'width', 10.5)).toThrow(DimensionError);
    expect(() => linkedDimension(landscape, 'width', Number.NaN)).toThrow(DimensionError);
  });
});

describe('planResize', () => {
  it('derives height from width only', () => {
    const plan = planResize(landscape, { width: 1000 });
    expect(plan.output).toEqual({ width: 1000, height: 750 });
    expect(plan.isUpscale).toBe(false);
    expect(plan.distortion).toBe(0);
  });

  it('scales by percentage', () => {
    expect(planResize(landscape, { percent: 25 }).output).toEqual({ width: 1000, height: 750 });
    expect(planResize(landscape, { percent: 200 }).isUpscale).toBe(true);
  });

  it('rejects mixing percentage with pixels', () => {
    expect(() => planResize(landscape, { percent: 50, width: 100 })).toThrow(DimensionError);
  });

  it('inside: fits within the box without padding', () => {
    const plan = planResize(landscape, { width: 1080, height: 1080, fit: 'inside' });
    expect(plan.output).toEqual({ width: 1080, height: 810 });
  });

  it('contain: pads to the exact box', () => {
    const plan = planResize(portrait, { width: 1080, height: 1080, fit: 'contain' });
    expect(plan.output).toEqual({ width: 1080, height: 1080 });
    expect(plan.scaled).toEqual({ width: 810, height: 1080 });
  });

  it('cover: fills the exact box, scaled image is at least the box', () => {
    const plan = planResize(landscape, { width: 1080, height: 1350, fit: 'cover' });
    expect(plan.output).toEqual({ width: 1080, height: 1350 });
    expect(plan.scaled.height).toBe(1350);
    expect(plan.scaled.width).toBeGreaterThanOrEqual(1080);
  });

  it('stretch: reports distortion', () => {
    const plan = planResize(landscape, { width: 1000, height: 1000, fit: 'stretch' });
    expect(plan.output).toEqual({ width: 1000, height: 1000 });
    expect(plan.distortion).toBeCloseTo(0.25, 5); // 1:1 vs 4:3
  });

  it('flags upscaling', () => {
    expect(planResize({ width: 500, height: 500 }, { width: 1000 }).isUpscale).toBe(true);
  });

  it('withoutEnlargement keeps smaller images at their original size', () => {
    const small = { width: 500, height: 400 };
    const kept = planResize(small, { width: 1000, withoutEnlargement: true });
    expect(kept.output).toEqual(small);
    expect(kept.isUpscale).toBe(false);
    expect(planResize(small, { percent: 200, withoutEnlargement: true }).output).toEqual(small);
    // Shrinking still works normally.
    expect(planResize(small, { width: 250, withoutEnlargement: true }).output).toEqual({ width: 250, height: 200 });
    // Exact-size modes (fill/fit/stretch) are not affected: their purpose is the exact size.
    expect(planResize(small, { width: 1000, height: 1000, fit: 'cover', withoutEnlargement: true }).output).toEqual({ width: 1000, height: 1000 });
  });

  it('enforces limits', () => {
    expect(() => planResize(landscape, { width: 20_000 })).toThrow(/maximum side length/);
    expect(() =>
      planResize(landscape, { width: 12_000 }, { maxDimension: 50_000, maxPixels: 50_000_000 }),
    ).toThrow(/megapixels/);
  });

  it('requires some target', () => {
    expect(() => planResize(landscape, {})).toThrow(DimensionError);
  });
});
