import { describe, expect, it } from 'vitest';
import { operationsSchema, outputSchema, planPipeline } from '../src/operations';

const photo = { width: 4000, height: 3000, hasAlpha: false };
const logo = { width: 800, height: 800, hasAlpha: true };
const out = (o: object) => outputSchema.parse(o);
const ops = (o: unknown[]) => operationsSchema.parse(o);

describe('operation schemas', () => {
  it('applies defaults', () => {
    const [op] = ops([{ type: 'resize', width: 100 }]);
    expect(op).toMatchObject({ fit: 'inside', kernel: 'lanczos3' });
  });

  it('rejects unknown operations and bad values', () => {
    expect(() => ops([{ type: 'explode' }])).toThrow();
    expect(() => ops([{ type: 'resize' }])).toThrow();
    expect(() => ops([{ type: 'flip' }])).toThrow();
    expect(() => ops([{ type: 'background', color: 'red' }])).toThrow();
  });
});

describe('planPipeline', () => {
  it('tracks size through crop, rotate and resize', () => {
    const plan = planPipeline(
      photo,
      ops([
        { type: 'crop', left: 0, top: 0, width: 3000, height: 2000 },
        { type: 'rotate', angle: 90 },
        { type: 'resize', width: 500 },
      ]),
      out({ format: 'jpeg' }),
    );
    expect(plan.size).toEqual({ width: 500, height: 750 });
  });

  it('rejects a crop outside the image', () => {
    expect(() =>
      planPipeline(photo, ops([{ type: 'crop', left: 3500, top: 0, width: 1000, height: 100 }]), out({ format: 'png' })),
    ).toThrow(/outside/);
  });

  it('refuses to silently flatten transparency to JPEG', () => {
    expect(() => planPipeline(logo, [], out({ format: 'jpeg' }))).toThrow(/transparency/);
    expect(planPipeline(logo, [], out({ format: 'jpeg', background: '#ffffff' })).hasAlpha).toBe(false);
    expect(planPipeline(logo, ops([{ type: 'background', color: '#000000' }]), out({ format: 'jpeg' })).hasAlpha).toBe(false);
  });

  it('circle crop and transparent padding introduce alpha', () => {
    expect(planPipeline(photo, ops([{ type: 'circle' }]), out({ format: 'png' })).hasAlpha).toBe(true);
    expect(() =>
      planPipeline(photo, ops([{ type: 'resize', width: 500, height: 500, fit: 'contain' }]), out({ format: 'jpeg' })),
    ).toThrow(/transparency/);
  });

  it('expands the canvas for free rotation', () => {
    const plan = planPipeline({ width: 100, height: 100, hasAlpha: false }, ops([{ type: 'rotate', angle: 45 }]), out({ format: 'png' }));
    expect(plan.size).toEqual({ width: 142, height: 142 });
    expect(plan.hasAlpha).toBe(true);
  });
});
