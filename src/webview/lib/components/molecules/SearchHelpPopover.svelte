<script lang="ts">
  import { Kbd, Surface } from '$atoms';

  let open = $state(false);
  let rootEl: HTMLSpanElement | null = $state(null);

  function toggle(e: MouseEvent): void {
    e.stopPropagation();
    open = !open;
  }

  $effect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent): void => {
      const t = e.target as HTMLElement | null;
      if (rootEl && t && rootEl.contains(t)) return;
      open = false;
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') open = false;
    };
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  });
</script>

<span bind:this={rootEl} class="relative inline-flex">
  <button
    type="button"
    aria-label="Search syntax help"
    aria-expanded={open}
    onclick={toggle}
    onmousedown={e => e.stopPropagation()}
    class="inline-flex items-center justify-center w-[18px] h-[18px] rounded-full
           border cursor-pointer transition-colors duration-fast
           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vsc-link/60 focus-visible:ring-offset-1 focus-visible:ring-offset-vsc-bg
           {open
      ? 'bg-vsc-link text-vsc-bg border-vsc-link'
      : 'bg-vsc-card-bg text-vsc-desc border-vsc-card-border hover:bg-vsc-link/15 hover:text-vsc-link hover:border-vsc-link/60'}"
  >
    <span
      class="text-[11px] font-bold italic leading-none pointer-events-none font-serif"
      aria-hidden="true">i</span
    >
  </button>

  {#if open}
    <Surface
      kind="popover"
      role="tooltip"
      class="absolute top-[calc(100%+8px)] right-0 w-[280px] px-3 py-2.5 text-xs text-vsc-editor-fg z-help
             transition-[opacity,transform] duration-fast ease-spring
             motion-safe:animate-[fade-scale-in_var(--duration-fast)_var(--ease-spring)_forwards]"
    >
      <div class="font-bold text-vsc-link mb-2 text-[11px] uppercase tracking-[0.6px]">
        Search prefixes
      </div>
      <div class="grid items-baseline py-1 [grid-template-columns:auto_auto_1fr] gap-x-2 gap-y-1.5">
        <code
          class="text-[11px] bg-vsc-bg px-1.5 py-px rounded-sm text-vsc-link font-semibold font-vsc-editor"
          >model:</code
        >
        <span class="text-[10px] text-vsc-desc italic">(default)</span>
        <span class="col-span-full text-vsc-editor-fg opacity-80 text-[11px] pl-0.5"
          >Model name, DB table, verbose name</span
        >
      </div>
      <div
        class="grid items-baseline py-1 border-t border-dashed border-vsc-card-border [grid-template-columns:auto_auto_1fr] gap-x-2 gap-y-1.5"
      >
        <code
          class="text-[11px] bg-vsc-bg px-1.5 py-px rounded-sm text-vsc-link font-semibold font-vsc-editor"
          >field:</code
        >
        <span class="text-[10px] text-vsc-desc italic">/ f:</span>
        <span class="col-span-full text-vsc-editor-fg opacity-80 text-[11px] pl-0.5"
          >Field names and @property</span
        >
      </div>
      <div
        class="grid items-baseline py-1 border-t border-dashed border-vsc-card-border [grid-template-columns:auto_auto_1fr] gap-x-2 gap-y-1.5"
      >
        <code
          class="text-[11px] bg-vsc-bg px-1.5 py-px rounded-sm text-vsc-link font-semibold font-vsc-editor"
          >rel:</code
        >
        <span class="text-[10px] text-vsc-desc italic">/ r:</span>
        <span class="col-span-full text-vsc-editor-fg opacity-80 text-[11px] pl-0.5"
          >FK / M2M / O2O target models</span
        >
      </div>
      <div class="mt-2 pt-1.5 border-t border-vsc-card-border text-[10px] text-vsc-desc">
        Press <Kbd>/</Kbd> to focus.
      </div>
    </Surface>
  {/if}
</span>
