<script lang="ts">
  import { IconButton, Kbd, Surface } from '$atoms';
  import { IconHelp } from '$icons';

  let open = $state(false);
  let rootEl: HTMLDivElement | null = $state(null);

  function toggle() {
    open = !open;
  }

  function onDocClick(e: MouseEvent) {
    if (!open || !rootEl) return;
    const t = e.target as Node | null;
    if (t && rootEl.contains(t)) return;
    open = false;
  }

  $effect(() => {
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  });

  // Grouped shortcut list — keeps the popover readable and lets us add new
  // groups without restructuring the markup.
  const GROUPS: { title: string; items: { keys: string[]; label: string }[] }[] = [
    {
      title: 'Navigation',
      items: [
        { keys: ['Space', 'drag'], label: 'Pan the canvas' },
        { keys: ['Ctrl', 'wheel'], label: 'Zoom in / out' },
        { keys: ['+'], label: 'Zoom in' },
        { keys: ['−'], label: 'Zoom out' },
        { keys: ['0'], label: 'Reset zoom to 100%' },
        { keys: ['F'], label: 'Fit visible models to viewport' },
      ],
    },
    {
      title: 'Search',
      items: [
        { keys: ['/'], label: 'Focus the search box' },
        { keys: ['Esc'], label: 'Close popover / clear focus' },
      ],
    },
    {
      title: 'Boxes',
      items: [
        { keys: ['Click'], label: 'Open model tooltip' },
        { keys: ['Drag'], label: 'Reposition box' },
        { keys: ['Arrows'], label: 'Pan the viewport (Shift = bigger step)' },
        { keys: ['Right-click'], label: 'Context menu (hide model)' },
      ],
    },
  ];
</script>

<div bind:this={rootEl} class="relative inline-flex">
  <IconButton
    size="sm"
    variant="ghost"
    title="Keyboard & mouse shortcuts"
    active={open}
    onclick={e => {
      e.stopPropagation();
      toggle();
    }}
  >
    <IconHelp size={16} />
  </IconButton>

  <Surface
    kind="popover"
    role="dialog"
    class="absolute bottom-[calc(100%+6px)] right-0 origin-bottom-right w-[320px] z-help
           transition-[opacity,transform] duration-fast ease-spring
           {open
      ? 'opacity-100 scale-100 pointer-events-auto'
      : 'opacity-0 scale-95 pointer-events-none'}"
  >
    <div class="px-3.5 py-2.5 border-b border-vsc-card-border">
      <div class="text-body font-semibold text-vsc-editor-fg">Shortcuts</div>
      <div class="text-label text-vsc-desc/80 mt-0.5">Keyboard & mouse</div>
    </div>
    <div class="max-h-[400px] overflow-y-auto py-1">
      {#each GROUPS as group (group.title)}
        <div
          class="px-3.5 pt-2 pb-1 text-meta uppercase tracking-[0.6px] font-bold text-vsc-link/80"
        >
          {group.title}
        </div>
        {#each group.items as item, idx (idx)}
          <div class="flex items-center justify-between gap-3 px-3.5 py-1.5 text-label">
            <span class="text-vsc-editor-fg">{item.label}</span>
            <span class="inline-flex items-center gap-1 shrink-0">
              {#each item.keys as key, ki (ki)}
                {#if ki > 0}<span class="text-vsc-desc/60 text-[10px]">+</span>{/if}
                <Kbd>{key}</Kbd>
              {/each}
            </span>
          </div>
        {/each}
      {/each}
    </div>
  </Surface>
</div>
