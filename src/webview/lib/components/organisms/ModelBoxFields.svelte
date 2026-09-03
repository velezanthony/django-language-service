<script lang="ts">
  import type { FieldLine } from '$lib/types/tooltip-data';

  type FieldDiffKind = 'added' | 'altered' | 'removed';

  type Props = {
    fields: FieldLine[];
    /** Names of fields that were added (current vs migration). */
    addedSet: Set<string>;
    /** Names of fields that were altered. */
    alteredSet: Set<string>;
    /** Field names that were removed (rendered as line-through ghosts after the live list). */
    removedFields: string[];
  };

  let { fields, addedSet, alteredSet, removedFields }: Props = $props();

  const DETAIL_LIMIT = 8;
  const detailFields = $derived(fields.slice(0, DETAIL_LIMIT));
  const hiddenFieldCount = $derived(Math.max(0, fields.length - DETAIL_LIMIT));

  const FIELD_DIFF_SYM: Record<FieldDiffKind, string> = {
    added: '+',
    altered: '~',
    removed: '−',
  };
  const FIELD_DIFF_PALETTE: Record<FieldDiffKind, string> = {
    added: 'text-fk',
    altered: 'text-o2o',
    removed: 'text-danger',
  };

  const fieldDiffKind = (fieldName: string): FieldDiffKind | null => {
    if (addedSet.has(fieldName)) return 'added';
    if (alteredSet.has(fieldName)) return 'altered';
    return null;
  };

  const FIELD_DIFF_BASE = 'inline-block font-bold text-[10px] mr-1 w-3 text-center';
</script>

<div
  class="flex flex-col gap-0.5 mt-2 pt-1.5 border-t border-dashed border-vsc-card-border max-w-[260px]"
>
  {#each detailFields as f (f.name)}
    {@const kind = fieldDiffKind(f.name)}
    <span class="flex justify-between gap-3 text-[10.5px] leading-[1.3]">
      {#if kind}<span class="{FIELD_DIFF_BASE} {FIELD_DIFF_PALETTE[kind]}"
          >{FIELD_DIFF_SYM[kind]}</span
        >{/if}
      <span class="text-vsc-editor-fg">{f.name}</span>
      <span class="text-vsc-desc italic">{f.type}</span>
    </span>
  {/each}
  {#if hiddenFieldCount > 0}
    <span class="flex justify-center pt-0.5 text-vsc-desc text-[10px] italic"
      >+{hiddenFieldCount} more…</span
    >
  {/if}
  {#each removedFields as removedName (removedName)}
    <span class="flex justify-between gap-3 text-[10.5px] leading-[1.3]" data-injected-removed="1">
      <span class="{FIELD_DIFF_BASE} {FIELD_DIFF_PALETTE.removed}">{FIELD_DIFF_SYM.removed}</span>
      <span class="text-vsc-editor-fg line-through opacity-70">{removedName}</span>
      <span class="text-vsc-desc italic opacity-50">removed</span>
    </span>
  {/each}
</div>
