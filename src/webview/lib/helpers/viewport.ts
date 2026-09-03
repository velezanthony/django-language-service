import type { Point } from '$lib/state/positions.svelte';
import { toolbar } from '$lib/state/toolbar.svelte';

export interface ViewportContext {
  canvas: HTMLElement;
  canvasContent: HTMLElement;
  getPositions: () => Record<string, Point>;
  modelKeys: string[];
  /** Measured per call: detail mode changes box height at runtime. */
  getBoxSize: () => { w: number; h: number };
  scheduleDrawLines: () => void;
  saveViewportSoon: () => void;
  focusSearch: () => void;
  /** Fired whenever the zoom changes. Anything whose chrome is counter-scaled
   *  against the zoom (app zones) has to be redrawn here — relation lines get
   *  this for free through scheduleDrawLines. */
  onZoomChange?: () => void;
}

export interface ViewportApi {
  applyZoom(): void;
  expandCanvas(): void;
  zoomIn(): void;
  zoomOut(): void;
  zoomReset(): void;
  fitToVisible(): void;
  /** Frame an explicit key set (filter framing). */
  fitToKeys(keys: Iterable<string>, maxZoom?: number): void;
  togglePan(): void;
  isPanMode(): boolean;
  setZoom(z: number, save?: boolean): void;
  getZoom(): number;
  getContentSize(): { w: number; h: number };
  destroy(): void;
}

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 3.0;

export interface FitBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Zoom and scroll that frame `box` in a viewport of `view`.
 *
 * Pure so the framing rules are testable without a canvas. `maxZoom` exists
 * because the filter frames automatically: fitting three models to the screen
 * would otherwise slam the user to 300%.
 */
export function computeFit(
  box: FitBox,
  view: { width: number; height: number },
  opts: { padding?: number; minZoom?: number; maxZoom?: number } = {},
): { zoom: number; scrollLeft: number; scrollTop: number } {
  const padding = opts.padding ?? 60;
  const lo = opts.minZoom ?? MIN_ZOOM;
  const hi = opts.maxZoom ?? MAX_ZOOM;

  const boxW = box.maxX - box.minX;
  const boxH = box.maxY - box.minY;
  const viewW = Math.max(1, view.width - padding * 2);
  const viewH = Math.max(1, view.height - padding * 2);

  // A zero-width or zero-height set (one model) has no scale to derive; leave
  // the zoom at the cap rather than dividing by zero.
  const zoomX = boxW > 0 ? viewW / boxW : hi;
  const zoomY = boxH > 0 ? viewH / boxH : hi;
  const zoom = Math.min(hi, Math.max(lo, Math.min(zoomX, zoomY)));

  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;
  return {
    zoom,
    scrollLeft: Math.max(0, cx * zoom - view.width / 2),
    scrollTop: Math.max(0, cy * zoom - view.height / 2),
  };
}

/**
 * Padding so the scroll range matches what is painted.
 *
 * Only `transform: scale()` needs it — CSS `zoom` grows the layout box itself.
 * What separates them is `delta = zoom / bakedZoom`, so this returns 0 once the
 * zoom is baked and one expression covers both regimes.
 */
export function compensationMargin(contentSize: number, zoom: number, bakedZoom: number): number {
  if (contentSize <= 0 || bakedZoom <= 0) return 0;
  return Math.max(0, contentSize * (zoom / bakedZoom - 1));
}

const SHARPEN_DELAY_MS = 800;
const PAN_STEP = 60;
const PAN_STEP_BIG = 240;

