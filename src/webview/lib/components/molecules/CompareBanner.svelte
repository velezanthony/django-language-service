<script lang="ts">
  import { actions, toolbar } from '$lib/state/toolbar.svelte';
  import { Button, Pill } from '$atoms';
  import { IconClose, IconCompare as IconCompareArrows } from '$icons';
  import { Select } from '$molecules';

  function onPickerChange(value: string) {
    if (!value) return;
    const idx = parseInt(value, 10);
    if (!Number.isNaN(idx)) actions().selectCompareMigration(idx);
  }

  const pickerOptions = $derived(
    toolbar.migrations.map((mig, idx) => ({
      value: String(idx),
      label: `${mig.appLabel}.${mig.name}`,
    })),
  );
  const pickerValue = $derived(toolbar.compareIdx >= 0 ? String(toolbar.compareIdx) : '');

  const isActive = $derived(toolbar.compareIdx >= 0);

  // overflow-hidden during the open/close transition so content doesn't
  // bleed; released once open so the Select popover below isn't clipped.
  let isAnimating = $state(false);
  let animTimer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    if (animTimer) clearTimeout(animTimer);
    isAnimating = true;
    if (isActive) animTimer = setTimeout(() => (isAnimating = false), 220);
    return () => {
      if (animTimer) {
        clearTimeout(animTimer);
        animTimer = null;
      }
    };
  });

  const clip = $derived(isAnimating ? 'overflow-hidden' : 'overflow-visible');
</script>

<div
  id="compare-banner"
  aria-hidden={!isActive}
  class="flex shrink-0 text-vsc-editor-fg text-xs items-center flex-wrap gap-x-3 gap-y-2
         bg-gradient-to-r from-o2o/[0.22] via-o2o/[0.10] to-o2o/[0.04]
         origin-top
         transition-[max-height,opacity,padding,border-width] duration-fast ease-spring
         shadow-[inset_0_-1px_0_0_color-mix(in_srgb,var(--color-o2o)_25%,transparent)]
         {clip}
         {isActive
    ? 'max-h-[120px] opacity-100 px-4 py-2 border-b border-o2o/70 pointer-events-auto'
    : 'max-h-0 opacity-0 px-4 py-0 border-b-0 border-transparent pointer-events-none'}"
>
  <span class="text-o2o font-bold whitespace-nowrap inline-flex items-center gap-1.5">
    <IconCompareArrows size={14} /> Compare current vs
  </span>
  <Select
    value={pickerValue}
    options={pickerOptions}
    onChange={onPickerChange}
    placeholder="Pick a migration…"
    minWidth={220}
    maxWidth={360}
    title="Pick a migration to compare against"
  />

  {#if toolbar.compareStats}
    <span class="inline-flex items-center gap-1.5 flex-wrap pl-3 border-l border-o2o/30">
      {#if toolbar.compareStats.added}
        <Pill kind="fk" size="sm" tabular>+{toolbar.compareStats.added} added</Pill>
      {/if}
      {#if toolbar.compareStats.changed}
        <Pill kind="o2o" size="sm" tabular>~{toolbar.compareStats.changed} changed</Pill>
      {/if}
      {#if toolbar.compareStats.removed}
        <Pill kind="danger" size="sm" tabular>−{toolbar.compareStats.removed} removed</Pill>
      {/if}
      {#if toolbar.compareStats.unchanged}
        <Pill kind="neutral" size="sm" tabular>{toolbar.compareStats.unchanged} unchanged</Pill>
      {/if}
    </span>
  {/if}

  <span class="text-vsc-desc/70 text-meta italic">dashed = removed</span>

  <div class="ml-auto">
    <Button id="compare-exit" variant="secondary" size="sm" onclick={() => actions().exitCompare()}>
      <IconClose size={14} /> Exit compare
    </Button>
  </div>
</div>
