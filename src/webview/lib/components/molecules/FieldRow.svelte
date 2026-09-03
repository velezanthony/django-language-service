<script lang="ts">
  import { ChoicesPopup } from '$molecules';
  import type { FieldLine } from '$lib/types/tooltip-data';

  type Props = {
    field: FieldLine;
  };

  let { field }: Props = $props();
</script>

<div
  class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-3.5 py-1 text-xs transition-colors duration-fast hover:bg-accent-subtle"
>
  <span class="font-semibold min-w-[80px] shrink-0">{field.name}</span>
  <span class="text-vsc-desc">{field.type}</span>
  {#if field.choices}
    <ChoicesPopup choices={field.choices} />
  {/if}
  {#if field.attrs?.length}
    <span class="text-vsc-desc text-[11px] opacity-70">({field.attrs.join(', ')})</span>
  {/if}
  <!-- Inherited fields are real columns on this table (Django copies abstract
       base fields in), but saying where they come from beats a silent merge. -->
  {#if field.inheritedFrom}
    <span
      class="ml-auto shrink-0 text-meta italic text-vsc-desc/70"
      title="Inherited from {field.inheritedFrom}">↑ {field.inheritedFrom}</span
    >
  {/if}
</div>
{#if field.doc}
  <div class="px-3.5 pt-0 pb-1 text-[10.5px] text-vsc-desc leading-[1.35] italic">{field.doc}</div>
{/if}
