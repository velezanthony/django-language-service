<script lang="ts">
  import { onMount } from 'svelte';
  import { BoxesLayer, RelationsLayer, Timeline, Toast, Toolbar } from '$organisms';
  import GhostBoxesLayer from '$lib/components/organisms/GhostBoxesLayer.svelte';
  import { ContextMenu, ShortcutsHelp } from '$molecules';
  import { loadDiagramData } from '$lib/composables/diagram-data';
  import { boxDimensions } from '$lib/state/positions.svelte';
  import { toolbar } from '$lib/state/toolbar.svelte';
  import {
    RELATION_KINDS,
    RELATION_LABELS,
    RELATION_CARDINALITY,
    type RelationKind,
  } from '$lib/types/relations';

  const LEGEND_LINE: Record<RelationKind, string> = {
    FK: 'bg-fk',
    M2M: 'legend-line-m2m',
    O2O: 'bg-o2o',
  };

  const data = loadDiagramData();

  // Per-box content-driven width; layout engine reserves slot = workspace MAX.
  const MIN_BOX_W = 120;
  const KEY_PX = 9;
  const PILL_AND_PAD = 80;
  const computeBoxWidth = (modelKey: string): number =>
    Math.max(MIN_BOX_W, Math.ceil(modelKey.length * KEY_PX + PILL_AND_PAD));

  const widths: Record<string, number> = {};
  let maxW = MIN_BOX_W;
  for (const key of data.modelKeys) {
    const w = computeBoxWidth(key);
    widths[key] = w;
    if (w > maxW) maxW = w;
  }
  boxDimensions.widths = widths;
  boxDimensions.w = maxW;
  boxDimensions.h = 48;

  onMount(async () => {
    const { installDiagram } = await import('$lib/composables/diagram-boot');
    installDiagram();
  });
</script>

<!--
  h-screen anchors the wrapper directly to the viewport (100vh) instead of
  depending on the html → body → #app height-chain. The chain works in
  theory (tailwind.css @layer base sets all three to 100%) but layer-
  ordering and CSP-stripped inline-style fallbacks were flaky in the
  diagram webview iframe — the canvas left a gap above the legend when
  any link in the chain didn't resolve. h-screen sidesteps the whole
  question.
