<script lang="ts">
  import type { Component } from 'svelte';
  import { Surface } from '$atoms';

  type IconComp = Component<{ size?: number; class?: string; title?: string }>;

  export type SelectIndicator = 'online' | 'away' | 'offline' | 'danger' | 'neutral';

  export type Option = {
    value: string;
    label: string;
    secondary?: string;
    indicator?: SelectIndicator;
    icon?: IconComp;
  };

  type Props = {
    value: string;
    options: Option[];
    placeholder?: string;
    onChange: (value: string) => void;
    minWidth?: number;
    title?: string;
    maxWidth?: number;
  };

  let {
    value,
    options,
    placeholder = '—',
    onChange,
    minWidth = 140,
    maxWidth,
    title,
  }: Props = $props();

  // The combobox must point at the listbox it controls (aria-controls), and
  // several Selects can be on screen at once, so the id has to be unique.
  const listboxId = `select-listbox-${crypto.randomUUID().slice(0, 8)}`;

  let open = $state(false);
  let query = $state('');
  // Pre-filled label shouldn't filter the list to itself until the user types.
  let userTyped = $state(false);
  let highlightedIndex = $state(0);
  let rootEl: HTMLDivElement | null = $state(null);
  let inputEl: HTMLInputElement | null = $state(null);
  let panelEl: HTMLDivElement | null = $state(null);
  let panelAlign: 'left' | 'right' = $state('left');
  const optionRefs: HTMLButtonElement[] = $state([]);

  const selected = $derived(options.find(o => o.value === value));
  const displayLabel = $derived(selected?.label ?? '');
  const inputValue = $derived(open ? query : displayLabel);

  const filteredOptions = $derived.by(() => {
    if (!open || !userTyped) return options;
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(o => o.label.toLowerCase().includes(q));
  });

  $effect(() => {
    if (highlightedIndex >= filteredOptions.length) {
      highlightedIndex = Math.max(0, filteredOptions.length - 1);
    }
  });

  $effect(() => {
    if (!open) return;
    optionRefs[highlightedIndex]?.scrollIntoView({ block: 'nearest' });
  });

  function checkAlignment() {
    if (!panelEl) return;
    const rect = panelEl.getBoundingClientRect();
    panelAlign = rect.right > document.documentElement.clientWidth - 8 ? 'right' : 'left';
  }

  function openPanel() {
    if (open) return;
    open = true;
    query = displayLabel;
    userTyped = false;
    const idx = options.findIndex(o => o.value === value);
    highlightedIndex = idx >= 0 ? idx : 0;
    queueMicrotask(() => {
      checkAlignment();
      inputEl?.focus();
      inputEl?.select();
    });
  }

  function closePanel() {
    open = false;
    query = '';
    userTyped = false;
  }

  function pick(v: string) {
    onChange(v);
    closePanel();
    inputEl?.blur();
  }

  function onInput(e: Event) {
    query = (e.target as HTMLInputElement).value;
    userTyped = true;
    if (!open) open = true;
    highlightedIndex = 0;
  }

  function onFocus() {
    if (!open) openPanel();
  }

  function onFocusOut(e: FocusEvent) {
    const next = e.relatedTarget as HTMLElement | null;
    if (!rootEl) return;
    // Only close when focus moves to a REAL element outside the component
    // (e.g. tabbing away). A null relatedTarget fires when scrolling the panel
    // or grabbing its scrollbar — closing there is the "closes when I scroll"
    // bug in narrow panels. True outside clicks are handled by onDocClick.
    if (next && !rootEl.contains(next)) closePanel();
  }

  function onKeydown(e: KeyboardEvent) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') {
        e.preventDefault();
        openPanel();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (filteredOptions.length === 0) return;
      highlightedIndex = (highlightedIndex + 1) % filteredOptions.length;
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (filteredOptions.length === 0) return;
      highlightedIndex = (highlightedIndex - 1 + filteredOptions.length) % filteredOptions.length;
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const opt = filteredOptions[highlightedIndex];
      if (opt) pick(opt.value);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      closePanel();
      inputEl?.blur();
    }
  }

  function onDocClick(e: MouseEvent) {
    if (!open || !rootEl) return;
    const t = e.target as HTMLElement | null;
    if (!t) return;
    if (!rootEl.contains(t)) closePanel();
  }

  $effect(() => {
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  });

  const minWidthPx = $derived(`${minWidth}px`);
  const maxWidthPx = $derived(maxWidth ? `${maxWidth}px` : '');
</script>

<div
  bind:this={rootEl}
  class="relative inline-flex"
  style:min-width={minWidthPx}
  style:max-width={maxWidthPx}
  {title}
  onfocusout={onFocusOut}
