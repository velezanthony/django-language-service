<script lang="ts">
  type Size = 'sm' | 'md' | 'lg';

  type Props = {
    size?: Size;
    /** Color class (text-*) — both rings inherit via currentColor. */
    colorClass?: string;
    title?: string;
  };

  let { size = 'md', colorClass = 'text-vsc-link', title = 'Loading' }: Props = $props();

  // Dual-ring counter-rotating loader — outer ring spins clockwise, inner
  // spins counter-clockwise at a different speed. Way more polished than a
  // plain border-top spinner without adding any external assets.
  const SIZE_CLS: Record<Size, { wrap: string; outer: string; inner: string; inset: string }> = {
    sm: { wrap: 'w-3 h-3', outer: 'border', inner: 'border', inset: 'inset-[2px]' },
    md: { wrap: 'w-4 h-4', outer: 'border-2', inner: 'border-2', inset: 'inset-[3px]' },
    lg: { wrap: 'w-6 h-6', outer: 'border-2', inner: 'border-2', inset: 'inset-[5px]' },
  };

  const sz = $derived(SIZE_CLS[size]);
</script>

<span role="status" aria-label={title} class="relative inline-block {sz.wrap} {colorClass}">
  <span
    class="absolute inset-0 rounded-full border-transparent animate-spin spinner-ring-outer {sz.outer}"
  ></span>
  <span
    class="absolute {sz.inset} rounded-full border-transparent animate-spin spinner-ring-inner {sz.inner}"
  ></span>
</span>
