import { mountTooltip, unmountTooltip } from './mount-tooltip';
import { mountDiffTooltip, mountStepDiffTooltip, unmountDiffTooltip } from './mount-diff-tooltip';
import { setBoxFlag, boxFlagsState, BoxFlag } from '$lib/state/box-flags.svelte';
import { clampToViewport } from '$lib/helpers/clamp-to-viewport';
import type { BoxRecord } from '$lib/types/box-data';
import type {
  DiagramMigrationComparisonEntry,
  DiagramSnapshot,
} from '$lib/composables/diagram-data';
import type { ModelFieldDiff } from '$lib/helpers/compare';

// Tooltip wrapper state lives in data-attributes (not classes) so it can be
// styled inline via Tailwind's `data-[visible=true]:` modifiers.
const isPinned = (el: HTMLElement): boolean => el.dataset.pinned === 'true';
const setPinned = (el: HTMLElement, on: boolean): void => {
  if (on) el.setAttribute('data-pinned', 'true');
  else el.removeAttribute('data-pinned');
};
const setVisible = (el: HTMLElement, on: boolean): void => {
  if (on) el.setAttribute('data-visible', 'true');
  else el.removeAttribute('data-visible');
};
const setDiffMode = (el: HTMLElement, on: boolean): void => {
  if (on) el.setAttribute('data-diff', 'true');
  else el.removeAttribute('data-diff');
};

export interface TooltipContext {
  tooltipEl: HTMLElement;
  // tooltipData lookup by model key. Legacy uses untyped records; controller passes them through to mount-tooltip / mount-diff-tooltip.
  dataMap: Record<string, BoxRecord>;
  getActiveCompareIdx: () => number;
  /** Selected migration in step mode, or null when step mode is off. Step mode
   *  answers "what did THIS migration do", so it diffs the snapshot before it
   *  against the snapshot after it — not against the live models. */
  getActiveStep: () => { idx: number; label: string; previousLabel?: string } | null;
  getActiveChangedByKey: () => Map<string, ModelFieldDiff>;
  migrationComparisons: DiagramMigrationComparisonEntry[];
  snapshots: DiagramSnapshot[];
  lastDragMoved: () => boolean;
  onSourceNavigate: (key: string) => void;
}

export interface TooltipApi {
  unpin: () => void;
  hideIfNotPinned: () => void;
  removeDiffMode: () => void;
  destroy: () => void;
}

const TT_MIN_W = 260;
const TT_MIN_H = 200;
const GAP = 12;
const MARGIN = 8;
const HIGHLIGHT_MS = 2000;

