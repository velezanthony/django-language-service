<script lang="ts">
  import type { Snippet } from 'svelte';

  type Kind = 'panel' | 'popover' | 'inline' | 'banner';

  type Props = {
    kind?: Kind;
    /** Tailwind classes for layout/positioning — Surface doesn't care, callers do. */
    class?: string;
    /** Inline style — used for imperative positioning (e.g. cursor-anchored menus). */
    style?: string;
    children: Snippet;
    role?: 'tooltip' | 'dialog' | 'listbox' | 'menu';
    /** DOM id — needed so a combobox can point at this panel via aria-controls. */
    id?: string;
    /** Callback fired once with the rendered root element — for callers that
     *  need to measure (e.g. flip alignment) or bind imperative behavior. */
    bindRef?: (el: HTMLDivElement) => void;
  };

  let { kind = 'panel', class: cls = '', style, children, role, id, bindRef }: Props = $props();

  let el: HTMLDivElement | null = $state(null);

  $effect(() => {
    if (!el) return;
    // Apply the style string as a DOM property assignment (cssText)
    // rather than rendering it as an HTML `style="..."` attribute. The
    // diagram webview's strict CSP blocks inline style attributes, but
    // programmatic style mutation via JS is uncovered by CSP — same
    // mechanism Svelte's `style:` directive relies on.
    el.style.cssText = style ?? '';
    if (bindRef) bindRef(el);
  });

  // panel    = main surface card (ModelBox-like, no shadow)
  // popover  = floating panel (Dropdown, Select panel, Tooltip) with shadow.
  //            Uses a layered background: a solid `bg-vsc-bg` pseudo-element
  //            behind the themed `bg-vsc-card-bg` so the surface stays fully
  //            opaque even on VS Code themes where editorWidget-background
  //            ships as a translucent colour. Without the underlay, popovers
  //            placed over panels (e.g. SearchHelpPopover inside an
  //            OffcanvasPanel) bleed the parent's content through.
  // inline   = subtle inline grouping (no shadow, lighter border)
  // banner   = horizontal bar across the top (CompareBanner)
  const KIND_CLS: Record<Kind, string> = {
    panel: 'bg-vsc-card-bg border border-vsc-card-border/70 rounded-lg',
    popover:
      'isolate bg-vsc-card-bg border border-vsc-card-border rounded-lg shadow-panel ' +
      'before:absolute before:inset-0 before:-z-10 before:rounded-[inherit] before:bg-vsc-bg before:content-[""]',
    inline: 'bg-vsc-bg/40 border border-vsc-card-border/50 rounded-md',
    banner: 'bg-vsc-card-bg/60 border-y border-vsc-card-border/70',
  };
</script>

<div bind:this={el} class="{KIND_CLS[kind]} {cls}" {role} {id}>
  {@render children()}
</div>
