import { describe, it, expect } from 'vitest';
import { CHROME_MIN_ZOOM, LABEL_LOD_ZOOM, counterScale, showsLabels } from './zoom-chrome';

// A zoomable canvas has two coordinate spaces. Geometry (where a box is, how
// big a zone is) belongs to the canvas and MUST scale. Chrome (stroke width,
// label size) belongs to the screen and must NOT. Everything here is about
// keeping the second kind out of the first.

describe('counterScale', () => {
  it('is the identity at 1:1', () => {
    expect(counterScale(1, 1)).toBe(1);
    expect(counterScale(1.5, 1)).toBe(1.5);
  });

  // Measured in Chrome: a 1px border inside the zoomed container paints at
  // 1 × zoom screen pixels, and Chrome truncates it to whole device pixels —
  // at 26% a 1px border rounds away to nothing.
  it('grows the canvas-space value so the painted result stays constant', () => {
    expect(counterScale(1, 0.5)).toBe(2);
    expect(counterScale(1, 0.25)).toBe(4);
    expect(counterScale(1.5, 0.5)).toBe(3);
  });

  it('shrinks it when zoomed in past 1:1', () => {
    expect(counterScale(1, 2)).toBe(0.5);
  });

  // MIN_ZOOM in viewport.ts is 0.1, so 10× is the largest honest factor. The
  // clamp stops a zero or negative zoom from producing Infinity or a negative
  // width that the browser would reject silently.
  it('clamps absurd zooms instead of emitting Infinity', () => {
    expect(counterScale(1, 0)).toBe(1 / CHROME_MIN_ZOOM);
    expect(counterScale(1, -3)).toBe(1 / CHROME_MIN_ZOOM);
    expect(Number.isFinite(counterScale(1, Number.EPSILON))).toBe(true);
  });
});

describe('showsLabels', () => {
  // Counter-scaling TEXT is the wrong tool: at 26% a 10px label would need to
  // be 38px in canvas space, four times wider than the zone it names, and it
  // would collide with its neighbours. Below the threshold the honest answer
  // is to draw no label at all.
  it('keeps labels while they are still legible', () => {
    expect(showsLabels(1)).toBe(true);
    expect(showsLabels(0.75)).toBe(true);
    expect(showsLabels(LABEL_LOD_ZOOM)).toBe(true);
  });

  it('drops them once they would paint below the legibility floor', () => {
    expect(showsLabels(0.5)).toBe(false); // measured 7.23 px on screen
    expect(showsLabels(0.26)).toBe(false); // measured 4.19 px — the reported bug
    expect(showsLabels(0.15)).toBe(false); // measured 2.41 px
  });
});
