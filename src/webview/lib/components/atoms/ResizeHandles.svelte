<script lang="ts">
  // Eight directional zones at the tooltip's edges/corners. The tooltip
  // controller (lib/helpers/tooltip-controller.ts) reads [data-resize] to
  // know which axis is being dragged. Handles stay non-interactive on hover
  // tooltips and only become active when `pinned` is true.
  type Props = { pinned: boolean };
  let { pinned }: Props = $props();

  const HOVER_TINT = 'hover:bg-vsc-link/[0.18]';
  // Pointer-events only when pinned; cursor + position per side/corner.
  const BASE = $derived(
    `absolute ${pinned ? 'pointer-events-auto' : 'pointer-events-none'} ${HOVER_TINT}`,
  );
</script>

<div class="{BASE} top-0 left-2 right-2 h-1.5 cursor-ns-resize" data-resize="n"></div>
<div class="{BASE} bottom-0 left-2 right-2 h-1.5 cursor-ns-resize" data-resize="s"></div>
<div class="{BASE} right-0 top-2 bottom-2 w-1.5 cursor-ew-resize" data-resize="e"></div>
<div class="{BASE} left-0 top-2 bottom-2 w-1.5 cursor-ew-resize" data-resize="w"></div>
<div class="{BASE} top-0 right-0 w-3 h-3 cursor-nesw-resize z-[1]" data-resize="ne"></div>
<div class="{BASE} top-0 left-0 w-3 h-3 cursor-nwse-resize z-[1]" data-resize="nw"></div>
<div class="{BASE} bottom-0 right-0 w-3 h-3 cursor-nwse-resize z-[1]" data-resize="se"></div>
<div class="{BASE} bottom-0 left-0 w-3 h-3 cursor-nesw-resize z-[1]" data-resize="sw"></div>
