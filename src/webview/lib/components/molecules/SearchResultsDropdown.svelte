<script lang="ts">
  import { Kbd, Surface } from '$atoms';
  import { IconSchedule, IconSearch } from '$icons';
  import { parseSearchQuery } from '$lib/helpers/search';
  import { toolbar } from '$lib/state/toolbar.svelte';

  export type PickPayload = {
    newQuery?: string;
    navigateKey?: string;
  };

  type Props = {
    query: string;
    open: boolean;
    limit?: number;
    onPick?: (payload: PickPayload) => void;
  };

  let { query, open, limit = 8, onPick }: Props = $props();

  const MAX = $derived(Math.max(1, limit));
  const parsed = $derived(parseSearchQuery(query));

  type Result = {
    primary: string;
    prefix?: string;
    meta: string;
    kindLabel: 'MODEL' | 'FIELD' | 'REL';
    payload: PickPayload;
  };

  // Build a model-name → row for default scope.
  function modelResults(q: string): Result[] {
    const out: { r: Result; score: number }[] = [];
    for (const box of toolbar.boxes) {
      const haystack = box.searchModel ?? '';
      const idx = haystack.indexOf(q);
      if (idx < 0) continue;
      const score = idx * 100 + box.name.length;
      out.push({
        score,
        r: {
          primary: box.name,
          prefix: box.appLabel ? `${box.appLabel}.` : undefined,
          meta: `${box.fieldCount} fields`,
          kindLabel: 'MODEL',
          payload: {
            newQuery: box.appLabel ? `${box.appLabel}.${box.name}` : box.name,
            navigateKey: box.key,
          },
        },
      });
    }
    return finalize(out);
  }

  function fieldResults(q: string): Result[] {
    const counts = new Map<string, number>();
    for (const box of toolbar.boxes) {
      for (const f of box.fields) {
        if (!f.name) continue;
        counts.set(f.name, (counts.get(f.name) ?? 0) + 1);
      }
    }
    const out: { r: Result; score: number }[] = [];
    for (const [name, count] of counts) {
      const idx = name.toLowerCase().indexOf(q);
      if (idx < 0) continue;
      const score = idx * 100 + name.length;
      out.push({
        score,
        r: {
          primary: name,
          meta: `in ${count} model${count === 1 ? '' : 's'}`,
          kindLabel: 'FIELD',
          payload: { newQuery: `field:${name}` },
        },
      });
    }
    return finalize(out);
  }

  function relationResults(q: string): Result[] {
    const counts = new Map<string, number>();
    for (const box of toolbar.boxes) {
      for (const r of box.relations) {
        if (!r.target) continue;
        counts.set(r.target, (counts.get(r.target) ?? 0) + 1);
      }
    }
    const out: { r: Result; score: number }[] = [];
    for (const [target, count] of counts) {
      const idx = target.toLowerCase().indexOf(q);
      if (idx < 0) continue;
      const score = idx * 100 + target.length;
      out.push({
        score,
        r: {
          primary: target,
          meta: `${count} model${count === 1 ? '' : 's'} reference${count === 1 ? 's' : ''} this`,
          kindLabel: 'REL',
          payload: { newQuery: `rel:${target}` },
        },
      });
    }
    return finalize(out);
  }

  function finalize(out: { r: Result; score: number }[]): Result[] {
    out.sort((a, b) => a.score - b.score);
    return out.slice(0, MAX).map(x => x.r);
  }

  const results = $derived.by<Result[]>(() => {
    const q = parsed.query;
    if (!q || q.length < 1) return [];
    if (parsed.scope === 'fields') return fieldResults(q);
    if (parsed.scope === 'relations') return relationResults(q);
    return modelResults(q);
  });

  // Recents are recorded on commit (Enter / click), not mid-typing.
  const RECENTS_KEY = 'django-ls:search-recents';
  const MAX_RECENTS = 5;

  function loadRecents(): string[] {
    try {
      const raw = localStorage.getItem(RECENTS_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr)
        ? arr.filter((x: unknown): x is string => typeof x === 'string').slice(0, MAX_RECENTS)
        : [];
    } catch {
      return [];
    }
  }

  function saveRecents(list: string[]): void {
    try {
      localStorage.setItem(RECENTS_KEY, JSON.stringify(list));
    } catch {
      // Quota or sandboxing — silently ignore; recents are nice-to-have.
    }
  }

  let recents = $state<string[]>(loadRecents());

  function recordRecent(q: string): void {
    const trimmed = q.trim();
    if (!trimmed || trimmed.length < 2) return;
    const next = [trimmed, ...recents.filter(r => r !== trimmed)].slice(0, MAX_RECENTS);
    recents = next;
    saveRecents(next);
  }

  // Unified item list so keyboard nav walks one flat array.
  type Item = { kind: 'result'; result: Result } | { kind: 'recent'; query: string };

  const hasQuery = $derived(query.trim().length > 0);
  const items = $derived.by<Item[]>(() => {
    if (hasQuery) return results.map(r => ({ kind: 'result' as const, result: r }));
    return recents.map(q => ({ kind: 'recent' as const, query: q }));
  });

  const showEmpty = $derived(hasQuery && results.length === 0);
  const hasContent = $derived(hasQuery || recents.length > 0);

  let activeIdx = $state(0);

  $effect(() => {
    // Reading `query` is what subscribes this effect to it — the Svelte 5 way
    // of saying "re-run when the query changes". It is a dependency, not a
    // forgotten statement.
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    query;
    activeIdx = 0;
  });

  $effect(() => {
    if (activeIdx >= items.length) activeIdx = 0;
  });

  export function navigate(dir: 1 | -1): void {
    if (items.length === 0) return;
    activeIdx = (activeIdx + dir + items.length) % items.length;
  }
  export function commit(): boolean {
    const hit = items[activeIdx];
    if (!hit) return false;
    if (hit.kind === 'result') {
      recordRecent(hit.result.payload.newQuery ?? query);
      onPick?.(hit.result.payload);
    } else {
      onPick?.({ newQuery: hit.query });
    }
    return true;
  }

  function pickResult(r: Result): void {
    recordRecent(r.payload.newQuery ?? query);
    onPick?.(r.payload);
  }

  function pickRecent(q: string): void {
    onPick?.({ newQuery: q });
  }

  function clearRecents(e: MouseEvent): void {
    e.stopPropagation();
    e.preventDefault();
    recents = [];
    saveRecents([]);
  }
