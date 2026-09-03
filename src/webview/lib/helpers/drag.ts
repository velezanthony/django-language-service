import { positionsState, type Point } from '$lib/state/positions.svelte';

export type { Point };

export interface BoxDragContext {
  canvasContent: HTMLElement;
  tooltipEl: HTMLElement;
  isPanMode: () => boolean;
  getZoom: () => number;
  onDragEnd: () => void;
  scheduleRedraw: () => void;
}

let ctx: BoxDragContext | null = null;
let didDrag = false;
let dragEl: HTMLElement | null = null;
let dragOffX = 0;
let dragOffY = 0;
let onMove: ((e: MouseEvent) => void) | null = null;
let onUp: (() => void) | null = null;

export const setBoxDragContext = (next: BoxDragContext): void => {
  ctx = next;
};

// Exposed for legacy click handlers that suppress click-after-drag
// (tooltip pin / model selection / blast radius).
export const lastDragMoved = (): boolean => didDrag;

const clientToDiagram = (clientX: number, clientY: number): Point => {
  if (!ctx) return { x: clientX, y: clientY };
  const rect = ctx.canvasContent.getBoundingClientRect();
  const zoom = ctx.getZoom();
  return {
    x: (clientX - rect.left) / zoom,
    y: (clientY - rect.top) / zoom,
  };
};

const teardown = (): void => {
  if (onMove) document.removeEventListener('mousemove', onMove);
  if (onUp) document.removeEventListener('mouseup', onUp);
  onMove = null;
  onUp = null;
};

export const startBoxDrag = (boxKey: string, event: MouseEvent): void => {
  if (!ctx) return;
  if (event.button !== 0) return;
  if (ctx.isPanMode()) return;

  const el = event.currentTarget as HTMLElement | null;
  if (!el) return;

  dragEl = el;
  didDrag = false;
  dragEl.setAttribute('data-dragging', 'true');

  const p = positionsState.byKey[boxKey];
  const click = clientToDiagram(event.clientX, event.clientY);
  dragOffX = p ? click.x - p.x : 0;
  dragOffY = p ? click.y - p.y : 0;

  onMove = (e: MouseEvent): void => {
    if (!dragEl || !ctx) return;
    didDrag = true;
    const c = clientToDiagram(e.clientX, e.clientY);
    const nx = Math.max(0, Math.round(c.x - dragOffX));
    const ny = Math.max(0, Math.round(c.y - dragOffY));
    // Direct DOM mutation for 60fps feedback; the $state mutation right after
    // lets Svelte's deep reactivity propagate the change to BoxesLayer / relation
    // path math without a full map re-broadcast.
    dragEl.style.left = `${nx}px`;
    dragEl.style.top = `${ny}px`;
    positionsState.byKey[boxKey] = { x: nx, y: ny };
    ctx.tooltipEl.removeAttribute('data-visible');
    ctx.scheduleRedraw();
  };

  onUp = (): void => {
    if (dragEl) {
      dragEl.removeAttribute('data-dragging');
      if (didDrag && ctx) ctx.onDragEnd();
      dragEl = null;
    }
    teardown();
  };

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
  event.preventDefault();
};
