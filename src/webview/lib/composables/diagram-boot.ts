/**
 * Boot orchestration for the ER diagram webview.
 *
 * Dynamically imported from App.svelte's onMount, which then calls
 * `installDiagram()` — that function, not import-time code, wires every Svelte
 * island, registers the toolbar actions, and binds keyboard/pan/zoom.
 *
 * Runtime data (models, relations, migrations) arrives via `window.__DIAGRAM_DATA__`,
 * set by an inline script emitted by `$adapters/diagram/panel.ts`.
 *
 * Type checking: this file compiles clean under the strict tsconfig.webview.json
 * (strict: true) — DOM queries are narrowed with explicit casts and null guards.
 */

declare global {
  // Opaque on purpose: the host serialises whatever goes through, and every
  // call site here knows the shape it is sending. `any` would let a typo past.
  function acquireVsCodeApi(): {
    postMessage(msg: unknown): void;
    getState(): unknown;
    setState(state: unknown): void;
  };
}

import { installLayout } from '$lib/composables/layout';
import { shouldRestoreCompareIdx } from '$lib/helpers/compare';
import { setupTooltip, type TooltipApi } from '$lib/helpers/tooltip-controller';
import { positionsState, boxDimensions } from '$lib/state/positions.svelte';
import { setBoxDragContext, lastDragMoved } from '$lib/helpers/drag';
import { setupViewport, type ViewportApi } from '$lib/helpers/viewport';
import { largestBox } from '$lib/helpers/box-metrics';
import { drawAppZones as drawAppZonesHelper } from '$lib/helpers/app-zones';
import { openContextMenu, type ContextMenuItem } from '$lib/state/context-menu.svelte';
import IconVisibility from '$lib/components/atoms/icons/IconVisibility.svelte';
import IconVisibilityOff from '$lib/components/atoms/icons/IconVisibilityOff.svelte';
import { installPersistence, LAYOUT_VERSION } from '$lib/composables/persistence';
import {
  showToast,
  copyToClipboard,
  buildLayoutJson,
  parseLayoutPayload,
} from '$lib/helpers/exports';
import { installSearchFilter } from '$lib/composables/search-filter';
import { installBlastRadius } from '$lib/composables/blast-radius';
import { buildExportSvg } from '$lib/composables/export-svg';
import { installCompareMode } from '$lib/composables/compare-mode';
import { installTimelineMode } from '$lib/composables/timeline-mode';
// Phase 7.6 deleted the LEGACY_BOX_FLAGS branches that previously held
// the classList.add/remove DOM mutations. ModelBox.svelte now binds
// class:hidden / class:compare-* / class:tl-* / class:blast-* / etc.
// reactively from the boxFlags store; legacy parallel mutation is gone.
import { installDrawRelations } from '$lib/composables/draw-relations';
import type { RelationKind } from '$lib/types/relations';
import {
  toolbar,
  setActions,
  type ToolbarActions,
  type MigrationEntry,
} from '$lib/state/toolbar.svelte';
import { installErrorReporting } from '$lib/composables/error-reporting';
import { verifyStylesheet } from '$lib/composables/stylesheet-guard';
import { loadDiagramData } from '$lib/composables/diagram-data';
import { showPanHintOnce } from '$lib/composables/pan-hint';

/**
 * installDiagram — wires every imperative piece (drag, viewport, tooltip,
 * persistence, toolbar actions, compare/timeline/blast modes, search/filter)
 * against the DOM that App.svelte renders. Called from App.svelte's onMount.
 *
 * Phase 13 dismantling target: most of this body has already moved into
 * lib/composables/*; what remains here is the orchestration glue.
 */
