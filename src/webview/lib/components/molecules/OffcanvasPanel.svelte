<script lang="ts">
  import type { Snippet } from 'svelte';
  import { IconButton } from '$atoms';
  import { IconClose } from '$icons';

  type Props = {
    open: boolean;
    onClose: () => void;
    title?: string;
    subtitle?: string;
    children: Snippet;
    footer?: Snippet;
    width?: number;
  };

  let { open, onClose, title = 'Menu', subtitle, children, footer, width = 340 }: Props = $props();

  $effect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });
</script>

<div
  class="fixed inset-0 z-popover bg-black/55 backdrop-blur-[1px]
         transition-opacity duration-fast
         {open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}"
  onclick={onClose}
  onkeydown={() => {}}
  role="presentation"
  aria-hidden="true"
></div>

<div
  class="fixed top-0 right-0 bottom-0 z-popover bg-vsc-card-bg border-l border-vsc-card-border shadow-elevation-3
         flex flex-col max-w-[85vw]
         transition-transform duration-fast ease-spring
         {open ? 'translate-x-0' : 'translate-x-full'}"
  style:width="{width}px"
  role="dialog"
  aria-modal="true"
  aria-label={title}
  tabindex="-1"
>
  <header
    class="flex items-start justify-between gap-2 px-4 py-3 border-b border-vsc-card-border shrink-0 bg-accent-subtle"
  >
    <div class="min-w-0 flex-1">
      <div class="text-body font-semibold text-vsc-editor-fg truncate">{title}</div>
      {#if subtitle}
        <div class="text-meta text-vsc-desc/80 italic truncate mt-0.5">{subtitle}</div>
      {/if}
    </div>
    <div class="shrink-0 -mt-1 -mr-1">
      <IconButton size="sm" variant="ghost" title="Close" onclick={onClose}>
        <IconClose size={14} />
      </IconButton>
    </div>
  </header>
  <div class="flex-1 overflow-y-auto p-1.5 flex flex-col gap-0.5">
    {@render children()}
  </div>
  {#if footer}
    <footer
      class="shrink-0 flex items-center justify-end gap-2 px-4 py-3 border-t border-vsc-card-border bg-vsc-bg/40"
    >
      {@render footer()}
    </footer>
  {/if}
</div>