-->
<div class="flex flex-col h-screen overflow-hidden">
  <Toolbar />

  <!-- Load arrangement button target; boot.ts wires the change listener. -->
  <input
    type="file"
    id="layout-file-input"
    accept="application/json"
    aria-hidden="true"
    tabindex="-1"
  />

  <!-- Unified migration history: the graph + "compare vs" selector replaces the
       old standalone Timeline slider and CompareBanner. -->
  <Timeline />
  <ContextMenu />
  <Toast />

  <!--
    min-h-0 / min-w-0 are the flex-shrink gotcha fix: a flex child with
    `overflow-auto` defaults to min-height/min-width:auto, which means
    "at least as tall/wide as my content". That made the canvas grow to
    fit its 200+ model boxes instead of respecting flex-1's allotted
    slot — pushing the legend off the bottom of the wrapper and leaving
    only the top sliver of canvas visible inside h-screen. With min-h-0
    the canvas honours its flex allotment; the inner content scrolls.
  -->
  <!--
    The wrapper owns the flex slot; #canvas scrolls INSIDE it.
    That split is load-bearing. `position: absolute` inside a scroll container
    resolves against the padding box at the SCROLL ORIGIN, so an `inset-0`
    overlay is sized to the visible area but travels with the content: measured
    at scroll (300,400) the vignette sat at (-300,-239). Its transparent core
    then lands somewhere across the middle of the diagram as a bright rectangle
    instead of framing the view. The pan hint (centred) and the compare-mode
    ghost panel (corner-pinned) drift the same way, for the same reason.
    Screen-space chrome belongs outside the scroll container. Only
    #canvas-content, which is genuinely in canvas coordinates, stays in.
  -->
  <div class="relative flex-1 min-h-0 min-w-0">
    <div
      id="canvas"
      class="canvas-dot-grid absolute inset-0 p-5 overflow-auto data-[panning=true]:cursor-grabbing"
    >
      <div id="canvas-content" class="relative w-full h-full origin-top-left will-change-transform">
        <RelationsLayer />
        <BoxesLayer boxes={data.tooltipData} boxW={boxDimensions.w} boxH={boxDimensions.h} />
      </div>
    </div>
    <div
      id="pan-hint"
      class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/70 text-vsc-editor-fg px-4 py-2 rounded-lg text-xs pointer-events-none opacity-0 z-hint transition-opacity duration-slow data-[visible=true]:opacity-100"
    >
      Space + drag (or 🖐 Pan) to navigate · Ctrl + wheel to zoom · Arrows to pan
    </div>
    <!-- Ghost cards for models removed since the compared migration (compare mode). -->
    <GhostBoxesLayer />
    <!-- Radial vignette — darkens canvas edges. -->
    <div
      class="canvas-vignette pointer-events-none absolute inset-0 z-canvas-box-dragging"
      aria-hidden="true"
    ></div>
  </div>

  <!-- tooltip-controller mounts Tooltip/DiffTooltip on hover via data attrs. -->
  <div
    id="tooltip"
    class="hidden absolute z-tooltip origin-top-left bg-vsc-card-bg border border-vsc-link/50 rounded-lg p-0 min-w-[260px] max-w-[440px] max-h-[80vh] flex-col shadow-panel pointer-events-none overflow-hidden
           data-[visible=true]:flex
           data-[visible=true]:motion-safe:animate-[fade-scale-in_var(--duration-fast)_var(--ease-spring)]
           data-[pinned=true]:pointer-events-auto data-[pinned=true]:border-fk data-[pinned=true]:z-tooltip-pinned
           data-[diff=true]:max-w-[640px] data-[diff=true]:min-w-[460px]"
  ></div>

  <div
    class="shrink-0 flex flex-wrap items-center gap-x-5 gap-y-1.5 px-5 py-2 bg-vsc-card-bg border-t border-vsc-card-border text-[11px] z-chrome whitespace-nowrap"
  >
    {#each RELATION_KINDS as kind (kind)}
      <span class="flex items-center gap-1.5">
        <span class="w-6 h-0.5 {LEGEND_LINE[kind]}"></span>
        {RELATION_LABELS[kind]} ({RELATION_CARDINALITY[kind]})
      </span>
    {/each}
    <span class="w-px h-3.5 bg-vsc-card-border self-center mx-1"></span>
    <span
      class="flex items-center gap-1.5 text-vsc-desc"
      title="No relations to or from this model"
    >
      <span
        class="inline-block w-5 h-3 border border-dashed border-vsc-card-border rounded-sm opacity-55"
      ></span>
      Orphan
    </span>
    <span
      class="flex items-center gap-1.5 text-vsc-desc"
      title="Abstract base class (Meta.abstract = True)"
    >
      <span class="inline-block w-5 h-3 border border-dashed border-m2m rounded-sm"></span>
      Abstract
    </span>
    {#if toolbar.timelineMode}
      <span
        class="flex items-center gap-1.5 text-vsc-desc"
        title="Not changed by this migration — shown because it links to a model that was."
      >
        <span
          class="inline-block w-5 h-3 border border-dashed border-vsc-desc/35 rounded-sm opacity-45"
        ></span>
        Affected
      </span>
    {/if}
    <span class="w-px h-3.5 bg-vsc-card-border self-center mx-1"></span>
    <span
      class="flex items-center gap-1.5 text-vsc-desc"
      title="Each Django app gets a stable colour, shown as a stripe on the left edge of every model box."
    >
      <span class="inline-flex gap-0.5">
        <span
          class="inline-block w-1 h-3 rounded-sm app-stripe-sample"
          style:--app-stripe-from="hsl(120,55%,62%)"
          style:--app-stripe-to="hsl(120,55%,30%)"
        ></span>
        <span
          class="inline-block w-1 h-3 rounded-sm app-stripe-sample"
          style:--app-stripe-from="hsl(260,55%,62%)"
          style:--app-stripe-to="hsl(260,55%,30%)"
        ></span>
        <span
          class="inline-block w-1 h-3 rounded-sm app-stripe-sample"
          style:--app-stripe-from="hsl(30,55%,62%)"
          style:--app-stripe-to="hsl(30,55%,30%)"
        ></span>
      </span>
      App
    </span>
    <div class="ml-auto">
      <ShortcutsHelp />
    </div>
  </div>
</div>