</script>

{#if open && hasContent}
  <Surface
    kind="popover"
    role="listbox"
    class="absolute top-[calc(100%+6px)] left-0 right-0 z-tooltip overflow-hidden flex flex-col max-h-[420px]
           transition-[opacity,transform] duration-fast ease-spring
           motion-safe:animate-[fade-scale-in_var(--duration-fast)_var(--ease-spring)_forwards]"
  >
    <div class="flex-1 overflow-y-auto p-1.5">
      {#if hasQuery}
        {#if results.length > 0}
          {#each items as it, i (it.kind === 'result' ? `r:${it.result.primary}:${it.result.prefix ?? ''}` : `x:${i}`)}
            {#if it.kind === 'result'}
              {@const r = it.result}
              <button
                type="button"
                role="option"
                aria-selected={i === activeIdx}
                onclick={e => {
                  e.stopPropagation();
                  pickResult(r);
                }}
                onmouseenter={() => (activeIdx = i)}
                class="w-full flex items-center justify-between gap-3 text-left text-body font-vsc cursor-pointer
                       px-3 py-1.5 rounded-md transition-colors duration-fast
                       {i === activeIdx
                  ? 'bg-accent-base text-vsc-link font-semibold ring-1 ring-inset ring-vsc-link/50'
                  : 'text-vsc-editor-fg hover:bg-accent-soft hover:text-vsc-link'}"
              >
                <span class="inline-flex items-baseline gap-1.5 min-w-0 flex-1">
                  {#if r.prefix}
                    <span class="text-vsc-desc/70 text-label shrink-0">{r.prefix}</span>
                  {/if}
                  <span
                    class="font-semibold truncate {r.kindLabel === 'FIELD' || r.kindLabel === 'REL'
                      ? 'font-vsc-editor'
                      : ''}"
                  >
                    {r.primary}
                  </span>
                </span>
                <span
                  class="inline-flex items-center gap-2 shrink-0 text-label text-vsc-desc/80 tabular-nums"
                >
                  <span>{r.meta}</span>
                  <span
                    class="px-1.5 py-px rounded-sm bg-white/[0.06] text-meta uppercase tracking-[0.4px]"
                  >
                    {r.kindLabel}
                  </span>
                </span>
              </button>
            {/if}
          {/each}
        {:else if showEmpty}
          <!--
            Inline empty state — no separate component for two reasons: the
            popover already constrains width/spacing tightly, and the hint
            text is search-specific (mentions the field:/rel: prefixes).
          -->
          <div
            class="flex flex-col items-center justify-center text-center py-6 px-4 gap-1.5 select-none"
          >
            <span class="text-vsc-desc/50"><IconSearch size={20} /></span>
            <div class="text-body font-semibold text-vsc-editor-fg">No matches</div>
            <div class="text-label text-vsc-desc/80 max-w-[280px] leading-relaxed">
              Try
              <code class="px-1 py-px rounded-sm bg-white/[0.06] font-vsc-editor text-vsc-link"
                >field:name</code
              >
              for fields or
              <code class="px-1 py-px rounded-sm bg-white/[0.06] font-vsc-editor text-vsc-link"
                >rel:Model</code
              >
              for relations.
            </div>
          </div>
        {/if}
      {:else if recents.length > 0}
        <!--
          Recents header — sticky inside the scroll area so the section title
          stays visible while scrolling a (small) list of past queries. Clear
          button is destructive-styled but inline (no confirm dialog — recents
          are recoverable just by searching again).
        -->
        <div
          class="sticky top-0 z-[1] bg-vsc-card-bg flex items-center justify-between px-2 pt-1 pb-1"
        >
          <span
            class="text-meta font-semibold tracking-[0.4px] uppercase text-vsc-desc/70 inline-flex items-center gap-1.5"
          >
            <IconSchedule size={11} /> Recent
          </span>
          <button
            type="button"
            onclick={clearRecents}
            class="text-meta text-vsc-desc/60 hover:text-vsc-link transition-colors duration-fast cursor-pointer"
          >
            Clear
          </button>
        </div>
        {#each items as it, i (i)}
          {#if it.kind === 'recent'}
            <button
              type="button"
              role="option"
              aria-selected={i === activeIdx}
              onclick={e => {
                e.stopPropagation();
                pickRecent(it.query);
              }}
              onmouseenter={() => (activeIdx = i)}
              class="w-full flex items-center gap-2 text-left text-body font-vsc cursor-pointer
                     px-3 py-1.5 rounded-md transition-colors duration-fast
                     {i === activeIdx
                ? 'bg-accent-base text-vsc-link'
                : 'text-vsc-editor-fg hover:bg-accent-soft hover:text-vsc-link'}"
            >
              <span class="shrink-0 text-vsc-desc/50"><IconSchedule size={12} /></span>
              <span class="truncate font-vsc-editor">{it.query}</span>
            </button>
          {/if}
        {/each}
      {/if}
    </div>
    <!--
      Footer hint bar — pinned to the popover bottom. Mirrors the convention
      from VS Code's own command palette and Tailwind UI's "footer with
      navigation hints" pattern.
    -->
    <div
      class="shrink-0 flex items-center gap-3 px-2.5 py-1.5 border-t border-vsc-card-border/60
             text-meta text-vsc-desc/70 bg-vsc-bg/40"
    >
      <span class="inline-flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
      <span class="inline-flex items-center gap-1"><Kbd>↵</Kbd> select</span>
      <span class="inline-flex items-center gap-1"><Kbd>esc</Kbd> dismiss</span>
    </div>
  </Surface>
{/if}
