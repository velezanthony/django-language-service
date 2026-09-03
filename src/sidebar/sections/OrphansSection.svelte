<script lang="ts">
  import SidebarSection from '../components/SidebarSection.svelte';
  import LoadingSkeleton from '../components/LoadingSkeleton.svelte';
  import TreeView from '../components/TreeView.svelte';
  import { EmptyState, TextInput } from '$atoms';
  import { IconCheck, IconFolderOpen, IconList, IconSearch } from '$icons';
  import { subscribeToData } from '../lib/messages';
  import { postMessage } from '../lib/vscode';
  import type { TreeNodeData } from '../lib/tree';

  type OrphansPayload = {
    orphans: Array<{ templatePath: string; file: string }>;
    totalTemplates: number;
  };

  let payload = $state<OrphansPayload | null>(null);
  let filter = $state('');

  $effect(() => subscribeToData<OrphansPayload>(p => (payload = p)));

  const filteredOrphans = $derived.by(() => {
    if (!payload) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return payload.orphans;
    return payload.orphans.filter(o => o.templatePath.toLowerCase().includes(q));
  });

  const splitPath = (p: string): { name: string; dir: string | undefined } => {
    const lastSlash = p.lastIndexOf('/');
    if (lastSlash < 0) return { name: p, dir: undefined };
    return { name: p.slice(lastSlash + 1), dir: p.slice(0, lastSlash) };
  };

  const nodes = $derived.by<TreeNodeData[]>(() =>
    filteredOrphans.map(o => {
      const { name, dir } = splitPath(o.templatePath);
      return {
        id: `orphan:${o.templatePath}`,
        label: name,
        subtitle: dir,
        title: o.templatePath,
        icon: IconList,
        payload: { file: o.file },
      };
    }),
  );

  const hasAny = $derived(payload !== null && payload.orphans.length > 0);
  const filterActive = $derived(filter.trim().length > 0);
  // Svelte snippets don't inherit TS narrowing — pre-derive the boolean here.
  const isFreshWorkspace = $derived(payload?.totalTemplates === 0);
</script>

<SidebarSection
  title="Orphans"
  description={'HTML files under templates/ that no view renders and no other template {% extends %} or {% includes %}. Candidates for cleanup.'}
  countLabel={payload ? String(payload.orphans.length) : undefined}
>
  {#if payload === null}
    <LoadingSkeleton rows={4} />
  {:else if !hasAny}
    <EmptyState
      title={payload.totalTemplates === 0 ? 'No templates yet' : 'No orphan templates'}
      hint={payload.totalTemplates === 0
        ? 'Once your workspace has .html files under templates/ folders, orphans (if any) will appear here.'
        : `All ${payload.totalTemplates} templates are reachable from a view, extends, or include. Nothing to clean up.`}
      density="compact"
    >
      {#snippet icon()}
        {#if isFreshWorkspace}
          <IconFolderOpen size={32} />
        {:else}
          <!-- "Nothing to clean up" is a POSITIVE outcome — a check, not a warning. -->
          <IconCheck size={32} />
        {/if}
      {/snippet}
    </EmptyState>
  {:else}
    <div class="flex flex-col gap-2 min-h-0 h-full">
      <TextInput
        size="sm"
        placeholder="Filter orphans…"
        ariaLabel="Filter orphan templates"
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
          No orphans match "{filter}".
        </div>
      {/if}
    </div>
  {/if}
</SidebarSection>
