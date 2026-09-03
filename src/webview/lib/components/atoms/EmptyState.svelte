<script lang="ts">
  import type { Snippet } from 'svelte';

  type Props = {
    title: string;
    hint?: string;
    /** Icon snippet rendered above the title — small (24-32px). Optional. */
    icon?: Snippet;
    /** Action area (Button(s)) rendered below the hint. Optional. */
    action?: Snippet;
    /** Outer padding density. Compact for inline empties, comfortable for full-panel. */
    density?: 'compact' | 'comfortable';
  };

  let { title, hint, icon, action, density = 'comfortable' }: Props = $props();

  // $derived, not const: `density` is a prop, and a plain const would freeze
  // the padding at whatever it was on first render.
  const PAD = $derived(density === 'compact' ? 'py-6 px-4' : 'py-12 px-6');
</script>

<div class="flex flex-col items-center justify-center text-center {PAD} gap-2 select-none">
  {#if icon}
    <div class="text-vsc-desc/60 mb-1">{@render icon()}</div>
  {/if}
  <div class="text-body font-semibold text-vsc-editor-fg">{title}</div>
  {#if hint}
    <div class="text-label text-vsc-desc max-w-[280px] leading-relaxed">{hint}</div>
  {/if}
  {#if action}
    <div class="mt-3">{@render action()}</div>
  {/if}
</div>
