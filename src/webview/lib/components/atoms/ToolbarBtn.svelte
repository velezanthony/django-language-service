<script lang="ts">
  import type { Snippet } from 'svelte';
  import Button from './Button.svelte';

  // ToolbarBtn is now a thin wrapper around Button kept for source compatibility
  // (variant='toolbar' → Button.secondary, variant='menu' → Button.menu).
  // New code should use <Button> directly.
  type Variant = 'toolbar' | 'menu';

  type Props = {
    id?: string;
    title?: string;
    active?: boolean;
    disabled?: boolean;
    variant?: Variant;
    onclick?: (e: MouseEvent) => void;
    children: Snippet;
    extraClass?: string;
  };

  let {
    id,
    title,
    active = false,
    disabled = false,
    variant = 'toolbar',
    onclick,
    children,
    extraClass = '',
  }: Props = $props();

  const mapped = $derived(variant === 'menu' ? ('menu' as const) : ('secondary' as const));
</script>

<Button {id} {title} variant={mapped} {active} {disabled} {onclick} {extraClass}>
  {@render children()}
</Button>
