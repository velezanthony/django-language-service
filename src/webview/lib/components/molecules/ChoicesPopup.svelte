<script lang="ts" module>
  const HEAD =
    'text-[10px] font-bold text-vsc-link uppercase tracking-[0.5px] px-1 pb-1.5 border-b border-vsc-card-border mb-2';
  const ROW = 'flex gap-3 items-baseline px-1 py-1 text-[11px]';
  const CODE = 'text-vsc-link bg-vsc-bg px-1.5 py-px rounded-sm font-vsc-editor';
  const SOURCE =
    'text-[11px] text-vsc-desc normal-case tracking-normal px-1 pb-2 mb-2 border-b border-vsc-card-border';
  const HINT =
    'text-[10px] text-vsc-desc italic px-1 pt-1 mt-1 border-t border-vsc-card-border leading-[1.35]';
  const LABEL = 'text-vsc-desc italic';
</script>

<script lang="ts">
  import { Badge, Chip, Popup } from '$atoms';
  import type { FieldChoices } from '$lib/types/tooltip-data';

  type Props = {
    choices: FieldChoices;
  };

  let { choices }: Props = $props();

  let anchor: HTMLElement | null = $state(null);

  const isUnresolved = $derived(choices.kind === 'unresolved');
  const valueCount = $derived(
    choices.kind === 'inline' || choices.kind === 'resolved' ? choices.values.length : 0,
  );
  const displayValue = $derived(isUnresolved ? '?' : String(valueCount));
  const ariaLabel = $derived(
    isUnresolved ? 'unresolved choices reference' : `${valueCount} choices`,
  );
</script>

<Chip kind={choices.kind} {ariaLabel} onAnchor={el => (anchor = el)}>
  <Badge label="choices" value={displayValue} />

  <Popup {anchor} class={choices.kind === 'unresolved' ? '!border-o2o' : ''}>
    {#if choices.kind === 'unresolved'}
      <div class={HEAD}>Unresolved reference</div>
      <div class={ROW}><code class={CODE}>{choices.symbolName}</code></div>
      <div class={HINT}>
        Not defined in this file, and no <code>from … import</code> here points at it.
      </div>
    {:else if choices.kind === 'inline' || choices.kind === 'resolved'}
      <div class={HEAD}>Allowed values</div>

      {#if choices.kind === 'resolved' && choices.symbolName}
        <div class={SOURCE}>
          <code class="text-vsc-link bg-vsc-bg px-1 py-px rounded-sm font-vsc-editor not-italic"
            >{choices.symbolName}</code
          >{#if choices.sourceModule}
            · from <code
              class="text-vsc-link bg-vsc-bg px-1 py-px rounded-sm font-vsc-editor not-italic"
              >{choices.sourceModule}</code
            >{/if}
        </div>
      {/if}

      {#each choices.values as choice (choice.value)}
        <div class={ROW}>
          <code class={CODE}>{choice.value}</code>
          {#if choice.label}<span class={LABEL}>{choice.label}</span>{/if}
        </div>
      {/each}
    {/if}
  </Popup>
</Chip>
