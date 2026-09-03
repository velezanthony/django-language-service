<script lang="ts">
  import type { Component } from 'svelte';

  type IconComp = Component<{ size?: number; class?: string; title?: string }>;

  export type TabItem = {
    id: string;
    label: string;
    icon?: IconComp;
    /** Optional small chip rendered after the label (e.g. count of items or
     *  pending notifications). Accepts string or number — numbers render
     *  with tabular-nums. */
    badge?: string | number;
  };

  type Variant = 'underline' | 'segmented';

  type Props = {
    tabs: TabItem[];
    active: string;
    onChange: (id: string) => void;
    /**
     * `underline` (default) — flat row, accent underline on the active tab.
     *   Use when tabs sit above a content body and need to feel connected.
     * `segmented` — pill-shaped capsule with the active tab filled in.
     *   Use as a compact mode-switch inside toolbars or banners; doesn't
     *   compete with body content visually.
     */
    variant?: Variant;
  };

  let { tabs, active, onChange, variant = 'underline' }: Props = $props();
</script>

{#if variant === 'segmented'}
  <!--
    Segmented control — the whole strip is a single bordered capsule and
    each tab is an inner pill that lights up when active. Padding is tight
    so a row of 3-5 tabs stays compact next to other toolbar controls.
  -->
  <div
    role="tablist"
    class="inline-flex items-center gap-0.5 p-0.5 rounded-md bg-vsc-bg/40 border border-vsc-card-border/60"
  >
    {#each tabs as tab (tab.id)}
      {@const Icon = tab.icon}
      {@const isActive = tab.id === active}
      <button
        type="button"
        role="tab"
        aria-selected={isActive}
        onclick={() => onChange(tab.id)}
        class="inline-flex items-center gap-1.5 px-2.5 py-1
               text-label font-medium cursor-pointer whitespace-nowrap rounded-sm
               transition-colors duration-fast
               focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vsc-link/60 focus-visible:ring-inset
               {isActive
          ? 'bg-accent-base text-vsc-link'
          : 'text-vsc-desc hover:text-vsc-editor-fg hover:bg-accent-subtle'}"
      >
        {#if Icon}<Icon size={14} />{/if}
        <span>{tab.label}</span>
        {#if tab.badge !== undefined && tab.badge !== ''}
          <span
            class="inline-flex items-center justify-center min-w-[18px] px-1 rounded-sm
                   text-meta {typeof tab.badge === 'number' ? 'tabular-nums' : ''}
                   {isActive
              ? 'bg-accent-soft text-vsc-link'
              : 'bg-vsc-card-border/40 text-vsc-desc'}"
          >
            {tab.badge}
          </span>
        {/if}
      </button>
    {/each}
  </div>
{:else}
  <!--
    Horizontal tab strip with underline accent. The underline sits on top of
    the bottom border of the strip so the alignment is exact (border-b on the
    active button, border-b-transparent on the rest, the container itself
    carries the 1px divider in the gap region).
  -->
  <div role="tablist" class="flex border-b border-vsc-card-border">
    {#each tabs as tab (tab.id)}
      {@const Icon = tab.icon}
      {@const isActive = tab.id === active}
      <button
        type="button"
        role="tab"
        aria-selected={isActive}
        onclick={() => onChange(tab.id)}
        class="flex flex-1 items-center justify-center gap-1.5 px-2 py-2.5
               text-label font-medium cursor-pointer whitespace-nowrap
               border-b-2 -mb-px
               transition-colors duration-fast
               focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vsc-link/60 focus-visible:ring-inset
               {isActive
          ? 'text-vsc-link border-vsc-link'
          : 'text-vsc-desc border-transparent hover:text-vsc-editor-fg hover:bg-accent-subtle'}"
      >
        {#if Icon}<Icon size={14} />{/if}
        <span>{tab.label}</span>
        {#if tab.badge !== undefined && tab.badge !== ''}
          <span
            class="inline-flex items-center justify-center min-w-[18px] px-1 rounded-sm
                   text-meta {typeof tab.badge === 'number' ? 'tabular-nums' : ''}
                   {isActive
              ? 'bg-accent-soft text-vsc-link'
              : 'bg-vsc-card-border/40 text-vsc-desc'}"
          >
            {tab.badge}
          </span>
        {/if}
      </button>
    {/each}
  </div>
{/if}
