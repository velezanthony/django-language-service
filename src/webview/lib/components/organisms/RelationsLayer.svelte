<script lang="ts">
  import { relationsState } from '$lib/state/relations.svelte';
  import { toolbar } from '$lib/state/toolbar.svelte';
  import { counterScale, showsLabels } from '$lib/helpers/zoom-chrome';

  // Compare mode dims all relations so the changed boxes draw the eye.
  const compareDim = $derived(toolbar.compareIdx >= 0);

  // This <svg> lives inside #canvas-content, so it is scaled by the viewport
  // zoom. A literal stroke-[1.5] therefore paints at 1.5 × zoom — 0.39px at
  // 26%, which Chrome truncates away entirely. Measured, not guessed:
  // scripts/diagram-harness. Counter-scaling keeps the painted width constant.
  //
  // Arrowheads need no separate treatment: markers default to
  // markerUnits="strokeWidth", so they track the counter-scaled stroke.
  const strokeW = $derived(counterScale(1.5, toolbar.zoom));

  // Labels are NOT counter-scaled — at 26% a 10px label would need to be 38px
  // in canvas space and would swamp the line it annotates. Below the threshold
  // the right output is nothing at all.
  const labelsVisible = $derived(showsLabels(toolbar.zoom));
  const labelSize = $derived(counterScale(10, toolbar.zoom));
  const onDeleteSize = $derived(counterScale(9, toolbar.zoom));

  // Per-line opacity rules. Three tiers:
  //   - dimmed      = filtered out (not in active query / not connected to focus) — barely visible
  //   - compareDim  = compare mode global mute
  //   - focused     = touches the currently-focused model — boosted to full opacity
  //   - default     = the resting state; ~40% so 200+ lines don't oversaturate
  const lineOpacity = (r: { dimmed: boolean; focused?: boolean }): string => {
    if (r.dimmed) return 'opacity-[0.04]';
    if (compareDim) return 'opacity-20';
    if (r.focused) return 'opacity-95';
    return 'opacity-40';
  };
  const labelOpacity = (r: { dimmed: boolean; focused?: boolean }): string => {
    if (r.dimmed) return 'opacity-[0.04]';
    if (compareDim) return 'opacity-20';
    if (r.focused) return 'opacity-100';
    return 'opacity-80';
  };

  const STROKE = { FK: 'stroke-fk', M2M: 'stroke-m2m [stroke-dasharray:8_4]', O2O: 'stroke-o2o' };
  const FILL = { FK: 'fill-fk', M2M: 'fill-m2m', O2O: 'fill-o2o' };
  const onDeletePalette = (action: string): string => {
    switch (action.toLowerCase()) {
      case 'cascade':
        return 'fill-danger';
      case 'protect':
        return 'fill-fk';
      case 'set-null':
        return 'fill-o2o';
      default:
        return 'fill-vsc-desc';
    }
  };

  // SVG text halo (.svg-text-halo) lives in tailwind.css — paint-order:stroke
  // renders a soft canvas-bg outline behind each label.
</script>

<svg id="svg" class="absolute top-0 left-0 w-full h-full pointer-events-none z-canvas-relations">
  <defs>
    <!--
      Refined arrowheads — thinner triangle (8×4 viewBox, refX 8) gives a more
      modern "pointer" look than the chunkier 10×7 default. Smaller markerWidth
      makes them feel proportional to the 2px stroke.
    -->
    <marker
      id="arrow-fk"
      viewBox="0 0 8 4"
      refX="8"
      refY="2"
      markerWidth="7"
      markerHeight="5"
      orient="auto-start-reverse"
    >
      <polygon points="0 0, 8 2, 0 4" fill="var(--color-fk)" />
    </marker>
    <marker
      id="arrow-m2m"
      viewBox="0 0 8 4"
      refX="8"
      refY="2"
      markerWidth="7"
      markerHeight="5"
      orient="auto-start-reverse"
    >
      <polygon points="0 0, 8 2, 0 4" fill="var(--color-m2m)" />
    </marker>
    <marker
      id="arrow-o2o"
      viewBox="0 0 8 4"
      refX="8"
      refY="2"
      markerWidth="7"
      markerHeight="5"
      orient="auto-start-reverse"
    >
      <polygon points="0 0, 8 2, 0 4" fill="var(--color-o2o)" />
    </marker>
  </defs>

  {#each relationsState.rendered as r (r.id)}
    {@const cls = r.type.toLowerCase()}
    <path
      d={r.d}
      stroke-width={strokeW}
      class="fill-none transition-opacity duration-fast {STROKE[r.type]} {lineOpacity(r)}"
      marker-end={`url(#arrow-${cls})`}
    />
    {#if labelsVisible}
      <text
        x={r.labelX}
        y={r.labelY}
        font-size={labelSize}
        class="svg-text-halo font-bold pointer-events-none {FILL[r.type]} {labelOpacity(r)}"
        text-anchor="middle"
      >
        {r.type}
      </text>
      <text
        x={r.cardX}
        y={r.cardY}
        font-size={labelSize}
        class="svg-text-halo fill-vsc-desc pointer-events-none {r.dimmed
          ? 'opacity-[0.04]'
          : compareDim
            ? 'opacity-20'
            : r.focused
              ? 'opacity-90'
              : 'opacity-55'}"
        text-anchor="middle"
      >
        {r.cardLabel}
      </text>
      {#if r.onDelete && r.onDeleteX !== undefined && r.onDeleteY !== undefined}
        <text
          x={r.onDeleteX}
          y={r.onDeleteY}
          font-size={onDeleteSize}
          class="svg-text-halo font-semibold pointer-events-none {onDeletePalette(
            r.onDelete,
          )} {labelOpacity(r)}"
          text-anchor="middle"
        >
          {r.onDelete}
        </text>
      {/if}
    {/if}
  {/each}
</svg>
