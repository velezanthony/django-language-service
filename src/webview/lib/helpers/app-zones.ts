import type { Point } from '$lib/state/positions.svelte';
import { counterScale, showsLabels } from '$lib/helpers/zoom-chrome';

export interface AppZonesContext {
  canvasContent: HTMLElement;
  getPositions: () => Record<string, Point>;
  boxW: number;
  boxH: number;
  /** Current viewport zoom. Chrome inside the scaled container is divided by
   *  it so borders and labels keep their SCREEN size. */
  zoom: number;
}

const PADDING = 30;
/** Screen-pixel sizes — converted to canvas pixels via counterScale(). */
const BORDER_SCREEN_PX = 1;
const LABEL_SCREEN_PX = 10;
const LABEL_GAP_SCREEN_PX = 18;

// Group visible model positions by app and render a translucent zone + label
// around each cluster. Skips solo apps (one model = no useful zone) and any
// model hidden by the current filter.
export const drawAppZones = (ctx: AppZonesContext): void => {
  ctx.canvasContent.querySelectorAll('.app-zone, .app-zone-label').forEach(el => el.remove());

  const positions = ctx.getPositions();
  const appGroups: Record<string, Point[]> = {};
  document.querySelectorAll('.model-box').forEach(box => {
    if (box.classList.contains('hidden')) return;
    const app = box.getAttribute('data-app');
    if (!app) return;
    const key = box.getAttribute('data-model');
    if (!key) return;
    const p = positions[key];
    if (!p) return;
    if (!appGroups[app]) appGroups[app] = [];
    appGroups[app].push(p);
  });

  // A single app would wrap the entire diagram in one zone — it groups nothing,
  // it just adds a phantom box. Zones only earn their ink when they separate
  // one app's cluster from another's.
  if (Object.keys(appGroups).length < 2) return;

  for (const [app, pts] of Object.entries(appGroups)) {
    if (pts.length < 2) continue;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + ctx.boxW);
      maxY = Math.max(maxY, p.y + ctx.boxH);
    }

    const zone = document.createElement('div');
    // `app-zone` class kept so cleanup at the top of this function can find
    // these nodes via querySelectorAll. Visual styling lives inline.
    //
    // No fill. Zones are axis-aligned bounding boxes and the force layout
    // interleaves apps, so they overlap — and a translucent fill COMPOUNDS
    // where they do, painting bands of meaningless shading across the canvas.
    // An outline conveys the same grouping and cannot stack.
    zone.className =
      'app-zone absolute rounded-xl border-dashed border-white/[0.08] z-canvas-zone pointer-events-none';
    zone.style.borderWidth = `${counterScale(BORDER_SCREEN_PX, ctx.zoom)}px`;
    zone.style.left = `${minX - PADDING}px`;
    zone.style.top = `${minY - PADDING}px`;
    zone.style.width = `${maxX - minX + PADDING * 2}px`;
    zone.style.height = `${maxY - minY + PADDING * 2}px`;
    ctx.canvasContent.appendChild(zone);

    // Below the LOD threshold the label paints under ~9px and is a smudge, not
    // a word. Counter-scaling it instead would make it wider than its own zone.
    if (!showsLabels(ctx.zoom)) continue;

    const label = document.createElement('div');
    label.className =
      'app-zone-label absolute font-bold text-vsc-desc uppercase tracking-[1.2px] opacity-40 whitespace-nowrap';
    label.style.fontSize = `${counterScale(LABEL_SCREEN_PX, ctx.zoom)}px`;
    label.style.left = `${minX - PADDING + 8}px`;
    label.style.top = `${minY - PADDING - counterScale(LABEL_GAP_SCREEN_PX, ctx.zoom)}px`;
    label.textContent = app;
    ctx.canvasContent.appendChild(label);
  }
};