export function setupTooltip(ctx: TooltipContext): TooltipApi {
  const { tooltipEl, dataMap } = ctx;

  type ResizeState = {
    dir: string;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
    startLeft: number;
    startTop: number;
  };
  let ttResize: ResizeState | null = null;

  const resetTooltipSize = (): void => {
    tooltipEl.style.width = '';
    tooltipEl.style.height = '';
    tooltipEl.style.maxWidth = '';
    tooltipEl.style.maxHeight = '';
  };

  const hideIfNotPinned = (): void => {
    if (!isPinned(tooltipEl)) {
      setVisible(tooltipEl, false);
      resetTooltipSize();
    }
  };

  const unpin = (): void => {
    setPinned(tooltipEl, false);
    setVisible(tooltipEl, false);
    resetTooltipSize();
  };

  const removeDiffMode = (): void => {
    setDiffMode(tooltipEl, false);
  };

  const positionTooltip = (box: Element): void => {
    const bRect = box.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;

    tooltipEl.style.left = '0px';
    tooltipEl.style.top = '0px';
    const ttW = tooltipEl.offsetWidth;
    const ttH = tooltipEl.offsetHeight;

    let left = bRect.right + GAP;
    if (left + ttW > vw - MARGIN) left = bRect.left - ttW - GAP;
    if (left < MARGIN) left = MARGIN;
    if (left + ttW > vw - MARGIN) left = vw - ttW - MARGIN;

    let top = bRect.top;
    if (top + ttH > vh - MARGIN) top = vh - ttH - MARGIN;
    if (top < MARGIN) top = MARGIN;

    tooltipEl.style.left = left + window.scrollX + 'px';
    tooltipEl.style.top = top + window.scrollY + 'px';
  };

  /** Did the selected migration touch this model? The timeline flags already
   *  say so — anything it did not touch is hidden, not flagged. */
  const stepTouches = (key: string): boolean => {
    const f = boxFlagsState.byKey[key];
    return f?.tlAdded === true || f?.tlChanged === true || f?.tlRemoved === true;
  };

  const setTooltipContent = (d: BoxRecord, pinned: boolean, boxKey: string): void => {
    const activeCompareIdx = ctx.getActiveCompareIdx();
    // Mount the diff view for any box that has a compare state — not just
    // `compareChanged`. Added boxes (model didn't exist in the migration) and
    // removed boxes (model existed then but not now) also benefit from the
    // BEFORE/AFTER layout: DiffTooltip renders "(not present)" on the empty
    // side automatically. Without this, clicking a green/dashed-red box in
    // compare mode used to fall through to the plain tooltip, hiding the
    // diff context entirely.
    const flags = boxFlagsState.byKey[boxKey];
    const isDiff =
      activeCompareIdx >= 0 &&
      (flags?.compareChanged === true ||
        flags?.compareAdded === true ||
        flags?.compareRemoved === true);
    // Step mode gets its own diff: before this migration vs after it.
    const step = ctx.getActiveStep();
    if (!isDiff && step && stepTouches(boxKey)) {
      setDiffMode(tooltipEl, true);
      unmountTooltip();
      mountStepDiffTooltip(tooltipEl, {
        d,
        pinned,
        stepIdx: step.idx,
        stepLabel: step.label,
        ...(step.previousLabel !== undefined && { previousLabel: step.previousLabel }),
        snapshots: ctx.snapshots,
      });
      return;
    }

    if (isDiff) {
      setDiffMode(tooltipEl, true);
      unmountTooltip();
      mountDiffTooltip(tooltipEl, {
        d,
        pinned,
        compareIdx: activeCompareIdx,
        migrationComparisons: ctx.migrationComparisons,
        snapshots: ctx.snapshots,
        activeChangedByKey: ctx.getActiveChangedByKey(),
      });
    } else {
      setDiffMode(tooltipEl, false);
      unmountDiffTooltip();
      mountTooltip(tooltipEl, d, pinned);
    }
  };

  const navigateToModelInDiagram = (key: string): void => {
    const box = document.getElementById('box-' + key);
    if (!box || boxFlagsState.byKey[key]?.hidden === true) return;
    box.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    setBoxFlag(key, BoxFlag.HIGHLIGHTED, true);
    setTimeout(() => setBoxFlag(key, BoxFlag.HIGHLIGHTED, false), HIGHLIGHT_MS);
    unpin();
  };

  let suppressNextClick = false;

  // ── Drag the pinned panel by its header ──
  let ttDrag: {
    startX: number;
    startY: number;
    startLeft: number;
    startTop: number;
    moved: boolean;
  } | null = null;

  const onDragMouseDown = (ev: Event): void => {
    const e = ev as MouseEvent;
    if (e.button !== 0 || !isPinned(tooltipEl)) return;
    const target = e.target as HTMLElement | null;
    if (!target?.closest?.('[data-tt-drag]')) return;
    // Buttons inside the header must keep working.
    if (target.closest('[data-action]')) return;

    ttDrag = {
      startX: e.clientX,
      startY: e.clientY,
      startLeft: tooltipEl.offsetLeft,
      startTop: tooltipEl.offsetTop,
      moved: false,
    };
    tooltipEl.setAttribute('data-dragging', 'true');
    e.preventDefault();
  };

  const onDragMouseMove = (ev: MouseEvent): void => {
    if (!ttDrag) return;
    const dx = ev.clientX - ttDrag.startX;
    const dy = ev.clientY - ttDrag.startY;
    if (!ttDrag.moved && Math.abs(dx) + Math.abs(dy) < 3) return;
    ttDrag.moved = true;

    const next = clampToViewport(
      { left: ttDrag.startLeft + dx, top: ttDrag.startTop + dy },
      { width: tooltipEl.offsetWidth, height: tooltipEl.offsetHeight },
      {
        width: document.documentElement.clientWidth,
        height: document.documentElement.clientHeight,
      },
    );
    tooltipEl.style.left = `${next.left + window.scrollX}px`;
    tooltipEl.style.top = `${next.top + window.scrollY}px`;
  };

  const onDragMouseUp = (): void => {
    if (!ttDrag) return;
    // A drag must not read as a click on whatever sat under the cursor.
    if (ttDrag.moved) suppressNextClick = true;
    ttDrag = null;
    tooltipEl.removeAttribute('data-dragging');
  };

  const onResizeMouseDown = (ev: Event): void => {
    const e = ev as MouseEvent;
    const target = e.target as HTMLElement | null;
    if (!target || target.getAttribute('data-resize') === null) return;
    if (!isPinned(tooltipEl)) return;
    const dir = target.getAttribute('data-resize') || '';
    const rect = tooltipEl.getBoundingClientRect();
    ttResize = {
      dir,
      startX: e.clientX,
      startY: e.clientY,
      startW: rect.width,
      startH: rect.height,
      startLeft: tooltipEl.offsetLeft,
      startTop: tooltipEl.offsetTop,
    };
    tooltipEl.style.maxWidth = 'none';
    tooltipEl.style.maxHeight = 'none';
    e.preventDefault();
    e.stopPropagation();
  };

  const onResizeMouseMove = (ev: MouseEvent): void => {
    if (!ttResize) return;
    const dx = ev.clientX - ttResize.startX;
    const dy = ev.clientY - ttResize.startY;
    const d = ttResize.dir;

    let newW = ttResize.startW;
    let newH = ttResize.startH;
    let newLeft = ttResize.startLeft;
    let newTop = ttResize.startTop;

    if (d.indexOf('e') >= 0) newW = Math.max(TT_MIN_W, ttResize.startW + dx);
    if (d.indexOf('w') >= 0) {
      newW = Math.max(TT_MIN_W, ttResize.startW - dx);
      newLeft = ttResize.startLeft + (ttResize.startW - newW);
    }
    if (d.indexOf('s') >= 0) newH = Math.max(TT_MIN_H, ttResize.startH + dy);
    if (d.indexOf('n') >= 0) {
      newH = Math.max(TT_MIN_H, ttResize.startH - dy);
      newTop = ttResize.startTop + (ttResize.startH - newH);
    }

    tooltipEl.style.width = newW + 'px';
    tooltipEl.style.height = newH + 'px';
    tooltipEl.style.left = newLeft + 'px';
    tooltipEl.style.top = newTop + 'px';
  };

  const onResizeMouseUp = (): void => {
    if (ttResize) ttResize = null;
  };

  const onTooltipClick = (e: Event): void => {
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }
    const target = (e as MouseEvent).target as HTMLElement | null;
    if (!target) return;

    const navKey = target.getAttribute && target.getAttribute('data-nav-key');
    if (navKey) {
      navigateToModelInDiagram(navKey);
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // closest() so clicks on text/icon children inside the action button still
    // resolve to the data-action ancestor. Required after the TooltipFooter
    // buttons were wrapped in the Button atom (slot adds inner spans).
    const actionEl = target.closest
      ? (target.closest('[data-action]') as HTMLElement | null)
      : null;
    const action = actionEl ? actionEl.getAttribute('data-action') : null;
    if (!action) return;
    if (action === 'close') {
      unpin();
      return;
    }
    if (action === 'goto') {
      const key = tooltipEl.getAttribute('data-pinned-key');
      if (!key) return;
      ctx.onSourceNavigate(key);
    }
  };

  const onOutsideClick = (e: MouseEvent): void => {
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }
    if (!isPinned(tooltipEl)) return;
    const t = e.target as HTMLElement | null;
    if (t && t.closest && (t.closest('#tooltip') || t.closest('.model-box'))) return;
    unpin();
  };

  const onBoxEnter = (box: Element): (() => void) => {
    return () => {
      if (isPinned(tooltipEl)) return;
      const name = box.getAttribute('data-model');
      if (!name) return;
      const d = dataMap[name];
      if (!d) return;
      setTooltipContent(d, false, name);
      setVisible(tooltipEl, true);
      positionTooltip(box);
    };
  };

  const onBoxLeave = (): void => hideIfNotPinned();

  const onBoxClick = (box: Element): ((e: Event) => void) => {
    return (e: Event) => {
      if (ctx.lastDragMoved()) return;
      const name = box.getAttribute('data-model');
      if (!name) return;
      const d = dataMap[name];
      if (!d) return;
      e.stopPropagation();
      setTooltipContent(d, true, name);
      setVisible(tooltipEl, true);
      setPinned(tooltipEl, true);
      tooltipEl.setAttribute('data-pinned-key', name);
      positionTooltip(box);
    };
  };

  const boxCleanups: Array<() => void> = [];
  document.querySelectorAll('.model-box').forEach(box => {
    const enter = onBoxEnter(box);
    const leave = onBoxLeave;
    const click = onBoxClick(box);
    box.addEventListener('mouseenter', enter);
    box.addEventListener('mouseleave', leave);
    box.addEventListener('click', click);
    boxCleanups.push(() => {
      box.removeEventListener('mouseenter', enter);
      box.removeEventListener('mouseleave', leave);
      box.removeEventListener('click', click);
    });
  });

  tooltipEl.addEventListener('mousedown', onDragMouseDown);
  tooltipEl.addEventListener('mousedown', onResizeMouseDown);
  tooltipEl.addEventListener('click', onTooltipClick);
  document.addEventListener('mousemove', onDragMouseMove);
  document.addEventListener('mouseup', onDragMouseUp);
  document.addEventListener('mousemove', onResizeMouseMove);
  document.addEventListener('mouseup', onResizeMouseUp);
  document.addEventListener('click', onOutsideClick);

  const destroy = (): void => {
    tooltipEl.removeEventListener('mousedown', onDragMouseDown);
    tooltipEl.removeEventListener('mousedown', onResizeMouseDown);
    tooltipEl.removeEventListener('click', onTooltipClick);
    document.removeEventListener('mousemove', onDragMouseMove);
    document.removeEventListener('mouseup', onDragMouseUp);
    document.removeEventListener('mousemove', onResizeMouseMove);
    document.removeEventListener('mouseup', onResizeMouseUp);
    document.removeEventListener('click', onOutsideClick);
    boxCleanups.forEach(fn => fn());
    boxCleanups.length = 0;
  };

  return { unpin, hideIfNotPinned, removeDiffMode, destroy };
}
