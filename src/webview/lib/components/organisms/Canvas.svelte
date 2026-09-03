<script lang="ts">
  import type { Snippet } from 'svelte';

  type Props = {
    children?: Snippet;
  };

  let { children }: Props = $props();
</script>

<!--
  Canvas organism — the scrollable + pannable + zoomable surface that hosts
  ModelBox + RelationsLayer.

  Wiring done: pan / wheel zoom / two-tier zoom (transform scale + CSS zoom) /
  arrow-key viewport nudging / space-hold hand-tool / fit-to-screen all live in
  lib/helpers/viewport.ts (Phase 8.1). This component renders the canvas frame
  and the viewport helper owns the scroll/transform. Until App.svelte takes
  over the composition root, the static HTML in diagram-html.ts still owns the
  canvas DOM and this organism is unused — kept for the eventual hand-off.
  the legacy #canvas + #canvas-content nodes from the host HTML stay live.
-->

<div class="canvas" id="canvas">
  <div class="pan-hint" id="pan-hint">
    Space + drag (or 🖐 Pan) to navigate · Ctrl + wheel to zoom · Arrows to pan
  </div>
  <div class="canvas-content" id="canvas-content">
    {#if children}
      {@render children()}
    {/if}
  </div>
</div>
