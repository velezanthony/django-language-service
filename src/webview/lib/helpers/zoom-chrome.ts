/** Screen-space chrome inside a zoomed canvas: geometry divides by the zoom,
 *  text cannot, so below a threshold there is no label. */

/** Mirrors MIN_ZOOM in viewport.ts — the largest counter-scale worth emitting. */
export const CHROME_MIN_ZOOM = 0.1;

/** Below this zoom, labels paint under ~9px and stop carrying information. */
export const LABEL_LOD_ZOOM = 0.6;

/** A SCREEN-pixel size as the canvas-pixel value that paints at it. */
export function counterScale(screenPx: number, zoom: number): number {
  const safe = zoom > CHROME_MIN_ZOOM ? zoom : CHROME_MIN_ZOOM;
  return screenPx / safe;
}

/** Is text still large enough on screen to be worth painting? */
export function showsLabels(zoom: number): boolean {
  return zoom >= LABEL_LOD_ZOOM;
}
