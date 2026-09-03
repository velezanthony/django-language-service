<script lang="ts">
  import { ResizeHandles } from '$atoms';
  import { IconEditNote } from '$icons';
  import { FieldRow, PropertyPopup, ReferencedByRow, RelationRow, TooltipFooter } from '$molecules';
  import type { BoxRecord } from '$lib/types/box-data';

  type Props = {
    data: BoxRecord;
    pinned: boolean;
  };

  let { data, pinned }: Props = $props();

  // The dashed border and the faded box say "this model is special" without
  // saying which special. Name it, and say what it means.
  const traits = $derived(
    [
      data.isAbstract && {
        label: 'Abstract',
        tone: 'text-m2m border-m2m/40 bg-m2m/[0.08]',
        note: 'Declares Meta.abstract — no table of its own; its fields are inherited.',
      },
      data.isProxy && {
        label: 'Proxy',
        tone: 'text-o2o border-o2o/40 bg-o2o/[0.08]',
        note: 'Proxy model — shares the table of the model it proxies.',
      },
      data.isOrphan && {
        label: 'Orphan',
        tone: 'text-vsc-desc border-vsc-desc/40 bg-vsc-desc/[0.08]',
        note: 'Takes part in no relation — nothing references it and it references nothing.',
      },
      data.isInCycle && {
        label: 'In cycle',
        tone: 'text-danger border-danger/40 bg-danger/[0.08]',
        note: 'Part of a circular relation chain.',
      },
    ].filter(Boolean) as { label: string; tone: string; note: string }[],
  );

  const PILL =
    'inline-flex items-center rounded-full border px-2 py-px text-meta font-semibold uppercase tracking-[0.5px]';

  // Form-style rows (Tailwind UI Plus pattern): bold label on left, value on
  // right. Subtle hover bg + border-top divider give an interactive 'list of
  // entries' feel — easier to follow the eye down through the tooltip.
  const ROW =
    'flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-3.5 py-1.5 text-label ' +
    'border-t border-vsc-card-border/40 first:border-t-0 ' +
    'transition-colors duration-fast hover:bg-accent-subtle';
  const FIELD_NAME = 'font-semibold min-w-[80px] shrink-0 text-vsc-editor-fg';
  const FIELD_TYPE = 'text-vsc-desc';
  // Section labels get a 3px accent mini-bar (Notion pattern) + a stronger
  // border-top, so each block reads as a labelled group instead of a wall of
  // identical rows.
  const SECTION =
    'flex items-center gap-2 px-3.5 pt-3 pb-1 text-meta font-bold text-vsc-link/80 ' +
    'uppercase tracking-[0.6px] border-t border-vsc-card-border/60';
</script>

{#snippet section(label: string)}
  <div class={SECTION}>
    <span class="w-[3px] h-3 bg-vsc-link rounded-sm shrink-0" aria-hidden="true"></span>
    <span>{label}</span>
  </div>
{/snippet}

<ResizeHandles {pinned} />

<!-- data-tt-drag: the pinned panel is dragged by its header (tooltip-controller). -->
<div
  data-tt-drag
  class="flex items-center justify-between px-3.5 py-2.5 bg-accent-subtle border-b border-vsc-card-border shrink-0 select-none
         {pinned ? 'cursor-grab active:cursor-grabbing' : ''}"
  title={pinned ? 'Drag to move' : undefined}
>
  <span class="font-semibold text-heading text-vsc-editor-fg"
    >{data.appLabel ? `${data.appLabel}.` : ''}{data.name}</span
  >
  <span class="text-vsc-desc text-label tabular-nums">{data.fieldCount} fields</span>
</div>

{#if traits.length > 0}
  <div
    class="px-3.5 py-2 border-b border-vsc-card-border bg-vsc-bg/40 shrink-0 flex flex-col gap-1.5"
  >
    <div class="flex flex-wrap gap-1.5">
      {#each traits as t (t.label)}
        <span class="{PILL} {t.tone}">{t.label}</span>
      {/each}
    </div>
    {#each traits as t (t.label)}
      <p class="text-[11px] leading-[1.35] text-vsc-desc m-0">{t.note}</p>
    {/each}
  </div>
{/if}

{#if data.tableComment}
  <div
    class="pt-1.5 px-3.5 pb-2 text-[11px] leading-[1.4] text-vsc-editor-fg bg-vsc-link/[0.05] border-b border-vsc-card-border italic shrink-0 flex items-start gap-2"
  >
    <IconEditNote size={14} class="mt-0.5 shrink-0 text-vsc-desc" />
    <span>{data.tableComment}</span>
  </div>
{/if}

<div class="flex-1 min-h-0 overflow-y-auto py-2">
  <div class="{ROW} opacity-60">
    <span class={FIELD_NAME}>db_table</span>
    <span class={FIELD_TYPE}>{data.dbTable}</span>
  </div>
  {#if data.verboseName}
    <div class="{ROW} opacity-60">
      <span class={FIELD_NAME}>verbose</span>
      <span class={FIELD_TYPE}>{data.verboseName}</span>
    </div>
  {/if}

  {#if data.fields.length > 0}
    {@render section('Fields')}
    {#each data.fields as field (field.name)}
      <FieldRow {field} />
    {/each}
  {/if}

  {#if data.relations.length > 0}
    {@render section('Relations')}
    {#each data.relations as relation (relation.name)}
      <RelationRow {relation} />
    {/each}
  {/if}

  {#if data.referencedBy && data.referencedBy.length > 0}
    {@render section(`Referenced by (${data.referencedBy.length})`)}
    {#each data.referencedBy as incoming, i (`${incoming.from}.${incoming.fieldName}.${i}`)}
      <ReferencedByRow {incoming} />
    {/each}
  {/if}

  {#if data.properties.length > 0}
    {@render section('Properties')}
    {#each data.properties as prop (prop.name)}
      <div class={ROW}>
        <span class={FIELD_NAME}>{prop.name}</span>
        <PropertyPopup property={prop} />
      </div>
    {/each}
  {/if}
</div>

<TooltipFooter {pinned} />
