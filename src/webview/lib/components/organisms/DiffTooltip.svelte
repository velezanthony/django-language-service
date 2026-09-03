<script lang="ts">
  import { Pill, ResizeHandles } from '$atoms';
  import { TooltipFooter } from '$molecules';
  import {
    DiffStatus,
    type DiffTooltipData,
    type DiffTooltipError,
    type DiffFieldRow,
  } from '$lib/types/diff-tooltip-data';
  import { attrKey } from '../../../../domain/parsers/_shared/field-attrs';

  type Side = 'before' | 'after';

  type Props = {
    data: DiffTooltipData | DiffTooltipError;
  };

  let { data }: Props = $props();

  function isError(d: DiffTooltipData | DiffTooltipError): d is DiffTooltipError {
    return 'message' in d;
  }

  // select-none + the drag handle marker: the pinned panel moves by its header.
  const HEADER =
    'flex items-center justify-between px-3.5 py-2.5 bg-accent-subtle border-b border-vsc-card-border shrink-0 select-none cursor-grab active:cursor-grabbing';
  const NAME = 'font-semibold text-heading text-vsc-editor-fg';
  const COUNT = 'text-vsc-desc text-label tabular-nums';
  const BODY = 'flex-1 min-h-0 overflow-y-auto';
  const ROW = 'flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-3.5 py-0.5 text-label';
  const FIELD_NAME = 'font-semibold min-w-[80px] shrink-0';

  // tt-diff-cell shows BEFORE/AFTER for one field. Status tints the background;
  // `removed.before` gets line-through on the name, `removed.after` dims.
  const CELL_BASE =
    'px-1.5 py-[3px] flex flex-wrap gap-x-1.5 gap-y-0.5 items-baseline rounded-sm text-xs min-h-[20px]';

  // Two-axis palette: [status][side] → utility classes. Keeps the cell tint
  // table in one place and lets TypeScript narrow on DiffStatus.
  const CELL_BG: Record<DiffStatus, Record<Side, string>> = {
    [DiffStatus.ADDED]: { before: '', after: 'bg-fk/[0.14]' },
    [DiffStatus.ALTERED]: { before: 'bg-o2o/[0.08]', after: 'bg-o2o/[0.18]' },
    [DiffStatus.REMOVED]: { before: 'bg-danger/[0.12]', after: 'opacity-50' },
    [DiffStatus.UNCHANGED]: { before: '', after: '' },
  };

  const cellStatus = (status: DiffStatus, side: Side): string => CELL_BG[status][side];
  const cellName = (status: DiffStatus, side: Side): string => {
    const base = 'font-semibold text-vsc-editor-fg';
    return status === DiffStatus.REMOVED && side === 'before' ? `${base} line-through` : base;
  };
  const cellType = 'text-vsc-desc text-[11px]';
  // Kwargs trail the type. Without them an AlterField that only moved
  // decimal_places shows two identical-looking columns. Only the kwarg that
  // actually moved gets tinted; the rest stay quiet so the eye lands on it.
  const ATTRS = 'text-[10.5px] text-vsc-desc/75 leading-tight';
  const CHANGED_ATTR = 'text-o2o font-semibold';
  const attrChanged = (row: DiffFieldRow, token: string): boolean =>
    (row.changedAttrs ?? []).includes(attrKey(token));
  const COL_HEAD =
    'text-[10px] text-vsc-desc font-bold uppercase tracking-[0.5px] px-1.5 py-1 border-b border-vsc-card-border mb-0.5';
  const EMPTY = 'text-vsc-desc italic opacity-55 text-[11px]';
</script>

<ResizeHandles pinned={'pinned' in data ? data.pinned : false} />

{#if isError(data)}
  <div data-tt-drag class={HEADER}>
    <span class={NAME}>{data.key}</span>
    <span class={COUNT}>diff unavailable</span>
  </div>
  <div class={BODY}>
    <div class={ROW}><span class={FIELD_NAME}>{data.message}</span></div>
  </div>
  <TooltipFooter pinned={false} hint="Diff unavailable" />
{:else}
  <div data-tt-drag class={HEADER}>
    <span class={NAME}>{data.key}</span>
    <span class={COUNT}>vs {data.migrationLabel}</span>
  </div>

  <div class={BODY}>
    {#if data.addedCount > 0 || data.alteredCount > 0 || data.removedCount > 0}
      <div class="flex gap-1.5 px-2 py-1.5 border-b border-vsc-card-border mb-1">
        {#if data.addedCount > 0}<Pill kind="fk" size="sm" tabular>+{data.addedCount} added</Pill
          >{/if}
        {#if data.alteredCount > 0}<Pill kind="o2o" size="sm" tabular
            >~{data.alteredCount} altered</Pill
          >{/if}
        {#if data.removedCount > 0}<Pill kind="danger" size="sm" tabular
            >−{data.removedCount} removed</Pill
          >{/if}
      </div>
    {/if}

    <div class="grid grid-cols-[1fr_1fr] gap-y-0.5 gap-x-2 mt-1 mb-2">
      <div class={COL_HEAD}>BEFORE · {data.migrationName}</div>
      <div class={COL_HEAD}>AFTER · {data.afterLabel ?? 'current'}</div>

      {#each data.rows as row, i (i)}
        <div class="{CELL_BASE} {cellStatus(row.status, 'before')}">
          {#if row.before}
            <span class={cellName(row.status, 'before')}>{row.before.name}</span>
            <span class={cellType}>{row.before.type}</span>
            {#if row.before.attrs?.length}
              <span class={ATTRS}>
                {#each row.before.attrs as t, ti (ti)}<span
                    class={attrChanged(row, t) ? CHANGED_ATTR : ''}>{t}</span
                  >{#if ti < row.before.attrs.length - 1}<span class="mr-1">,</span>{/if}{/each}
              </span>
            {/if}
          {:else if row.status === DiffStatus.ADDED}
            <span class={EMPTY}>(not present)</span>
          {:else}
            <span class={EMPTY}>—</span>
          {/if}
        </div>
        <div class="{CELL_BASE} {cellStatus(row.status, 'after')}">
          {#if row.after}
            <span class={cellName(row.status, 'after')}>{row.after.name}</span>
            <span class={cellType}>{row.after.type}</span>
            {#if row.after.attrs?.length}
              <span class={ATTRS}>
                {#each row.after.attrs as t, ti (ti)}<span
                    class={attrChanged(row, t) ? CHANGED_ATTR : ''}>{t}</span
                  >{#if ti < row.after.attrs.length - 1}<span class="mr-1">,</span>{/if}{/each}
              </span>
            {/if}
          {:else}
            <span class={EMPTY}>(removed)</span>
          {/if}
        </div>
      {/each}
    </div>
  </div>

  <TooltipFooter pinned={data.pinned} hint="Diff vs {data.migrationLabel} · click to pin" />
{/if}
