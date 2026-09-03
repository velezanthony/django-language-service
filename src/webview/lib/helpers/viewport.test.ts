import { describe, it, expect } from 'vitest';
import { compensationMargin, computeFit } from './viewport';

// `transform: scale()` doesn't grow the layout box, so the element is padded to
// restore the scroll range. CSS `zoom` does grow it and needs no padding. The
// compensation therefore depends on the RATIO zoom/bakedZoom, not on zoom.

const CONTENT = 2000;

describe('compensationMargin', () => {
  it('pads nothing when the zoom is fully baked into CSS zoom', () => {
    // delta === 1: the layout box already matches what is painted.
    expect(compensationMargin(CONTENT, 1, 1)).toBe(0);
    expect(compensationMargin(CONTENT, 3, 3)).toBe(0);
    expect(compensationMargin(CONTENT, 0.26, 0.26)).toBe(0);
  });

  it('pads the visual overflow while the transform is doing the scaling', () => {
    // Straight off 100%, delta === zoom — the one case the old formula got right.
    expect(compensationMargin(CONTENT, 1.2, 1)).toBeCloseTo(400, 6);
  });

  // The regression the old formula caused: after a sharpen at 1.2, stepping to
  // 1.44 is still only a 1.2× visual step, so the padding must not grow to 44%.
  it('measures the step from the BAKED zoom, not from 100%', () => {
    expect(compensationMargin(CONTENT, 1.44, 1.2)).toBeCloseTo(400, 6);
    expect(compensationMargin(CONTENT, 2.4, 2)).toBeCloseTo(400, 6);
  });

  it('scales with the content, not with an absolute size', () => {
    expect(compensationMargin(500, 1.2, 1)).toBeCloseTo(100, 6);
  });

  // Zooming OUT under a transform leaves the layout box larger than the paint.
  // A negative margin could pull the scroll range in, but sharpenZoom() bakes
  // 800ms later and fixes it anyway — clamping keeps today's behaviour instead
  // of trading a measured bug for an unmeasured one.
  it('clamps to zero when the transform shrinks the content', () => {
    expect(compensationMargin(CONTENT, 0.5, 1)).toBe(0);
    expect(compensationMargin(CONTENT, 1.2, 2)).toBe(0);
  });

  it('never divides by a zero or negative baked zoom', () => {
    expect(Number.isFinite(compensationMargin(CONTENT, 2, 0))).toBe(true);
    expect(Number.isFinite(compensationMargin(CONTENT, 2, -1))).toBe(true);
  });

  it('leaves an unmeasured canvas alone', () => {
    expect(compensationMargin(0, 3, 1)).toBe(0);
  });
});

// Framing a set of boxes: pick the zoom that fits them, then centre on them.
// Used by "Fit to screen" and, since filtering hides most of the canvas, by the
// filter too — otherwise you are left staring at the empty region where the
// hidden models still live.
describe('computeFit', () => {
  const VIEW = { width: 1000, height: 600 };

  it('zooms out to fit a box larger than the viewport', () => {
    const fit = computeFit({ minX: 0, minY: 0, maxX: 2000, maxY: 1000 }, VIEW);
    // 1000-120 padding = 880 across 2000 wide → 0.44; height gives 0.48. Min wins.
    expect(fit.zoom).toBeCloseTo(0.44, 2);
  });

  // Far from the origin, so the centring is visible rather than clamped at 0.
  it('centres the box in the viewport', () => {
    const box = { minX: 2000, minY: 1500, maxX: 3000, maxY: 2100 };
    const fit = computeFit(box, VIEW);
    expect(fit.scrollLeft).toBeCloseTo(2500 * fit.zoom - VIEW.width / 2, 5);
    expect(fit.scrollTop).toBeCloseTo(1800 * fit.zoom - VIEW.height / 2, 5);
  });

  // Filtering to three models should not slam the user to 300%.
  it('honours a maxZoom cap instead of magnifying a small set', () => {
    const tiny = { minX: 0, minY: 0, maxX: 100, maxY: 60 };
    expect(computeFit(tiny, VIEW).zoom).toBeGreaterThan(1);
    expect(computeFit(tiny, VIEW, { maxZoom: 1 }).zoom).toBe(1);
  });

  it('never goes below the minimum zoom', () => {
    const huge = { minX: 0, minY: 0, maxX: 500000, maxY: 500000 };
    expect(computeFit(huge, VIEW).zoom).toBe(0.1);
  });

  it('survives a zero-area box (one model, or all at one point)', () => {
    const fit = computeFit({ minX: 300, minY: 200, maxX: 300, maxY: 200 }, VIEW, { maxZoom: 1 });
    expect(Number.isFinite(fit.zoom)).toBe(true);
    expect(Number.isFinite(fit.scrollLeft)).toBe(true);
    expect(fit.zoom).toBe(1);
  });

  it('never asks for a negative scroll offset', () => {
    const fit = computeFit({ minX: 0, minY: 0, maxX: 50, maxY: 50 }, VIEW, { maxZoom: 1 });
    expect(fit.scrollLeft).toBeGreaterThanOrEqual(0);
    expect(fit.scrollTop).toBeGreaterThanOrEqual(0);
  });
});
