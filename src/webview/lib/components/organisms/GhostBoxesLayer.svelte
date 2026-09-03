<script lang="ts">
  // Ghost boxes for models that existed at the compared migration but no longer
  // exist in the current code (compare mode's removedModels). The canvas only
  // draws the live models, so deleted ones have no real box — we render them as
  // a floating "removed" group with red dashed cards built from the snapshot.
  import { toolbar } from '$lib/state/toolbar.svelte';
  import { loadDiagramData } from '$lib/composables/diagram-data';

  const data = loadDiagramData();

  type Ghost = {
    key: string;
    name: string;
    appLabel: string;
    fields: { name: string; fieldType: string }[];
  };

  const FIELD_LIMIT = 6;

  const ghosts = $derived.by<Ghost[]>(() => {
    const idx = toolbar.compareIdx;
    if (idx < 0) return [];
    const removed = data.migrationComparisons[idx]?.comparison.removedModels ?? [];
    if (removed.length === 0) return [];
    const models = data.snapshots[idx]?.models ?? [];
    return removed.map(key => {
      const model = models.find(m => (m.appLabel ? `${m.appLabel}.${m.name}` : m.name) === key);
      const app = key.includes('.') ? key.split('.')[0]! : '';
      const bare = key.includes('.') ? key.split('.').slice(1).join('.') : key;
      return {
        key,
        name: model?.name ?? bare,
        appLabel: model?.appLabel ?? app,
        fields: model?.fields ?? [],
      };
    });
  });
</script>

{#if ghosts.length > 0}
  <div
    class="absolute top-4 right-4 z-chrome flex flex-col gap-2 max-w-[280px] max-h-[70%] overflow-y-auto pointer-events-auto"
    aria-label="Models removed since the compared migration"
  >
    <div
      class="flex items-center gap-1.5 text-meta uppercase tracking-[0.6px] font-bold text-danger/90"
    >
      <span class="inline-block w-2 h-2 rounded-full bg-danger"></span>
      Removed since this migration ({ghosts.length})
    </div>
    {#each ghosts as g (g.key)}
      <div
        class="rounded-lg border border-danger border-dashed bg-danger/[0.06] px-3 py-2 shadow-card"
      >
        <div class="flex items-baseline gap-1.5">
          {#if g.appLabel}
            <span class="text-meta text-vsc-desc/70 tabular-nums">{g.appLabel}.</span>
          {/if}
          <span class="font-semibold text-vsc-editor-fg line-through decoration-danger/70"
            >{g.name}</span
          >
          <span class="ml-auto text-meta text-danger/90">removed</span>
        </div>
        {#if g.fields.length > 0}
          <div class="mt-1.5 flex flex-col gap-0.5 border-t border-danger/20 pt-1.5">
            {#each g.fields.slice(0, FIELD_LIMIT) as f (f.name)}
              <div class="text-meta text-vsc-desc/70">
                <span class="font-medium line-through decoration-danger/40">{f.name}</span>
                <span class="text-vsc-desc/50">{f.fieldType}</span>
              </div>
            {/each}
            {#if g.fields.length > FIELD_LIMIT}
              <div class="text-meta text-vsc-desc/50 italic">
                +{g.fields.length - FIELD_LIMIT} more…
              </div>
            {/if}
          </div>
        {/if}
      </div>
    {/each}
  </div>
{/if}
