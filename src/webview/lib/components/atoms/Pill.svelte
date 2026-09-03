<script lang="ts">
  import type { Snippet } from 'svelte';

  type Kind = 'neutral' | 'accent' | 'fk' | 'm2m' | 'o2o' | 'danger' | 'success';
  type Size = 'xs' | 'sm';

  type Shape = 'tag' | 'pill';

  type Props = {
    kind?: Kind;
    size?: Size;
    /** 'tag' = rounded-md (default, badge-like). 'pill' = rounded-full (status indicator). */
    shape?: Shape;
    /** Renders an inset ring at low opacity — gives the pill a "tag" feel. */
    ring?: boolean;
    /** Children get tabular-nums via the wrapper, so digits don't shift width. */
    tabular?: boolean;
    title?: string;
    children: Snippet;
  };

  let {
    kind = 'neutral',
    size = 'sm',
    shape = 'tag',
    ring = true,
    tabular = false,
    title,
    children,
  }: Props = $props();

  // Kind palette — bg tint + text color + optional inset ring. The ring at
  // low opacity is what makes the pill read as "tag" rather than "blob".
  // Uses the *-soft token (14% mix) for the tint; ring uses 20% inline since
  // it falls between -soft and -base.
  const KIND_CLS: Record<Kind, string> = {
    neutral: 'bg-white/[0.06] text-vsc-desc',
    accent: 'bg-accent-soft text-vsc-link',
    fk: 'bg-fk-soft text-fk',
    m2m: 'bg-m2m-soft text-m2m',
    o2o: 'bg-o2o-soft text-o2o',
    danger: 'bg-danger-soft text-danger',
    success: 'bg-fk-soft text-fk',
  };

  const RING_CLS: Record<Kind, string> = {
    neutral: 'ring-1 ring-inset ring-white/[0.08]',
    accent: 'ring-1 ring-inset ring-vsc-link/20',
    fk: 'ring-1 ring-inset ring-fk/20',
    m2m: 'ring-1 ring-inset ring-m2m/20',
    o2o: 'ring-1 ring-inset ring-o2o/20',
    danger: 'ring-1 ring-inset ring-danger/20',
    success: 'ring-1 ring-inset ring-fk/20',
  };

  // Size only governs padding + text size; radius comes from shape so a `pill`
  // variant works at both xs and sm without redefining the size matrix.
  const SIZE_CLS: Record<Size, string> = {
    xs: 'text-[10px] px-1.5 py-px font-semibold',
    sm: 'text-[11px] px-2 py-0.5 font-medium',
  };
  const SHAPE_CLS: Record<Shape, string> = {
    tag: 'rounded-md',
    pill: 'rounded-full px-2',
  };
</script>

<span
  class="inline-flex items-center gap-1 whitespace-nowrap leading-none
         {KIND_CLS[kind]} {ring ? RING_CLS[kind] : ''} {SIZE_CLS[size]} {SHAPE_CLS[shape]} {tabular
    ? 'tabular-nums'
    : ''}"
  {title}
>
  {@render children()}
</span>
