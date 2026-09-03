<script lang="ts">
  import { Pill } from '$atoms';
  import type { RelationLine } from '$lib/types/tooltip-data';

  type Props = {
    relation: RelationLine;
  };

  let { relation }: Props = $props();

  // Map relation type to Pill kind (lower-case for the atom's palette).
  const KIND_MAP: Record<string, 'fk' | 'm2m' | 'o2o'> = {
    FK: 'fk',
    M2M: 'm2m',
    O2O: 'o2o',
  };
  // .tt-rel-target with data-nav-key — clickable nav cursor + underline on hover.
  // The boot's tooltip click delegate reads data-nav-key to scroll the diagram.
  const REL_TARGET = 'text-vsc-link text-xs cursor-pointer underline-offset-2 hover:underline';
</script>

<div
  class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-3.5 py-1 text-xs transition-colors duration-fast hover:bg-accent-subtle"
>
  <span class="font-semibold min-w-[80px] shrink-0">{relation.name}</span>
  <Pill kind={KIND_MAP[relation.type]} size="xs">{relation.type}</Pill>
  <span
    class={REL_TARGET}
    data-nav-key={relation.target}
    title="Click to jump to {relation.target} in the diagram"
  >
    → {relation.target}
  </span>
</div>
