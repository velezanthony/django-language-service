<script lang="ts">
  import type { Snippet } from 'svelte';

  type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
  type Size = 'sm' | 'md' | 'lg';

  type Props = {
    id?: string;
    /** Required — IconButton has no visible label, so a tooltip+aria-label is non-optional. */
    title: string;
    variant?: Variant;
    size?: Size;
    active?: boolean;
    disabled?: boolean;
    onclick?: (e: MouseEvent) => void;
    children: Snippet;
  };

  let {
    id,
    title,
    variant = 'ghost',
    size = 'md',
    active = false,
    disabled = false,
    onclick,
    children,
  }: Props = $props();

  const BASE =
    'inline-flex items-center justify-center font-vsc cursor-pointer ' +
    'border rounded-md transition-colors duration-fast ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vsc-link/60 ' +
    'disabled:opacity-40 disabled:cursor-not-allowed';

  // Square dimensions so icons stay perfectly centered.
  const SIZE_CLS: Record<Size, string> = {
    sm: 'w-6 h-6 text-[11px]',
    md: 'w-8 h-8 text-xs',
    lg: 'w-10 h-10 text-sm',
  };

  const VARIANT_CLS = (v: Variant): string => {
    switch (v) {
      case 'primary':
        return 'bg-vsc-link/[0.18] text-vsc-link border-vsc-link/80 hover:bg-vsc-link/[0.28]';
      case 'secondary':
        return active
          ? 'bg-vsc-link/[0.18] text-vsc-link border-vsc-link/80'
          : 'bg-transparent border-vsc-card-border/70 text-vsc-desc ' +
              'hover:bg-vsc-link/[0.08] hover:border-vsc-link/60 hover:text-vsc-link';
      case 'ghost':
        return active
          ? 'bg-vsc-link/[0.14] text-vsc-link border-transparent'
          : 'bg-transparent border-transparent text-vsc-desc ' +
              'hover:bg-vsc-link/[0.1] hover:text-vsc-editor-fg';
      case 'danger':
        return (
          'bg-transparent border-vsc-card-border/70 text-vsc-desc ' +
          'hover:bg-danger/[0.1] hover:border-danger hover:text-danger'
        );
    }
  };
</script>

<button
  {id}
  type="button"
  {disabled}
  {title}
  aria-label={title}
  {onclick}
  class="{BASE} {SIZE_CLS[size]} {VARIANT_CLS(variant)}"
>
  {@render children()}
</button>
