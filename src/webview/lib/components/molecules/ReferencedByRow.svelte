<script lang="ts">
  import { Pill } from '$atoms';
  import type { IncomingRef } from '$lib/types/tooltip-data';

  type Props = {
    incoming: IncomingRef;
  };

  let { incoming }: Props = $props();

  // Match the RelationRow badge palette so incoming/outgoing relations read as
  // the same visual vocabulary throughout the tooltip.
  const KIND_MAP: Record<string, 'fk' | 'm2m' | 'o2o'> = {
    FK: 'fk',
    M2M: 'm2m',
    O2O: 'o2o',
  };
  const REL_TARGET = 'text-vsc-link text-xs cursor-pointer underline-offset-2 hover:underline';
</script>

<div
  class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-3.5 py-1 text-xs transition-colors duration-fast hover:bg-accent-subtle"
>
  <Pill kind={KIND_MAP[incoming.type]} size="xs">{incoming.type}</Pill>
  <span
    class={REL_TARGET}
    data-nav-key={incoming.from}
    title="Click to jump to {incoming.from} in the diagram"
  >
    {incoming.from}
  </span>
  <span class="min-w-[80px] shrink-0 ml-auto font-normal opacity-60">.{incoming.fieldName}</span>
</div>
