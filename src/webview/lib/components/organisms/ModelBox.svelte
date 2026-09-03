<script lang="ts">
  import type { FieldLine } from '$lib/types/tooltip-data';
  import type { BoxFlags } from '$lib/state/box-flags.svelte';
  import type { ModelFieldDiff } from '$lib/helpers/compare';
  import { draggable } from '$lib/actions/draggable';
  import { toolbar } from '$lib/state/toolbar.svelte';
  import { computeBoxClass } from '$lib/composables/use-box-visual-state';
  import { appColor } from '$lib/helpers/app-color';
  import ModelBoxHeader from './ModelBoxHeader.svelte';
  import ModelBoxFields from './ModelBoxFields.svelte';

  type Props = {
    boxKey: string;
    name: string;
    appLabel?: string;
    fieldCount: number;
    fields: FieldLine[];
    hubTier: number;
    isOrphan: boolean;
    isAbstract: boolean;
    isProxy: boolean;
    isInCycle: boolean;
    x: number;
    y: number;
    boxW: number;
    flags: BoxFlags;
    compareDiff?: ModelFieldDiff;
  };

  let {
    boxKey,
    name,
    appLabel = '',
    fieldCount,
    fields,
    hubTier,
    isOrphan,
    isAbstract,
    isProxy,
    isInCycle,
    x,
    y,
    boxW,
    flags,
    compareDiff,
  }: Props = $props();

  const REMOVED_FIELDS_LIMIT = 5;

  const addedSet = $derived(new Set(compareDiff?.added ?? []));
  const alteredSet = $derived(new Set(compareDiff?.altered ?? []));
  const removedFields = $derived((compareDiff?.removed ?? []).slice(0, REMOVED_FIELDS_LIMIT));

  const chipTitle = $derived.by(() => {
    if (!compareDiff) return '';
    const lines: string[] = [];
    if (compareDiff.added.length) lines.push(`Added: ${compareDiff.added.join(', ')}`);
    if (compareDiff.altered.length) lines.push(`Altered: ${compareDiff.altered.join(', ')}`);
    if (compareDiff.removed.length) lines.push(`Removed: ${compareDiff.removed.join(', ')}`);
    return lines.join('\n');
  });

  const isCompareMode = $derived(toolbar.compareIdx >= 0);

  const boxClass = $derived(
    computeBoxClass({
      flags,
      isCompareMode,
      isOrphan,
      isAbstract,
      isInCycle,
      hubTier,
      cyclesMode: toolbar.cyclesMode,
      detailMode: toolbar.detailMode,
      densityMode: toolbar.densityMode,
    }),
  );

  // Glyph prefix for the model name — abstract / compare states.
  const glyph = $derived.by(() => {
    if (isCompareMode && flags.compareAdded)
      return { ch: '+', cls: 'text-fk font-black text-[14px]' };
    if (isCompareMode && flags.compareRemoved)
      return { ch: '−', cls: 'text-danger font-black text-[14px]' };
    if (isCompareMode && flags.compareChanged)
      return { ch: '~', cls: 'text-o2o font-black text-[14px]' };
    if (isAbstract) return { ch: '⎔', cls: 'opacity-80 text-[12px]' };
    return null;
  });
</script>

<div
  class={boxClass}
  data-model={boxKey}
  data-app={appLabel}
  id={`box-${boxKey}`}
  style:left="{x}px"
  style:top="{y}px"
  style:width="{boxW}px"
  use:draggable={boxKey}
>
  {#if appLabel}
    <!--
      Per-app coloured stripe on the left edge. Colour is hashed from the
      app label so it's stable across reloads (no shipped palette to limit to
      N apps). pointer-events-none so it never blocks drag/click on the box.
      Vertical gradient — full colour at top, blended toward the canvas bg at
      bottom — gives the stripe the same "lit from above" feel as the card
      gradient on the surface itself.
    -->
    <span
      class="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-lg pointer-events-none"
      style:background="linear-gradient(180deg, {appColor(appLabel)} 0%, color-mix(in srgb, {appColor(
        appLabel,
      )} 55%, var(--color-vsc-bg)) 100%)"
      aria-hidden="true"
    ></span>
  {/if}
  <ModelBoxHeader
    {appLabel}
    {name}
    {fieldCount}
    {isOrphan}
    {isProxy}
    isContext={flags.tlContext ?? false}
    {glyph}
    {compareDiff}
    {chipTitle}
  />
  {#if toolbar.detailMode}
    <ModelBoxFields {fields} {addedSet} {alteredSet} {removedFields} />
  {/if}
</div>
