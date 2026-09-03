<script lang="ts">
  import { DropdownSeparator, Surface } from '$atoms';
  import { DropdownItem } from '$molecules';
  import { contextMenu, closeContextMenu } from '$lib/state/context-menu.svelte';

  let menuEl: HTMLDivElement | null = $state(null);
  let clampedX = $state(0);
  let clampedY = $state(0);

  const MARGIN = 8;

  const reposition = (): void => {
    if (!menuEl) return;
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const mW = menuEl.offsetWidth;
    const mH = menuEl.offsetHeight;
    let left = contextMenu.x;
    let top = contextMenu.y;
    if (left + mW > vw - MARGIN) left = vw - mW - MARGIN;
    if (top + mH > vh - MARGIN) top = vh - mH - MARGIN;
    if (left < MARGIN) left = MARGIN;
    if (top < MARGIN) top = MARGIN;
    clampedX = left;
    clampedY = top;
  };

  $effect(() => {
    if (contextMenu.open && menuEl) {
      queueMicrotask(reposition);
    }
  });

  $effect(() => {
    document.addEventListener('click', closeOnOutsideClick);
    document.addEventListener('scroll', closeOnScroll, true);
    return () => {
      document.removeEventListener('click', closeOnOutsideClick);
      document.removeEventListener('scroll', closeOnScroll, true);
    };
  });

  const closeOnOutsideClick = (e: MouseEvent): void => {
    if (!contextMenu.open) return;
    const t = e.target as Node | null;
    if (menuEl && t && menuEl.contains(t)) return;
    closeContextMenu();
  };

  const closeOnScroll = (): void => closeContextMenu();
</script>

{#if contextMenu.open}
  <Surface
    kind="popover"
    role="menu"
    bindRef={el => (menuEl = el)}
    style="position:fixed; left:{clampedX}px; top:{clampedY}px;"
    class="min-w-[180px] py-1 z-menu text-xs select-none"
  >
    {#each contextMenu.items as item, i (i)}
      {#if item.sep}
        <DropdownSeparator />
      {:else}
        <DropdownItem
          icon={item.icon}
          label={item.label}
          shortcut={item.shortcut}
          tone={item.tone}
          onClick={() => {
            closeContextMenu();
            item.onClick?.();
          }}
        />
      {/if}
    {/each}
  </Surface>
{/if}