export function installDiagram(): void {
  const vscode = acquireVsCodeApi();

  // Error boundary — installed FIRST so even setup-time errors are captured.
  installErrorReporting(vscode);

  // A stylesheet that failed to load throws nothing, so the error boundary
  // above cannot see it: the panel simply renders every Tailwind class inert
  // and looks like a column of naked divs. Asked here, once, because by the
  // time this runs the `<link>` has settled — a classic script does not execute
  // while a stylesheet declared before it is still pending.
  verifyStylesheet(vscode, document);

  const {
    tooltipData,
    relations,
    // Unique per-model keys (app.ModelName). Used for DOM IDs, positions, and relation endpoints.
    modelKeys,
    appLabels,
    mermaidSrc,
    dbmlSrc,
    plantUmlSrc,
    timelineSteps,
    snapshots,
    migrationComparisons,
  } = loadDiagramData();
  // Non-null assertions — App.svelte always renders these three elements.
  const tooltipEl = document.getElementById('tooltip') as HTMLElement;
  const canvas = document.getElementById('canvas') as HTMLElement;
  const canvasContent = document.getElementById('canvas-content') as HTMLElement;
  // The legacy `svg` reference (used to read `<svg id="svg">` directly) is gone.
  // Svelte's RelationsLayer owns the SVG element; the legacy writes paths to
  // the renderedRelations store via computeRelationPaths().

  // ── Seed toolbar display stores from data ──
  // App.svelte renders Toolbar + CompareBanner directly; here we just
  // populate the stores that those components read.
  toolbar.appLabels = appLabels || [];
  toolbar.boxes = tooltipData;
  const _migrations: MigrationEntry[] = migrationComparisons.map(m => ({
    appLabel: m.appLabel ?? '',
    name: m.migrationName ?? '',
  }));
  toolbar.migrations = _migrations;
  toolbar.hasMigrations = _migrations.length > 0;

  const _fkCount = relations.filter(r => r.type === 'FK').length;
  const _m2mCount = relations.filter(r => r.type === 'M2M').length;
  const _o2oCount = relations.filter(r => r.type === 'O2O').length;
  const _apps = new Set<string>();
  let _totalFields = 0;
  let _largest: { name: string; fieldCount: number } = { name: '—', fieldCount: 0 };
  tooltipData.forEach(d => {
    if (d.appLabel) _apps.add(d.appLabel);
    _totalFields += d.fieldCount || 0;
    if ((d.fieldCount || 0) > _largest.fieldCount) {
      _largest = { name: d.key || d.name, fieldCount: d.fieldCount };
    }
  });
  toolbar.metrics = {
    totalModels: tooltipData.length,
    fkCount: _fkCount,
    m2mCount: _m2mCount,
    o2oCount: _o2oCount,
    appCount: _apps.size,
    avgFields: tooltipData.length > 0 ? Math.round(_totalFields / tooltipData.length) : 0,
    maxFieldsModel: _largest.name,
    maxFieldsCount: _largest.fieldCount,
  };

  // BOX_W / BOX_H are computed by App.svelte (from longest model key) and
  // written to boxDimensions before this script imports. We just read them.
  const BOX_W = boxDimensions.w;
  const BOX_H = boxDimensions.h;
  // ── Persistence ──
  // installPersistence wires vscode.setState/getState and builds the
  // snapshot from positionsState + toolbar state + canvas scroll.
  const persistence = installPersistence({ vscode, canvas: canvas as HTMLElement });

  // Thin aliases used throughout the boot — declared BEFORE setupViewport
  // because the viewport ctx reads saveViewportSoon, and esbuild hoists
  // these const arrows as undefined until their initializer runs.
  const persistState = (): void => persistence.persist();
  const savePositions = (): void => persistence.persist();
  const saveViewportSoon = (): void => persistence.persistSoon();

  // ── Zoom state ──
  // Two-tier zoom: `zoom` is what the user SEES (the live visual scale), `bakedZoom`
  // is the CSS `zoom` value currently committed to the layout. Between them, we use
  // `transform: scale(zoom / bakedZoom)` as a cheap GPU delta during live interaction.
  // After 800ms of no zoom change the SHARPEN timer fires and bakes the live zoom
  // into CSS `zoom` — the browser re-rasterises text + borders at the new size, which
  // eliminates the transform-scale blur the user noticed past 1.5×. Trade-off baked
  // in: live zooming is blurry-but-fluid; settled view is sharp.
  // Zoom + pan + viewport input is owned by $lib/helpers/viewport.ts. The
  // viewport API exposes applyZoom / expandCanvas / zoomIn / zoomOut /
  // zoomReset / fitToVisible / togglePan / isPanMode that this module's
  // existing callsites and toolbar action registration use. `toolbar.zoom`
  // is the source of truth — read directly by computeRelationPaths etc.
  let viewport: ViewportApi | null = null;
  const applyZoom = (): void => viewport?.applyZoom();
  const expandCanvas = (): void => viewport?.expandCanvas();
  const fitToVisible = (): void => viewport?.fitToVisible();

  // ── State read by draw-relations on every drawLines() ──
  let currentVisibleModels: Set<string> | null = null;

  // ── Blast-radius composable — owns selectedModel + highlight/blast paint ──
  // drawRelations' getSelectedModel closure reads this; declared before
  // drawRelations so the closure resolves to a real api at call time.
  // onRedraw uses a lazy closure (drawLines is a const declared just below).
  const blastRadius = installBlastRadius({
    modelKeys,
    relations,
    onRedraw: () => drawLines(),
  });

  // ── Relation path computation ──
  // Declared BEFORE setupViewport because the viewport ctx reads
  // scheduleDrawLines (otherwise it'd be TDZ-undefined at applyZoom time).
  const drawRelations = installDrawRelations({
    canvas: canvas as HTMLElement,
    modelKeys,
    relations,
    boxW: BOX_W,
    boxH: BOX_H,
    getActiveFilters: () => toolbar.activeFilters,
    getSelectedModel: () => blastRadius.getSelected(),
  });
  const drawLines = (): void => drawRelations.draw(currentVisibleModels);
  // Single writer for the visible set. The timeline used to draw a filtered
  // set without recording it, so the next plain drawLines() — any box
  // select/deselect — brought every relation back over hidden boxes.
  const drawLinesFiltered = (v: Set<string> | null): void => {
    currentVisibleModels = v;
    drawRelations.draw(v);
  };
  const scheduleDrawLines = drawRelations.scheduleDraw;

  // ── Layout composable — owns positions + computeLayout + relayout ──
  // Measured, not captured: detail mode multiplies box height, so the slot
  // size auto-arrange spaces by has to come from what is rendered NOW.
  // offsetWidth/Height are layout px, unaffected by the viewport zoom.
  const measureBoxSize = (): { w: number; h: number } => {
    const boxes: { w: number; h: number }[] = [];
    document.querySelectorAll<HTMLElement>('.model-box').forEach(b => {
      if (b.classList.contains('hidden')) return;
      boxes.push({ w: b.offsetWidth, h: b.offsetHeight });
    });
    return largestBox(boxes, { w: BOX_W, h: BOX_H });
  };

  const layout = installLayout({ modelKeys, relations, tooltipData, getBoxSize: measureBoxSize });

  // Declared ABOVE setupViewport for the same reason as scheduleDrawLines:
  // applyZoom() runs during boot and fires onZoomChange, so a `let` further
  // down the file would still be in its temporal dead zone and throw.
  let zoneFrame = 0;
  function scheduleZoneRedraw(): void {
    if (zoneFrame) return;
    zoneFrame = requestAnimationFrame(() => {
      zoneFrame = 0;
      drawAppZones();
    });
  }

  // ── Viewport input (pan / wheel zoom / keyboard / fit / expandCanvas) ──
  viewport = setupViewport({
    canvas,
    canvasContent,
    getPositions: () => positionsState.byKey,
    modelKeys,
    getBoxSize: measureBoxSize,
    scheduleDrawLines,
    saveViewportSoon,
    // Coalesced to one frame: applyZoom fires on every wheel tick, and
    // rebuilding the zone nodes per tick would thrash the DOM.
    onZoomChange: () => scheduleZoneRedraw(),
    focusSearch: () => {
      // Two SearchBox instances live in the DOM (wide toolbar +
      // offcanvas); only one is visible per breakpoint. Focus the
      // VISIBLE one — offsetParent is null while display:none — so
      // the '/' shortcut never lands on the hidden input.
      const boxes = document.querySelectorAll('[data-search-input]');
      const visible = Array.from(boxes).find(el => (el as HTMLElement).offsetParent !== null);
      visible?.querySelector('input')?.focus();
    },
  });

  // ── Restore saved positions or compute fresh layout ──
  const saved = persistence.load();
  const savedValid = layout.restoreOrCompute(saved);
  const hadSavedViewport =
    savedValid &&
    saved !== null &&
    typeof saved.zoom === 'number' &&
    saved.zoom > 0 &&
    typeof saved.scrollLeft === 'number' &&
    typeof saved.scrollTop === 'number';
  expandCanvas();
  // Restore saved zoom BEFORE drawing so culling math uses the final scale.
  if (hadSavedViewport) {
    viewport.setZoom(saved.zoom, false);
  }

  applyZoom();
  drawAppZones();
  drawLines();
  // Restore scroll AFTER layout has painted — otherwise the canvas' scroll range isn't
  // established yet and the browser clamps the target to (0, 0).
  if (hadSavedViewport) {
    requestAnimationFrame(() => {
      canvas.scrollLeft = saved.scrollLeft;
      canvas.scrollTop = saved.scrollTop;
    });
  } else if (!savedValid) {
    // First-ever load (no saved state): auto-fit if the diagram overflows the viewport.
    // Respect user layout on reload — only auto-fit when we computed positions fresh.
    requestAnimationFrame(() => {
      if (shouldAutoFit()) fitToVisible();
    });
  }

  function shouldAutoFit(): boolean {
    let maxX = 0,
      maxY = 0;
    for (const k of modelKeys) {
      const p = positionsState.byKey[k];
      if (!p) continue;
      maxX = Math.max(maxX, p.x + BOX_W);
      maxY = Math.max(maxY, p.y + BOX_H);
    }
    return maxX > canvas.clientWidth || maxY > canvas.clientHeight;
  }

  // applyPositions / syncPositions removed — BoxesLayer subscribes to
  // positionsState directly and re-renders on every mutation.

  function drawAppZones(): void {
    drawAppZonesHelper({
      canvasContent,
      getPositions: () => positionsState.byKey,
      boxW: BOX_W,
      boxH: BOX_H,
      // Zone chrome is counter-scaled against this, so zones MUST be
      // redrawn on zoom change — see scheduleZoneRedraw above.
      zoom: viewport?.getZoom() ?? 1,
    });
  }

  // ── Tooltip on hover ──
  const dataMap: Record<string, (typeof tooltipData)[number]> = {};
  tooltipData.forEach(d => {
    dataMap[d.key] = d;
  });

  // Compare-mode + Timeline-mode composables — mutually exclusive, each force-exits
  // the other on activation. Declared with forward `let` so the cross-callbacks
  // resolve lazily at call time (neither fires during install).
  // Assigned below, but READ by the callback two lines down — which is the
  // whole point of declaring it forward. It cannot become a `const`.
  // eslint-disable-next-line prefer-const
  let timelineMode: import('$lib/composables/timeline-mode').TimelineModeApi;
  const compareMode = installCompareMode({
    modelKeys,
    migrationComparisons,
    onTimelineConflict: () => timelineMode?.deactivate(),
    onPersist: () => persistState(),
    onExit: () => tooltipApi.removeDiffMode(),
  });
  timelineMode = installTimelineMode({
    modelKeys,
    relations,
    timelineSteps,
    snapshots,
    onCompareConflict: () => {
      if (compareMode.getIndex() >= 0) compareMode.exit();
    },
    onRedrawFiltered: v => drawLinesFiltered(v),
    // Capped at 1, same as the search/app filter: framing a two-model
    // migration should not slam the user to 300%.
    onFrameVisible: keys => viewport?.fitToKeys(keys, 1),
    onRedrawAppZones: () => drawAppZones(),
  });

  // Tooltip + resize + box-hover/click + pinned-actions live in tooltip-controller.
  const tooltipApi: TooltipApi = setupTooltip({
    tooltipEl: tooltipEl as HTMLElement,
    dataMap,
    getActiveCompareIdx: () => compareMode.getIndex(),
    getActiveStep: () => timelineMode?.getSelectedStep() ?? null,
    getActiveChangedByKey: () => compareMode.getChangedByKey(),
    migrationComparisons,
    snapshots,
    lastDragMoved,
    onSourceNavigate: key => vscode.postMessage({ type: 'navigate', model: key }),
  });

  // Box drag is fully owned by $lib/helpers/drag.ts now — ModelBox.svelte
  // fires it on onmousedown. The window mousemove/mouseup listeners and the
  // per-box drag state live inside that helper.

  setBoxDragContext({
    canvasContent: canvasContent as HTMLElement,
    tooltipEl: tooltipEl as HTMLElement,
    isPanMode: () => viewport?.isPanMode() ?? false,
    getZoom: () => toolbar.zoom,
    scheduleRedraw: scheduleDrawLines,
    onDragEnd: () => {
      savePositions();
      expandCanvas();
      drawAppZones();
    },
  });

  // Toolbar actions are registered via setActions({...}) at the bottom of this
  // file — Svelte's ToolbarBtn onclick calls actions().X() and Svelte stores
  // drive the `.active` class reactively. Per-button DOM listeners are gone.
  let detailMode = false;
  let cyclesMode = false;

  const onRefreshAction = (): void => {
    // The Refresh button is a Svelte component reading toolbar.isRefreshing —
    // flipping the state swaps the icon for a Spinner and disables clicks.
    // The extension will respond by replacing webview.html when the rescan
    // finishes; the new webview boots with isRefreshing=false, so we don't
    // need to clear the flag manually.
    toolbar.isRefreshing = true;
    vscode.postMessage({ type: 'refresh' });
  };

  const onRelayoutAction = (): void => {
    layout.relayout();
    savePositions();
    expandCanvas();
    drawAppZones();
    drawLines();
  };

  const onToggleDetailAction = (): void => {
    detailMode = !detailMode;
    document.body.classList.toggle('detail-mode', detailMode);
    toolbar.detailMode = detailMode;
    // Boxes grow several times taller, so the existing spacing overlaps.
    // "Auto-arrange boxes" now measures the rendered size and re-spaces.
    drawLines();
  };

  // Compact density: shrinks ModelBox padding + font. Layout slots remain
  // the same width (BOX_W), so toggling density doesn't reflow positions —
  // boxes just visually breathe less. Redraw lines since box heights shift
  // by a few px.
  const onToggleDensityAction = (): void => {
    toolbar.densityMode = toolbar.densityMode === 'compact' ? 'comfortable' : 'compact';
    drawLines();
  };

  const onToggleCyclesAction = (): void => {
    cyclesMode = !cyclesMode;
    document.body.classList.toggle('show-cycles', cyclesMode);
    toolbar.cyclesMode = cyclesMode;
  };

  // ── Compare vs migration mode ──
  // Enter/exit live in $lib/composables/compare-mode (see compareMode above).
  // Thin aliases keep the legacy call sites compact for Phase 13.
  const enterCompareMode = (idx: number): void => compareMode.enter(idx);
  const exitCompareMode = (): void => compareMode.exit();

  // Compare picker (in CompareBanner.svelte) fires actions().selectCompareMigration(idx)
  // — registered via setActions below. Exit button fires actions().exitCompare().
  // The picker's displayed value derives reactively from toolbar.compareIdx,
  // which compareMode.enter(idx) sets — no imperative DOM sync needed.

  // "Enter compare mode" — activates with the LATEST migration preselected; user can
  // then switch via the banner's picker. Wired through setActions below.
  const onEnterCompareAction = (): void => {
    if (migrationComparisons.length === 0) return;
    enterCompareMode(migrationComparisons.length - 1);
  };

  // ── Keyboard shortcuts ──
  // + / - / 0 — zoom step / fit-1:1
  // F          — fit to visible
  // /          — focus search input
  // Arrows     — pan the viewport (Shift = bigger step)
  // Space      — hand tool: while held, click+drag anywhere pans the view
  //
  // VS Code webviews don't always receive keyboard events until something inside the
  // iframe is focused (host swallows arrows for sidebar navigation otherwise). We make
  // the canvas focusable via tabindex AND auto-focus it on every mousedown so arrow
  // keys reliably work after any interaction with the diagram.
  canvas.setAttribute('tabindex', '-1');
  canvas.style.outline = 'none';
  canvas.addEventListener('mousedown', () => {
    canvas.focus();
  });
  // Try an initial focus too — works once the webview is the active panel.
  requestAnimationFrame(() => canvas.focus());

  // Keyboard handling (Space hold for pan, +/-/0, F, arrows, /) lives in
  // $lib/helpers/viewport.ts — wired by setupViewport() above.

  showPanHintOnce();

  // ── Search + app filter + hide via right-click ──
  // search-filter composable owns parsedQuery / appFilter / hiddenKeys
  // + the apply pass (hide flags + center on subset).
  const searchFilter = installSearchFilter({
    modelKeys,
    dataMap,
    onApply: visibleModels => drawLinesFiltered(visibleModels),
    onRedrawAppZones: () => drawAppZones(),
    // Capped at 1: framing three survivors should not slam the user to 300%.
    onFrameVisible: keys => viewport?.fitToKeys(keys, 1),
  });
  const applyFilters = (): void => searchFilter.apply();
  const onShowAllHiddenAction = (): void => searchFilter.showAll();

  // Toolbar dropdowns (View / Analyze / Export) are fully owned by
  // Dropdown.svelte — open/close, viewport-edge alignment flip, and
  // close-on-action-click all live in that molecule.

  // ── Context menu (right-click on model-box) ──
  // ContextMenu.svelte is rendered by App.svelte; we just wire the
  // contextmenu event on each box to build its items and open the menu
  // via the contextMenuState store.

  document.querySelectorAll('.model-box').forEach(box => {
    box.addEventListener('contextmenu', ev => {
      const e = ev as MouseEvent;
      e.preventDefault();
      const key = box.getAttribute('data-model');
      const app = box.getAttribute('data-app');
      if (!key) return;
      const hidden = searchFilter.getHiddenKeys();
      const items: ContextMenuItem[] = [
        {
          label: 'Hide this model',
          icon: IconVisibilityOff,
          tone: 'danger',
          onClick: () => searchFilter.hideKey(key),
        },
      ];
      if (app) {
        items.push({
          label: `Hide all from "${app}"`,
          icon: IconVisibilityOff,
          tone: 'danger',
          onClick: () => searchFilter.hideApp(app),
        });
      }
      if (hidden.size > 0) {
        items.push({ sep: true });
        items.push({
          label: `Show all (${hidden.size} hidden)`,
          icon: IconVisibility,
          onClick: () => searchFilter.showAll(),
        });
      }
      openContextMenu(e.clientX, e.clientY, items);
    });
  });

  // Relation-kind toggle: flip the bit in toolbar state — FilterButton
  // re-renders reactively + draw-relations reads the same map via
  // getActiveFilters. Single source of truth, no shadow copy.
  const toggleRelationFilter = (kind: RelationKind): void => {
    toolbar.activeFilters = {
      ...toolbar.activeFilters,
      [kind]: !toolbar.activeFilters[kind],
    };
    applyFilters();
  };

  // Parse the raw search string into { scope, query }. Default scope is 'model' — typing
  // "Product" without a prefix only matches model names. Explicit prefixes opt into the
  // Search input + app dropdown wire to the search-filter composable. Listeners
  // stay on raw DOM until Phase 13 swaps to actions() registrations.
  // Search input + app dropdown are wired through the toolbar actions
  // registry below (setSearchQuery / setAppFilter) — Svelte invokes
  // actions().X from the components' onInput / onChange handlers.

  // ── Click on model → highlight its relations (or blast tree in blast-mode) ──
  // Both modes funnel through blastRadius.onBoxClick which branches internally.
  document.querySelectorAll('.model-box').forEach(box => {
    box.addEventListener('click', () => {
      if (lastDragMoved()) return;
      const name = box.getAttribute('data-model');
      if (name) blastRadius.onBoxClick(name);
    });
  });

  // Click on empty canvas (not on a box) clears the focus / blast highlight.
  // Mousedown is used instead of click so drags don't accidentally clear.
  const canvasEl = document.getElementById('canvas');
  canvasEl?.addEventListener('mousedown', e => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    if (target.closest('.model-box')) return;
    if (target.closest('#tooltip')) return;
    blastRadius.clearFocus();
  });

  // ESC clears focus globally — pairs with the ShortcutsHelp "Esc" entry.
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    // Don't fight the SearchBox's own ESC (clears the search input).
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
    blastRadius.clearFocus();
  });

  // applyFilters / centerOnKeys live in $lib/composables/search-filter
  // (searchFilter.apply / centerOnKeys is internal).

  // First draw with the now-known filter state — applyFilters() earlier in
  // the boot block already set currentVisibleModels if a search/app filter
  // was restored from persisted state.
  drawLinesFiltered(currentVisibleModels);

  // Copy toast + clipboard helpers live in $lib/helpers/exports.ts.
  // copyText is a thin wrapper that preserves the legacy signature so the
  // existing addEventListener callsites stay untouched.
  const copyText = (id: string, src: string, toastLabel: string): void =>
    copyToClipboard({ buttonId: id, text: src, toastLabel });

  const onExportMermaidAction = (): void => copyText('btn-mermaid', mermaidSrc, 'Mermaid');
  const onExportDbmlAction = (): void => copyText('btn-dbml', dbmlSrc, 'DBML');
  const onExportPumlAction = (): void => copyText('btn-puml', plantUmlSrc, 'PlantUML');

  // ── Layout save (to clipboard) / load (from file) ──
  const onSaveLayoutAction = (): void => {
    const json = buildLayoutJson(LAYOUT_VERSION, positionsState.byKey);
    copyText('btn-layout-save', json, 'Layout JSON');
  };
  const layoutInput = document.getElementById('layout-file-input') as HTMLInputElement | null;
  const onLoadLayoutAction = (): void => layoutInput?.click();
  layoutInput?.addEventListener('change', e => {
    const files = (e.target as HTMLInputElement).files;
    const file = files && files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = parseLayoutPayload(String(reader.result));
        layout.setFromPayload(payload.positions);
        expandCanvas();
        drawAppZones();
        drawLines();
        savePositions();
        showToast('Layout loaded');
      } catch (err) {
        console.error('[layout-load]', err);
        showToast('Invalid layout file', true);
      }
    };
    reader.readAsText(file);
    // Reset the input so the same file can be re-selected later
    (e.target as HTMLInputElement).value = '';
  });

  // buildExportSvg lives in $lib/composables/export-svg — the boot just wires the action.
  const onExportSvgAction = (): void => {
    const svgContent = buildExportSvg();
    copyText('btn-svg', svgContent, 'SVG markup');
  };

  // Blast-radius toggle — implementation in $lib/composables/blast-radius.
  const onToggleBlastAction = (): void => blastRadius.toggle();

  // ── Migration Timeline ──
  // Timeline.svelte is rendered by App.svelte; it shows only when
  // timeline.active is true.

  // Timeline composable owns active/currentStep + classify + slider actions.
  const onToggleTimelineAction = (): void => timelineMode.toggle();

  // ── Restore active compare mode from persisted state ──
  // Runs at the tail of the module after all setup. Live reload (scanner re-scans on
  // models.py save) replaces webview.html and re-runs this script — without this, the
  // user's open diff view silently disappears on every save.
  const restoreIdx = shouldRestoreCompareIdx(
    saved ? saved.compareIdx : undefined,
    migrationComparisons.length,
  );
  if (restoreIdx !== null) {
    // CompareBanner's Select re-renders from toolbar.compareIdx (set inside
    // enterCompareMode) — the old imperative picker sync is gone.
    enterCompareMode(restoreIdx);
  } else if (saved && saved.compareIdx !== undefined) {
    // There WAS a saved compareIdx but shouldRestoreCompareIdx rejected it (stale after
    // migrations shrank, wrong type, etc.). Rewrite state to drop the invalid entry.
    console.warn(
      '[diagram] saved compareIdx',
      saved.compareIdx,
      'invalid for current data (',
      migrationComparisons.length,
      'comparisons) — clearing',
    );
    persistState();
  }

  // ── Register toolbar actions ──
  // The Svelte Toolbar calls actions().X() from each ToolbarBtn's onclick;
  // this single registration wires all toggles, exports, layout, compare,
  // and zoom/pan/fit handlers through one place. Toggles drive their
  // matching stores so ToolbarBtn `active` classes reflect state reactively.
  const toolbarActions: ToolbarActions = {
    zoomIn: () => viewport!.zoomIn(),
    zoomOut: () => viewport!.zoomOut(),
    zoomReset: () => viewport!.zoomReset(),
    fitToVisible: () => viewport!.fitToVisible(),
    togglePan: () => viewport!.togglePan(),
    refresh: onRefreshAction,
    relayout: onRelayoutAction,
    toggleDetail: onToggleDetailAction,
    toggleDensity: onToggleDensityAction,
    showAllHidden: onShowAllHiddenAction,
    toggleCycles: onToggleCyclesAction,
    toggleBlast: onToggleBlastAction,
    toggleTimeline: onToggleTimelineAction,
    enterCompare: onEnterCompareAction,
    exitCompare: exitCompareMode,
    selectCompareMigration: idx => enterCompareMode(idx),
    exportMermaid: onExportMermaidAction,
    exportDbml: onExportDbmlAction,
    exportPuml: onExportPumlAction,
    exportSvg: onExportSvgAction,
    saveLayout: onSaveLayoutAction,
    loadLayout: onLoadLayoutAction,
    setSearchQuery: q => searchFilter.setSearchQuery(q),
    setAppFilter: label => searchFilter.setAppFilter(label),
    toggleRelationFilter,
    navigateToModel: key => {
      const el = document.getElementById('box-' + key);
      if (el) el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    },
  };
  setActions(toolbarActions);

  // Last statement on purpose: reaching it means the whole boot ran.
  // `webviewError` only fires on a THROW, so a bundle that failed to
  // parse or a mount that quietly produced nothing left the extension
  // side with no way to tell a working panel from an empty frame.
  vscode.postMessage({ type: 'ready' });
}
