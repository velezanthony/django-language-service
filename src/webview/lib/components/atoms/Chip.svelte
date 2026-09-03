<script lang="ts">
  import type { Snippet } from 'svelte';

  type Props = {
    /** Visual variant. 'unresolved' uses the amber color for cross-file refs not yet resolved. */
    kind?: 'inline' | 'resolved' | 'unresolved';
    ariaLabel: string;
    children: Snippet;
    /** Called once after mount with the rendered element — parent uses it as anchor for floating popups. */
    onAnchor?: (el: HTMLElement) => void;
  };

  let { kind = 'inline', ariaLabel, children, onAnchor }: Props = $props();

  let el: HTMLSpanElement | null = $state(null);

  $effect(() => {
    if (el && onAnchor) onAnchor(el);
  });

  // `group` enables Popup (rendered as descendant) to reveal via group-hover.
  const BASE =
    'group inline-flex items-center gap-1 ml-2 px-2 py-0.5 rounded-md ' +
    // Not cursor-help: the `?` reads as an aside. Not cursor-pointer either —
    // nothing happens on click, the popup is hover/focus only.
    'text-[10px] font-bold font-vsc-editor cursor-default relative tabular-nums ' +
    'transition-colors duration-fast ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vsc-link/60';
  const RESOLVED =
    'bg-vsc-link/[0.14] text-vsc-link ring-1 ring-inset ring-vsc-link/20 hover:bg-vsc-link/[0.22] hover:ring-vsc-link/40 focus:bg-vsc-link/[0.22] focus-visible:bg-vsc-link/[0.22]';
  const UNRESOLVED =
    'bg-o2o/[0.14] text-o2o ring-1 ring-inset ring-o2o/20 hover:bg-o2o/[0.22] hover:ring-o2o/40 focus:bg-o2o/[0.22] focus-visible:bg-o2o/[0.22]';
</script>

<span
  bind:this={el}
  class="{BASE} {kind === 'unresolved' ? UNRESOLVED : RESOLVED}"
  tabindex="0"
  aria-label={ariaLabel}
  role="button"
>
  {@render children()}
</span>
