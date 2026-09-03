<script lang="ts">
  import type { Snippet } from 'svelte';

  type Props = {
    anchor: HTMLElement | null;
    children: Snippet;
    class?: string;
    role?: 'tooltip' | 'dialog';
    /** Gap between anchor and popup (px). */
    gap?: number;
    /** Minimum gap between popup edges and viewport (px). */
    margin?: number;
    /** Width cap used for flip math; the actual popup may be narrower. */
    maxWidth?: number;
    /** Height cap used for flip math; the actual popup may be shorter. */
    maxHeight?: number;
  };

  let {
    anchor,
    children,
    class: cls = '',
    role = 'tooltip',
    gap = 4,
    margin = 8,
    maxWidth = 360,
    maxHeight = 280,
  }: Props = $props();

  let el: HTMLDivElement | null = $state(null);

  // Smart positioning mirroring the legacy positionChoicesPopup: prefer
  // right-aligned (popup extends LEFT from anchor), flip to left-aligned if
  // it would overflow the left edge, then clamp to viewport on both axes.
  function reposition() {
    if (!anchor || !el) return;
    const rect = anchor.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const popupW = Math.min(el.offsetWidth || maxWidth, maxWidth);
    const popupH = Math.min(el.offsetHeight || maxHeight, maxHeight);

    let left = rect.right - popupW;
    if (left < margin) left = rect.left;
    if (left + popupW > vw - margin) left = vw - popupW - margin;
    if (left < margin) left = margin;

    let top = rect.bottom + gap;
    if (top + popupH > vh - margin) top = rect.top - popupH - gap;
    if (top < margin) top = margin;

    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }

  // Listen to anchor's mouseover/focus — matches the legacy behaviour where
  // mouseover (not mouseenter) fires repeatedly within the chip, so a user
  // scrolling the tooltip body during hover gets the popup re-anchored to the
  // chip's new viewport position. focus uses capture phase because plain focus
  // doesn't bubble.
  $effect(() => {
    if (!anchor || !el) return;
    const handler = () => reposition();
    anchor.addEventListener('mouseover', handler);
    anchor.addEventListener('focus', handler, true);
    return () => {
      anchor.removeEventListener('mouseover', handler);
      anchor.removeEventListener('focus', handler, true);
    };
  });
</script>

<svelte:window onresize={reposition} />

<!--
  Position is `fixed` so the popup escapes the parent tooltip's overflow-hidden
  boundary. Top/left are set imperatively by reposition() — the inline style
  starts at 0,0 and is overwritten on first hover. Visibility transitions in
  via `group-hover:` / `group-focus-within:` modifiers, driven by the parent
  chip's `group` class.
-->
<div
  bind:this={el}
  class="cursor-auto fixed top-0 left-0 min-w-[240px] max-w-[360px] max-h-[280px] overflow-y-auto bg-vsc-card-bg border border-vsc-link rounded-md p-3 shadow-panel z-popover opacity-0 -translate-y-1 pointer-events-none transition-[opacity,transform] duration-fast ease-out font-vsc text-vsc-editor-fg normal-case tracking-normal group-hover:opacity-100 group-hover:translate-y-0 group-hover:pointer-events-auto group-focus:opacity-100 group-focus:translate-y-0 group-focus:pointer-events-auto group-focus-within:opacity-100 group-focus-within:translate-y-0 group-focus-within:pointer-events-auto {cls}"
  {role}
>
  {@render children()}
</div>
