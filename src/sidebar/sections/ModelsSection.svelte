<script lang="ts">
  import SidebarSection from '../components/SidebarSection.svelte';
  import LoadingSkeleton from '../components/LoadingSkeleton.svelte';
  import TreeView from '../components/TreeView.svelte';
  import { Button, EmptyState, TextInput } from '$atoms';
  import { IconSchema, IconFolderOpen, IconList, IconSearch } from '$icons';
  import { postMessage } from '../lib/vscode';
  import { subscribeToData } from '../lib/messages';
  import type { TreeNodeData } from '../lib/tree';

  type ModelLeaf = { name: string; file: string; line: number; fieldCount: number };
  type ModelsPayload = {
    totalModels: number;
    totalApps: number;
    topApps: Array<{ app: string; count: number }>;
    apps: Array<{ app: string; count: number; models: ModelLeaf[] }>;
  };

  let payload = $state<ModelsPayload | null>(null);
  let filter = $state('');

  $effect(() => subscribeToData<ModelsPayload>(p => (payload = p)));

  // Tree: app → models. Click a model to open its models.py at the right line.
  const nodes = $derived.by<TreeNodeData[]>(() => {
    if (!payload) return [];
    const q = filter.trim().toLowerCase();
    return payload.apps
      .map(a => ({
        a,
        models: q
          ? a.models.filter(
              m => m.name.toLowerCase().includes(q) || a.app.toLowerCase().includes(q),
            )
          : a.models,
      }))
      .filter(({ models }) => models.length > 0)
      .map(({ a, models }) => ({
        id: `app:${a.app}`,
        label: a.app,
        icon: IconFolderOpen,
        badge: String(a.count),
        initiallyExpanded: q.length > 0,
        children: models.map(m => ({
          id: `model:${a.app}.${m.name}`,
          label: m.name,
          title: `${a.app}.${m.name} — ${m.fieldCount} field${m.fieldCount === 1 ? '' : 's'}`,
          icon: IconList,
          badge: String(m.fieldCount),
          payload: { file: m.file, line: m.line },
        })),
      }));
  });

  const filterActive = $derived(filter.trim().length > 0);
</script>

<SidebarSection
  title="Models"
  description="Browse your Django models grouped by app — click one to jump to its models.py — or open the interactive ER diagram. ForeignKey / ManyToMany / OneToOne relations are shown in the diagram."
  countLabel={payload && payload.totalModels > 0 ? String(payload.totalModels) : undefined}
>
  <div class="flex flex-col gap-2.5 mt-1 min-h-0 h-full">
    {#if payload === null}
      <LoadingSkeleton rows={5} />
    {:else if payload.totalModels === 0}
      <EmptyState
        title="No Django models found"
        hint="Once your workspace has models.py files with Django model classes, you can browse them here or open the ER diagram."
        density="compact"
      >
        {#snippet icon()}
          <IconSchema size={32} />
        {/snippet}
      </EmptyState>
    {:else}
      <!-- Quick stats + CTA -->
      <div class="flex items-baseline gap-3 text-label">
        <span class="inline-flex items-baseline gap-1">
          <span class="text-vsc-editor-fg font-bold tabular-nums">{payload.totalModels}</span>
          <span class="text-vsc-desc/70 text-meta uppercase tracking-[0.4px]">models</span>
        </span>
        <span class="inline-flex items-baseline gap-1">
          <span class="text-vsc-editor-fg font-bold tabular-nums">{payload.totalApps}</span>
          <span class="text-vsc-desc/70 text-meta uppercase tracking-[0.4px]">apps</span>
        </span>
      </div>

      <Button variant="primary" size="md" onclick={() => postMessage({ type: 'openModelDiagram' })}>
        <IconSchema size={14} /> Open Model Diagram
      </Button>

      <!-- Navigable tree: app → models -->
      <TextInput
        size="sm"
        placeholder="Filter models…"
        ariaLabel="Filter models"
        oninput={e => (filter = (e.target as HTMLInputElement).value)}
      >
        {#snippet leftAdornment()}
          <IconSearch size={12} />
        {/snippet}
      </TextInput>
      {#if nodes.length > 0}
        <div class="flex-1 min-h-0 overflow-y-auto">
          <TreeView
            {nodes}
            onSelect={node => postMessage({ type: 'openFile', ...(node.payload as object) })}
          />
        </div>
      {:else if filterActive}
        <div class="text-label text-vsc-desc/70 italic text-center px-2 py-3">
          No models match "{filter}".
        </div>
      {/if}
    {/if}
  </div>
</SidebarSection>
