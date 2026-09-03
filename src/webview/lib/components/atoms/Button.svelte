<script lang="ts">
  import type { Snippet } from 'svelte';

  type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'menu' | 'toggle';
  type Size = 'sm' | 'md' | 'lg';
  type Tone = 'accent' | 'fk' | 'm2m' | 'o2o' | 'danger';

  type Props = {
    id?: string;
    title?: string;
    type?: 'button' | 'submit';
    variant?: Variant;
    size?: Size;
    /** Only meaningful for variant='toggle'. Which color the ON state uses. */
    tone?: Tone;
    /** For variant='toggle': on/off. For others: highlighted/selected state. */
    active?: boolean;
    disabled?: boolean;
    fullWidth?: boolean;
    onclick?: (e: MouseEvent) => void;
    children: Snippet;
    /** Escape hatch for callers that need extra one-off classes. Avoid when possible. */
    extraClass?: string;
  };

  let {
    id,
    title,
    type = 'button',
    variant = 'secondary',
    size = 'md',
    tone = 'accent',
    active = false,
    disabled = false,
    fullWidth = false,
    onclick,
    children,
    extraClass = '',
  }: Props = $props();

  const BASE =
    'inline-flex items-center justify-center gap-1.5 font-vsc whitespace-nowrap cursor-pointer ' +
    'border transition-colors duration-fast rounded-md ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vsc-link/60 ' +
    'disabled:opacity-40 disabled:cursor-not-allowed';

  const SIZE_CLS: Record<Size, string> = {
    sm: 'px-2.5 py-1 text-[11px]',
    md: 'px-3 py-2 text-xs',
    lg: 'px-4 py-2.5 text-[13px]',
  };

  // Per-tone palette for toggle variant — uses the semantic accent scale.
  // Idle ON state = base (22%), hover bumps to strong (35%) feel via the +6%
  // approximation, inset ring uses strong tone for a crisp inner outline.
  const TONE_ACTIVE: Record<Tone, string> = {
    accent:
      'bg-accent-base text-vsc-link border-vsc-link/80 shadow-[inset_0_0_0_1px_var(--color-accent-strong)] hover:bg-accent-strong',
    fk: 'bg-fk-base text-fk border-fk/70 shadow-[inset_0_0_0_1px_var(--color-fk-strong)] hover:bg-fk-strong',
    m2m: 'bg-m2m-base text-m2m border-m2m/70 shadow-[inset_0_0_0_1px_var(--color-m2m-strong)] hover:bg-m2m-strong',
    o2o: 'bg-o2o-base text-o2o border-o2o/70 shadow-[inset_0_0_0_1px_var(--color-o2o-strong)] hover:bg-o2o-strong',
    danger:
      'bg-danger-base text-danger border-danger/70 shadow-[inset_0_0_0_1px_var(--color-danger-strong)] hover:bg-danger-strong',
  };

  const TOGGLE_INACTIVE =
    'bg-transparent text-vsc-desc/60 border-vsc-card-border/50 ' +
    'hover:text-vsc-editor-fg hover:border-vsc-card-border';

  const VARIANT_CLS = (v: Variant): string => {
    switch (v) {
      case 'primary':
        // Filled accent. Always "loud" — used for the main action in a context.
        return (
          'bg-accent-base text-vsc-link border-vsc-link/80 ' +
          'hover:bg-accent-strong hover:border-vsc-link ' +
          'disabled:hover:bg-accent-base disabled:hover:border-vsc-link/80'
        );
      case 'secondary':
        // Outline neutral — most common button shape in the toolbar.
        return active
          ? 'bg-accent-base text-vsc-link border-vsc-link/80 shadow-[inset_0_0_0_1px_var(--color-accent-strong)] hover:bg-accent-strong'
          : 'bg-transparent border-vsc-card-border/70 text-vsc-desc ' +
              'hover:bg-accent-subtle hover:border-vsc-link/60 hover:text-vsc-link ' +
              'disabled:hover:bg-transparent disabled:hover:border-vsc-card-border/70 disabled:hover:text-vsc-desc';
      case 'ghost':
        // Borderless. Used when the surrounding container already provides shape.
        return active
          ? 'bg-accent-soft text-vsc-link border-transparent'
          : 'bg-transparent border-transparent text-vsc-desc ' +
              'hover:bg-accent-subtle hover:text-vsc-editor-fg';
      case 'danger':
        // Destructive intent. Hover reveals red.
        return (
          'bg-transparent border-vsc-card-border/70 text-vsc-desc ' +
          'hover:bg-danger-subtle hover:border-danger hover:text-danger'
        );
      case 'menu':
        // Full-width dropdown row. Always full-width, left-aligned. Hover uses
        // accent-soft (bolder than subtle) so the highlighted row reads as the
        // current target — same intent as Tailwind UI's combobox indigo hover,
        // toned down by the theme palette.
        return active
          ? 'bg-accent-base text-vsc-link border-transparent font-semibold ' +
              'justify-start text-left w-full ' +
              'focus-visible:ring-inset'
          : 'bg-transparent border-transparent text-vsc-editor-fg ' +
              'hover:bg-accent-soft hover:text-vsc-link ' +
              'justify-start text-left w-full ' +
              'focus-visible:ring-inset';
      case 'toggle':
        return active ? TONE_ACTIVE[tone] : TOGGLE_INACTIVE;
    }
  };
</script>

<button
  {id}
  {type}
  {disabled}
  {title}
  {onclick}
  class="{BASE} {SIZE_CLS[size]} {VARIANT_CLS(variant)} {fullWidth ? 'w-full' : ''} {extraClass}"
>
  {@render children()}
</button>
