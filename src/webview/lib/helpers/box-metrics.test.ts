import { describe, it, expect } from 'vitest';
import { largestBox } from './box-metrics';

// Auto-arrange spaces every slot by ONE size, but detail mode gives each box a
// different height (a model with 8 fields is far taller than one with 2).
// Spacing by the largest is the only choice that cannot overlap.
describe('largestBox', () => {
  it('takes the widest and tallest independently', () => {
    expect(
      largestBox([
        { w: 200, h: 40 },
        { w: 120, h: 300 },
      ]),
    ).toEqual({ w: 200, h: 300 });
  });

  it('falls back when nothing was measured', () => {
    expect(largestBox([], { w: 180, h: 44 })).toEqual({ w: 180, h: 44 });
  });

  // A hidden box measures 0; letting that win would collapse the layout.
  it('ignores zero-sized entries', () => {
    expect(
      largestBox([
        { w: 0, h: 0 },
        { w: 150, h: 60 },
      ]),
    ).toEqual({ w: 150, h: 60 });
  });

  it('falls back when every entry is zero-sized', () => {
    expect(largestBox([{ w: 0, h: 0 }], { w: 180, h: 44 })).toEqual({ w: 180, h: 44 });
  });

  it('never returns a non-finite size', () => {
    const out = largestBox([{ w: Infinity, h: NaN }], { w: 180, h: 44 });
    expect(Number.isFinite(out.w) && Number.isFinite(out.h)).toBe(true);
  });
});