>
  <div class="relative w-full">
    <input
      bind:this={inputEl}
      type="text"
      role="combobox"
      aria-expanded={open}
      aria-controls={listboxId}
      aria-autocomplete="list"
      aria-haspopup="listbox"
      autocomplete="off"
      spellcheck="false"
      placeholder={open ? displayLabel || placeholder : placeholder}
      value={inputValue}
      onclick={e => {
        e.stopPropagation();
        openPanel();
      }}
      onfocus={onFocus}
      oninput={onInput}
      onkeydown={onKeydown}
      class="w-full bg-vsc-bg text-vsc-editor-fg
             border rounded-md
             pl-3 pr-8 py-2 text-[13px] font-vsc
             placeholder:text-vsc-desc/60
             transition-colors duration-fast
             hover:border-vsc-card-border
             focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vsc-link/40
             {open ? 'border-vsc-link/70' : 'border-vsc-card-border/70'}"
    />
    <span
      aria-hidden="true"
      class="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none flex items-center"
    >
      <svg
        viewBox="0 0 20 20"
        fill="currentColor"
        class="w-3.5 h-3.5 opacity-60 transition-transform duration-fast {open ? 'rotate-180' : ''}"
      >
        <path
          fill-rule="evenodd"
          d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 011.08 1.04l-4.25 4.4a.75.75 0 01-1.08 0l-4.25-4.4a.75.75 0 01.02-1.06z"
          clip-rule="evenodd"
        />
      </svg>
    </span>
  </div>

  {#if open}
    <Surface
      kind="popover"
      role="listbox"
      id={listboxId}
      bindRef={el => (panelEl = el)}
      class="absolute top-[calc(100%+6px)] {panelAlign === 'right'
        ? 'right-0 origin-top-right'
        : 'left-0 origin-top-left'} min-w-full max-w-[calc(100vw-1rem)] max-h-[340px] flex flex-col z-tooltip
             transition-[opacity,transform] duration-fast ease-spring
             motion-safe:animate-[fade-scale-in_var(--duration-fast)_var(--ease-spring)_forwards]"
    >
      <div class="flex-1 overflow-y-auto p-1.5">
        {#each filteredOptions as opt, i (opt.value)}
          {@const Leading = opt.icon}
          <button
            bind:this={optionRefs[i]}
            type="button"
            role="option"
            aria-selected={opt.value === value}
            onmousedown={e => e.preventDefault()}
            onclick={e => {
              e.stopPropagation();
              pick(opt.value);
            }}
            onmouseenter={() => (highlightedIndex = i)}
            class="w-full flex items-center gap-2 text-left text-body font-vsc cursor-pointer
                   px-3 py-1.5 rounded-md transition-colors duration-fast
                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vsc-link/60 focus-visible:ring-inset
                   {i === highlightedIndex
              ? 'bg-accent-soft text-vsc-link'
              : opt.value === value
                ? 'bg-accent-base text-vsc-link font-semibold'
                : 'text-vsc-editor-fg hover:bg-accent-soft hover:text-vsc-link'}"
          >
            {#if opt.indicator}
              <span
                aria-hidden="true"
                class="shrink-0 inline-flex w-3 h-3 items-center justify-center"
              >
                <span
                  class="w-2 h-2 rounded-full
                         {opt.indicator === 'online' ? 'bg-fk' : ''}
                         {opt.indicator === 'away' ? 'bg-o2o' : ''}
                         {opt.indicator === 'offline' ? 'bg-vsc-desc/40' : ''}
                         {opt.indicator === 'danger' ? 'bg-danger' : ''}
                         {opt.indicator === 'neutral' ? 'bg-vsc-desc/70' : ''}"
                ></span>
              </span>
            {:else if Leading}
              <span class="shrink-0 inline-flex items-center text-vsc-desc/80">
                <Leading size={14} />
              </span>
            {/if}
            <span class="flex-1 min-w-0 inline-flex items-baseline gap-1.5">
              <span class="truncate">{opt.label}</span>
              {#if opt.secondary}
                <span class="shrink-0 text-label text-vsc-desc/70 font-vsc-editor truncate">
                  {opt.secondary}
                </span>
              {/if}
            </span>
            {#if opt.value === value}
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                class="w-4 h-4 shrink-0"
                aria-hidden="true"
              >
                <path
                  fill-rule="evenodd"
                  d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                  clip-rule="evenodd"
                />
              </svg>
            {/if}
          </button>
        {/each}
        {#if filteredOptions.length === 0}
          <div class="px-3 py-2 text-label text-vsc-desc/70 italic text-center">No matches</div>
        {/if}
      </div>
    </Surface>
  {/if}
</div>
