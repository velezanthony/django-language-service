<script lang="ts">
  import type { Component, Snippet } from 'svelte';

  type IconComp = Component<{ size?: number; class?: string; title?: string }>;

  type Tone = 'default' | 'danger';

  type Props = {
    /** Optional leading icon (16-ish). Rendered with a subtle opacity that
     *  pops to accent on hover/focus, matching ContextMenu's vocabulary. */
    icon?: IconComp;
    /** The visible row label. Prefer this over `children` for plain text. */
    label?: string;
    /** Optional keyboard shortcut hint shown right-aligned (e.g. "⌘K", "H"). */
    shortcut?: string;
    /** Destructive intent — danger styling on hover. */
    tone?: Tone;
    /** When true the row is read-only: no hover/active state, no click. */
    disabled?: boolean;
    title?: string;
    onClick?: () => void;
    /** Custom content slot — used when label alone isn't enough (e.g. a row
     *  that bundles a checkmark + label + secondary text). When provided,
     *  the `label` and `shortcut` props are ignored. */
    children?: Snippet;
  };

  let {
    icon,
    label,
    shortcut,
    tone = 'default',
    disabled = false,
    title,
    onClick,
    children,
  }: Props = $props();

  const Icon = $derived(icon);
</script>

<!--
  Single-row dropdown / menu item. Encapsulates the button + hover/focus +
  tone + leading icon + trailing shortcut pattern used across ContextMenu,
  Dropdown, and future menu surfaces. Callers can pass `children` to take
  full control of the row body if needed.
-->
<button
  type="button"
  {title}
  {disabled}
  onclick={e => {
    if (disabled) return;
    e.stopPropagation();
    onClick?.();
  }}
  class="flex w-full items-center gap-2.5 px-3 py-1.5 text-left cursor-pointer whitespace-nowrap
         transition-colors duration-fast rounded-md
         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vsc-link/60 focus-visible:ring-inset
         disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent
         {tone === 'danger'
    ? 'text-vsc-editor-fg hover:bg-danger-soft hover:text-danger'
    : 'text-vsc-editor-fg hover:bg-accent-soft hover:text-vsc-link'}"
>
  {#if children}
    {@render children()}
  {:else}
    {#if Icon}
      <span class="shrink-0 opacity-80"><Icon size={14} /></span>
    {/if}
    <span class="flex-1">{label}</span>
    {#if shortcut}
      <span class="shrink-0 text-meta text-vsc-desc/70 font-vsc-editor tracking-wide">
        {shortcut}
      </span>
    {/if}
  {/if}
</button>
