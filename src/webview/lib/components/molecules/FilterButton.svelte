<script lang="ts">
  import { Button } from '$atoms';
  import { actions, toolbar } from '$lib/state/toolbar.svelte';
  import type { RelationKind } from '$lib/types/relations';

  type Props = {
    kind: RelationKind;
    title: string;
  };

  let { kind, title }: Props = $props();

  // RelationKind values are already 'FK' | 'M2M' | 'O2O' — Button.tone accepts
  // the lowercased equivalents.
  const TONE_MAP: Record<RelationKind, 'fk' | 'm2m' | 'o2o'> = {
    FK: 'fk',
    M2M: 'm2m',
    O2O: 'o2o',
  };

  const BULLET: Record<RelationKind, string> = {
    FK: 'bg-fk',
    M2M: 'bg-m2m',
    O2O: 'bg-o2o',
  };

  const isActive = $derived(toolbar.activeFilters[kind]);
</script>

<Button
  variant="toggle"
  tone={TONE_MAP[kind]}
  active={isActive}
  {title}
  onclick={() => actions().toggleRelationFilter(kind)}
  extraClass="font-bold"
>
  <span
    class="inline-block w-1.5 h-1.5 rounded-full transition-[transform,background-color] duration-fast ease-out-expo
           {isActive
      ? `${BULLET[kind]} scale-110`
      : 'bg-transparent ring-1 ring-inset ring-vsc-desc/40 scale-90'}"
    aria-hidden="true"
  ></span>
  {kind}
</Button>