export const setupViewport = (ctx: ViewportContext): ViewportApi => {
  let zoom = 1.0;
  let bakedZoom = 1.0;
  let sharpenTimer: ReturnType<typeof setTimeout> | null = null;
  let contentW = 0;
  let contentH = 0;

  let panning = false;
  let panStartX = 0;
  let panStartY = 0;
  let panScrollX = 0;
  let panScrollY = 0;
  let spaceMode = false;
  let panToolActive = false;

  const isPanMode = (): boolean => spaceMode || panToolActive;

  /** Re-derive the scroll padding. Yields 0 once baked, so no reset is needed. */
  const applyMargins = (): void => {
    ctx.canvasContent.style.marginRight = `${compensationMargin(contentW, zoom, bakedZoom)}px`;
    ctx.canvasContent.style.marginBottom = `${compensationMargin(contentH, zoom, bakedZoom)}px`;
  };

  const scheduleSharpen = (): void => {
    if (sharpenTimer !== null) clearTimeout(sharpenTimer);
    sharpenTimer = setTimeout(sharpenZoom, SHARPEN_DELAY_MS);
  };

  const sharpenZoom = (): void => {
    sharpenTimer = null;
    if (zoom === bakedZoom) return;
    bakedZoom = zoom;
    ctx.canvasContent.style.zoom = String(zoom);
    ctx.canvasContent.style.transform = 'scale(1)';
    // Layout box now carries the whole scale — drop the transform-era padding.
    applyMargins();
  };

  /** Put the whole zoom in CSS `zoom` right now, so the layout box matches. */
  const commitZoom = (): void => {
    if (sharpenTimer !== null) {
      clearTimeout(sharpenTimer);
      sharpenTimer = null;
    }
    bakedZoom = zoom;
    ctx.canvasContent.style.zoom = String(zoom);
    ctx.canvasContent.style.transform = 'scale(1)';
    applyMargins();
    toolbar.zoom = zoom;
    ctx.onZoomChange?.();
    ctx.saveViewportSoon();
  };

  const applyZoom = (): void => {
    const delta = zoom / bakedZoom;
    ctx.canvasContent.style.transform = `scale(${delta})`;
    applyMargins();
    toolbar.zoom = zoom;
    ctx.saveViewportSoon();
    ctx.onZoomChange?.();
    scheduleSharpen();
  };

  const zoomAround = (newZoom: number, anchorX: number, anchorY: number): void => {
    newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, newZoom));
    if (newZoom === zoom) return;
    const diagX = (anchorX + ctx.canvas.scrollLeft) / zoom;
    const diagY = (anchorY + ctx.canvas.scrollTop) / zoom;
    zoom = newZoom;
    applyZoom();
    ctx.canvas.scrollLeft = diagX * zoom - anchorX;
    ctx.canvas.scrollTop = diagY * zoom - anchorY;
  };

  const zoomByFactor = (factor: number): void => {
    zoomAround(zoom * factor, ctx.canvas.clientWidth / 2, ctx.canvas.clientHeight / 2);
  };

  const expandCanvas = (): void => {
    const positions = ctx.getPositions();
    const box = ctx.getBoxSize();
    let maxX = 0;
    let maxY = 0;
    for (const k of ctx.modelKeys) {
      const p = positions[k];
      if (!p) continue;
      maxX = Math.max(maxX, p.x + box.w + 60);
      maxY = Math.max(maxY, p.y + box.h + 60);
    }
    contentW = maxX;
    contentH = maxY;
    ctx.canvasContent.style.width = `${contentW}px`;
    ctx.canvasContent.style.height = `${contentH}px`;
    // Unconditional: the old `zoom !== 1` guard skipped the reset at 100%.
    applyMargins();
  };

  /** Frame an explicit key set. Reads positions, never the DOM, so callers can
   *  invoke it in the same tick they change which boxes are hidden. */
  const fitToKeys = (keys: Iterable<string>, maxZoom?: number): void => {
    const positions = ctx.getPositions();
    const box = ctx.getBoxSize();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let found = 0;
    for (const k of keys) {
      const p = positions[k];
      if (!p) continue;
      found++;
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + box.w);
      maxY = Math.max(maxY, p.y + box.h);
    }
    if (found === 0) return;

    const fit = computeFit(
      { minX, minY, maxX, maxY },
      { width: ctx.canvas.clientWidth, height: ctx.canvas.clientHeight },
      maxZoom === undefined ? {} : { maxZoom },
    );
    // Bake instead of applyZoom(): `transform: scale()` leaves the layout box
    // at the OLD zoom, so the scroll we ask for next is clamped against a range
    // that has not grown yet. A fit is a deliberate jump — it does not need the
    // transform fast path a wheel gesture does.
    zoom = fit.zoom;
    commitZoom();
    // Force the reflow so the new scroll range exists before we scroll into it.
    void ctx.canvas.scrollHeight;
    ctx.canvas.scrollLeft = fit.scrollLeft;
    ctx.canvas.scrollTop = fit.scrollTop;
    ctx.scheduleDrawLines();
  };

  const fitToVisible = (): void => {
    const positions = ctx.getPositions();
    const visibleKeys: string[] = [];
    document.querySelectorAll('.model-box').forEach(box => {
      if (box.classList.contains('hidden')) return;
      const k = box.getAttribute('data-model');
      if (k && positions[k]) visibleKeys.push(k);
    });
    fitToKeys(visibleKeys);
  };

  const togglePan = (): void => {
    panToolActive = !panToolActive;
    toolbar.panToolActive = panToolActive;
    if (panToolActive) ctx.canvas.setAttribute('data-panning', 'true');
    else if (!panning && !spaceMode) ctx.canvas.removeAttribute('data-panning');
  };

  // ── Listeners ───────────────────────────────────────────────────────────

  const onCanvasMouseDown = (ev: Event): void => {
    const e = ev as MouseEvent;
    if (e.button !== 0) return;
    if (!isPanMode()) return;
    panning = true;
    panStartX = e.clientX;
    panStartY = e.clientY;
    panScrollX = ctx.canvas.scrollLeft;
    panScrollY = ctx.canvas.scrollTop;
    ctx.canvas.setAttribute('data-panning', 'true');
    e.preventDefault();
  };

  const onCanvasScroll = (): void => {
    ctx.scheduleDrawLines();
    ctx.saveViewportSoon();
  };

  const onCanvasWheel = (ev: Event): void => {
    const e = ev as WheelEvent;
    if (!e.ctrlKey && !e.metaKey && !e.shiftKey) return;
    e.preventDefault();
    const step = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const cRect = ctx.canvas.getBoundingClientRect();
    zoomAround(zoom * step, e.clientX - cRect.left, e.clientY - cRect.top);
  };

  const onWindowMouseMove = (e: MouseEvent): void => {
    if (!panning) return;
    ctx.canvas.scrollLeft = panScrollX - (e.clientX - panStartX);
    ctx.canvas.scrollTop = panScrollY - (e.clientY - panStartY);
  };

  const onWindowMouseUp = (): void => {
    if (panning) {
      panning = false;
      ctx.canvas.removeAttribute('data-panning');
    }
  };

  const onKeyDown = (ev: Event): void => {
    const e = ev as KeyboardEvent;
    const target = e.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')
    )
      return;

    if (e.code === 'Space' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (!e.repeat) {
        spaceMode = true;
        ctx.canvas.setAttribute('data-panning', 'true');
      }
      e.preventDefault();
      return;
    }

    if (
      e.key === 'ArrowUp' ||
      e.key === 'ArrowDown' ||
      e.key === 'ArrowLeft' ||
      e.key === 'ArrowRight'
    ) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const step = e.shiftKey ? PAN_STEP_BIG : PAN_STEP;
      if (e.key === 'ArrowUp') ctx.canvas.scrollTop -= step;
      else if (e.key === 'ArrowDown') ctx.canvas.scrollTop += step;
      else if (e.key === 'ArrowLeft') ctx.canvas.scrollLeft -= step;
      else if (e.key === 'ArrowRight') ctx.canvas.scrollLeft += step;
      e.preventDefault();
      return;
    }

    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === '+' || e.key === '=') {
      zoomByFactor(1.2);
      e.preventDefault();
    } else if (e.key === '-' || e.key === '_') {
      zoomByFactor(1 / 1.2);
      e.preventDefault();
    } else if (e.key === '0') {
      zoom = 1.0;
      applyZoom();
      e.preventDefault();
    } else if (e.key === 'f' || e.key === 'F') {
      fitToVisible();
      e.preventDefault();
    } else if (e.key === '/') {
      ctx.focusSearch();
      e.preventDefault();
    }
  };

  const onKeyUp = (ev: Event): void => {
    const e = ev as KeyboardEvent;
    if (e.code === 'Space' && spaceMode) {
      spaceMode = false;
      if (!panning) ctx.canvas.removeAttribute('data-panning');
    }
  };

  ctx.canvas.addEventListener('mousedown', onCanvasMouseDown);
  ctx.canvas.addEventListener('scroll', onCanvasScroll, { passive: true });
  ctx.canvas.addEventListener('wheel', onCanvasWheel, { passive: false });
  document.addEventListener('mousemove', onWindowMouseMove);
  document.addEventListener('mouseup', onWindowMouseUp);
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);

  return {
    applyZoom,
    expandCanvas,
    zoomIn: () => zoomByFactor(1.2),
    zoomOut: () => zoomByFactor(1 / 1.2),
    zoomReset: () => {
      zoom = 1.0;
      applyZoom();
    },
    fitToVisible,
    fitToKeys,
    togglePan,
    isPanMode,
    setZoom: (z: number, save = true) => {
      const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
      zoom = clamped;
      bakedZoom = clamped;
      ctx.canvasContent.style.zoom = String(clamped);
      ctx.canvasContent.style.transform = 'scale(1)';
      applyMargins();
      toolbar.zoom = clamped;
      ctx.onZoomChange?.();
      if (save) ctx.saveViewportSoon();
    },
    getZoom: () => zoom,
    getContentSize: () => ({ w: contentW, h: contentH }),
    destroy: () => {
      ctx.canvas.removeEventListener('mousedown', onCanvasMouseDown);
      ctx.canvas.removeEventListener('scroll', onCanvasScroll);
      ctx.canvas.removeEventListener('wheel', onCanvasWheel);
      document.removeEventListener('mousemove', onWindowMouseMove);
      document.removeEventListener('mouseup', onWindowMouseUp);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      if (sharpenTimer !== null) clearTimeout(sharpenTimer);
    },
  };
};
