<script lang="ts">
  import ModelBox from './ModelBox.svelte';
  import { boxDimensions, positionsState } from '$lib/state/positions.svelte';
  import { boxFlagsState, type BoxFlags } from '$lib/state/box-flags.svelte';
  import { compareDiff } from '$lib/state/compare-diff.svelte';
  import type { BoxRecord } from '$lib/types/box-data';

  type Props = {
    boxes: BoxRecord[];
    /** Fallback width when a box has no entry in boxDimensions.widths yet. */
    boxW: number;
    boxH: number;
  };

  let { boxes, boxW }: Props = $props();

  const EMPTY_FLAGS: BoxFlags = {};
</script>

{#each boxes as box (box.key)}
  <ModelBox
    boxKey={box.key}
    name={box.name}
    appLabel={box.appLabel}
    fieldCount={box.fieldCount}
    fields={box.fields}
    hubTier={box.hubTier}
    isOrphan={box.isOrphan}
    isAbstract={box.isAbstract}
    isProxy={box.isProxy}
    isInCycle={box.isInCycle}
    x={positionsState.byKey[box.key]?.x ?? 0}
    y={positionsState.byKey[box.key]?.y ?? 0}
    boxW={boxDimensions.widths[box.key] ?? boxW}
    flags={boxFlagsState.byKey[box.key] ?? EMPTY_FLAGS}
    compareDiff={compareDiff.byKey[box.key]}
  />
{/each}
