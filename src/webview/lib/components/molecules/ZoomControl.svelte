<script lang="ts">
  import { actions, toolbar } from '$lib/state/toolbar.svelte';

  // Children (buttons + zoom-display) share a base style — bottom-less border
  // groups them visually as one segmented control.
  const SEG =
    'bg-transparent text-vsc-desc border-0 text-xs cursor-pointer font-vsc ' +
    'px-3 leading-[34px] transition-[background-color,color] duration-fast ' +
    'hover:bg-vsc-link/[0.12] hover:text-vsc-link ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vsc-link/60 focus-visible:ring-inset';
</script>

<div
  class="inline-flex items-stretch border border-vsc-card-border/70 rounded-md overflow-hidden h-9 font-vsc bg-vsc-bg/30"
  title="Zoom — shortcut: +/- to zoom, 0 to reset"
>
  <button
    id="btn-zoom-out"
    class="{SEG} font-bold text-sm"
    title="Zoom out (−)"
    onclick={() => actions().zoomOut()}>−</button
  >
  <span
    id="zoom-display"
    class="{SEG} min-w-[56px] text-center text-vsc-editor-fg font-semibold border-l border-r border-vsc-card-border/70 tabular-nums"
    title="Reset zoom to 100% (shortcut: 0)"
    onclick={() => actions().zoomReset()}
    onkeydown={e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        actions().zoomReset();
      }
    }}
    role="button"
    tabindex="0"
  >
    {Math.round(toolbar.zoom * 100)}%
  </span>
  <button
    id="btn-zoom-in"
    class="{SEG} font-bold text-sm"
    title="Zoom in (+)"
    onclick={() => actions().zoomIn()}>+</button
  >
</div>
