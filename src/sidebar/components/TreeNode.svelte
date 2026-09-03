<script lang="ts">
  import type { Snippet } from 'svelte';
  import { slide } from 'svelte/transition';
  import { IconChevronRight } from '$icons';
  import type { TreeIcon, TreeTrailingAction } from '../lib/tree';

  type Props = {
    label: string;
    icon?: TreeIcon;
    subtitle?: string;
    meta?: string;
    depth?: number;
    hasChildren?: boolean;
    expanded?: boolean;
    selected?: boolean;
    badge?: string;
    title?: string;
    trailing?: TreeTrailingAction[];
    trailingAlwaysVisible?: boolean;
    onClick?: () => void;
    onTrailingClick?: (id: string) => void;
    children?: Snippet;
  };

  let {
    label,
    icon,
    subtitle,
    meta,
    depth = 0,
    hasChildren = false,
    expanded = false,
    selected = false,
    badge,
    title,
    trailing,
    trailingAlwaysVisible = false,
    onClick,
    onTrailingClick,
    children,
  }: Props = $props();

  const IconComp = $derived(icon);
  const paddingLeft = $derived(depth * 12 + 4);
  const ariaRole = 'treeitem' as const;
</script>

<div class="flex flex-col" role={hasChildren ? 'group' : undefined}>
  <div class="group flex items-center gap-0.5">
    <button
      type="button"
      onclick={onClick}
      title={title ?? label}
      role={ariaRole}
      aria-expanded={hasChildren ? expanded : undefined}
      aria-selected={selected || undefined}
      class="flex flex-1 items-center gap-1.5 min-w-0 pr-2 py-1 text-body cursor-pointer
             transition-colors duration-fast rounded-sm
             hover:bg-accent-subtle
             focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vsc-link/60 focus-visible:ring-inset
             {selected ? 'bg-accent-base text-vsc-link' : 'text-vsc-editor-fg'}"
      style="padding-left: {paddingLeft}px"
    >
      <span class="w-4 shrink-0 inline-flex items-center justify-center text-vsc-desc/70">
        {#if hasChildren}
          <span class="transition-transform duration-fast {expanded ? 'rotate-90' : ''}">
            <IconChevronRight size={14} />
          </span>
        {/if}
      </span>
      {#if IconComp}
        <span class="shrink-0 text-vsc-desc/80 inline-flex items-center"
          ><IconComp size={15} /></span
        >
      {/if}
      <span class="flex-1 min-w-0 text-left">
        <span class="block truncate">{label}</span>
        {#if subtitle}
          <span class="block truncate text-meta text-vsc-desc/70 leading-tight">{subtitle}</span>
        {/if}
      </span>
      {#if meta}
        <span class="shrink-0 text-meta text-vsc-desc/70 italic">{meta}</span>
      {/if}
      {#if badge}
        <span class="shrink-0 text-label text-vsc-desc/70 tabular-nums">{badge}</span>
      {/if}
    </button>
    {#if trailing && trailing.length}
      <div class="shrink-0 flex items-center gap-0.5 pr-1">
        {#each trailing as action (action.id)}
          {@const ActionIcon = action.icon}
          <button
            type="button"
            title={action.title}
            aria-label={action.title}
            aria-pressed={action.active}
            onclick={e => {
              e.stopPropagation();
              onTrailingClick?.(action.id);
            }}
            class="inline-flex items-center justify-center w-6 h-6 rounded-sm
                   transition-colors duration-fast cursor-pointer
                   focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vsc-link/60 focus-visible:ring-inset
                   {action.active
              ? 'bg-fk-soft text-fk'
              : trailingAlwaysVisible
                ? 'text-vsc-desc/70 hover:bg-accent-subtle hover:text-vsc-link'
                : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 text-vsc-desc/80 hover:bg-accent-subtle hover:text-vsc-link'}"
          >
            <ActionIcon size={14} />
          </button>
        {/each}
      </div>
    {/if}
  </div>
  {#if hasChildren && expanded && children}
    <div class="flex flex-col" transition:slide={{ duration: 150 }}>
      {@render children()}
    </div>
  {/if}
</div>
