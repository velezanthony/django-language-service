export interface BoxSize {
  w: number;
  h: number;
}

const DEFAULT_FALLBACK: BoxSize = { w: 180, h: 44 };

/**
 * The largest width and height across measured boxes, taken independently.
 *
 * Auto-arrange spaces every slot by a single size, so it has to be the biggest
 * one — anything smaller overlaps the tall boxes detail mode produces. Zero and
 * non-finite entries are dropped: a hidden box measures 0 and would otherwise
 * collapse the layout.
 */
export function largestBox(
  boxes: readonly BoxSize[],
  fallback: BoxSize = DEFAULT_FALLBACK,
): BoxSize {
  let w = 0;
  let h = 0;
  for (const b of boxes) {
    if (Number.isFinite(b.w) && b.w > w) w = b.w;
    if (Number.isFinite(b.h) && b.h > h) h = b.h;
  }
  return { w: w > 0 ? w : fallback.w, h: h > 0 ? h : fallback.h };
}
