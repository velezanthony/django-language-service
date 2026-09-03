<script lang="ts">
  import type { Component, Snippet } from 'svelte';
  import { Surface, ToolbarBtn } from '$atoms';
  import { IconExpandMore } from '$icons';
  import { dropdowns } from '$lib/state/dropdowns.svelte';

  type Props = {
    name: string;
    label: string;
    /** Optional Material icon rendered before the label. */
    icon?: Component<{ size?: number; class?: string; title?: string }>;
    /** Whether the panel should be wider — for Export menus with long hints. */
    wide?: boolean;
    children: Snippet;
  };

  let { name, label, icon, wide = false, children }: Props = $props();
  const IconComp = $derived(icon);

  // Open state lives in a shared registry so only ONE Dropdown can be open
  // at a time — opening another flips registry.openName and reactively closes
  // the previous one.
  const open = $derived(dropdowns.isOpen(name));

  let rootEl: HTMLDivElement | null = $state(null);
  let panelEl: HTMLDivElement | null = $state(null);
  let panelAlign: 'left' | 'right' = $state('right');

  function toggle() {
    const willOpen = !open;
    dropdowns.toggle(name);
    if (willOpen) queueMicrotask(checkAlignment);
  }

  // Mirror the legacy alignment flip: if the panel would overflow the left
  // edge of the viewport, render it growing left-to-right instead of the
  // default right-to-left.
  function checkAlignment() {
    if (!panelEl) return;
    const rect = panelEl.getBoundingClientRect();
    panelAlign = rect.left < 8 ? 'left' : 'right';
  }

  // Doc-click handler: close on any click outside this dropdown's root,
  // OR on any button click inside it (menu actions close after firing).
  // Trigger button calls e.stopPropagation, so this never sees trigger clicks.
  function onDocClick(e: MouseEvent) {
    if (!open || !rootEl) return;
    const target = e.target as HTMLElement | null;
    if (!target) return;
    if (!rootEl.contains(target)) {
      dropdowns.close();
      return;
    }
    if (target.closest('button')) dropdowns.close();
  }

  $effect(() => {
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  });

  const PANEL_BASE = 'absolute top-[calc(100%+6px)] min-w-[220px] flex-col gap-0.5 p-1.5 z-tooltip';
</script>

<div bind:this={rootEl} class="relative inline-flex" data-dropdown={name}>
  <ToolbarBtn
    active={open}
    onclick={e => {
      e.stopPropagation();
      toggle();
    }}
  >
    {#if IconComp}<IconComp size={14} />{/if}
    {label}
    <span class="ml-0.5 transition-transform duration-fast {open ? 'rotate-180' : ''}">
      <IconExpandMore size={14} />
    </span>
  </ToolbarBtn>
  <Surface
    kind="popover"
    role="menu"
    bindRef={el => (panelEl = el)}
    class="{PANEL_BASE} flex {panelAlign === 'left'
      ? 'left-0 right-auto origin-top-left'
      : 'right-0 left-auto origin-top-right'} {wide ? 'min-w-[280px]' : ''}
           transition-[opacity,transform] duration-fast ease-spring
           {open
      ? 'opacity-100 scale-100 pointer-events-auto'
      : 'opacity-0 scale-95 pointer-events-none'}"
  >
    {@render children()}
  </Surface>
</div>
