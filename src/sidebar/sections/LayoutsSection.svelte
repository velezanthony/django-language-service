<script lang="ts">
  import SidebarSection from '../components/SidebarSection.svelte';
  import LoadingSkeleton from '../components/LoadingSkeleton.svelte';
  import TreeView from '../components/TreeView.svelte';
  import { EmptyState, TextInput } from '$atoms';
  import { IconFolderOpen, IconList, IconSearch } from '$icons';
  import { subscribeToData } from '../lib/messages';
  import { postMessage } from '../lib/vscode';
  import type { TreeNodeData } from '../lib/tree';

  type LayoutsPayload = {
    layouts: Array<{ templatePath: string; file: string; childCount: number }>;
    partials: Array<{ templatePath: string; file: string; includerCount: number }>;
  };

  let payload = $state<LayoutsPayload | null>(null);
  let filter = $state('');

  $effect(() => subscribeToData<LayoutsPayload>(p => (payload = p)));

  const filtered = $derived.by<LayoutsPayload | null>(() => {
    if (!payload) return null;
    const q = filter.trim().toLowerCase();
    const matches = (path: string): boolean => (q ? path.toLowerCase().includes(q) : true);
    return {
      // A layout is a base template OTHER templates {% extends %}. Drop the ones
      // nothing extends (childCount 0) — those are page templates, not layouts.
      layouts: payload.layouts.filter(l => l.childCount > 0 && matches(l.templatePath)),
      partials: payload.partials.filter(p => matches(p.templatePath)),
    };
  });

  // Filename + directory split (like VS Code editor tabs).
  const splitPath = (p: string): { name: string; dir: string | undefined } => {
    const lastSlash = p.lastIndexOf('/');
    if (lastSlash < 0) return { name: p, dir: undefined };
    return { name: p.slice(lastSlash + 1), dir: p.slice(0, lastSlash) };
  };

  const nodes = $derived.by<TreeNodeData[]>(() => {
    if (!filtered) return [];
    const out: TreeNodeData[] = [];
    if (filtered.layouts.length > 0) {
      out.push({
        id: 'group:layouts',
        label: 'Layouts',
        icon: IconFolderOpen,
        badge: String(filtered.layouts.length),
        initiallyExpanded: true,
        children: filtered.layouts.map(l => {
          const { name, dir } = splitPath(l.templatePath);
          return {
            id: `layout:${l.templatePath}`,
            label: name,
            subtitle: dir,
            title: `${l.templatePath} — extended by ${l.childCount} template${l.childCount === 1 ? '' : 's'}`,
            icon: IconList,
            badge: String(l.childCount),
            payload: { file: l.file },
          };
        }),
      });
    }
    if (filtered.partials.length > 0) {
      out.push({
        id: 'group:partials',
        label: 'Partials',
        icon: IconFolderOpen,
        badge: String(filtered.partials.length),
        initiallyExpanded: filtered.layouts.length === 0,
        children: filtered.partials.map(p => {
          const { name, dir } = splitPath(p.templatePath);
          return {
            id: `partial:${p.templatePath}`,
            label: name,
            subtitle: dir,
            title: `${p.templatePath} — included by ${p.includerCount} template${p.includerCount === 1 ? '' : 's'}`,
            icon: IconList,
            badge: String(p.includerCount),
            payload: { file: p.file },
          };
        }),
      });
    }
    return out;
  });

  const totalCount = $derived(payload ? payload.layouts.length + payload.partials.length : null);

  const hasAny = $derived(
    payload !== null && (payload.layouts.length > 0 || payload.partials.length > 0),
  );
  const filterActive = $derived(filter.trim().length > 0);
</script>

<SidebarSection
  title="Layouts & Partials"
  description={'Base templates ({% extends %}) and reusable partials ({% include %}) detected across your apps. Click to open the file.'}
  countLabel={totalCount !== null ? String(totalCount) : undefined}
>
  {#if payload === null}
    <LoadingSkeleton rows={5} />
  {:else if !hasAny}
    <EmptyState
      title="No layouts or partials found"
      hint={'Templates that other templates {% extends %} or {% include %} will appear here once the workspace scan completes.'}
      density="compact"
    >
      {#snippet icon()}
        <IconFolderOpen size={32} />
      {/snippet}
    </EmptyState>
  {:else}
    <div class="flex flex-col gap-2 min-h-0 h-full">
      <TextInput
        size="sm"
        placeholder="Filter templates…"
        ariaLabel="Filter layouts and partials"
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
          No templates match "{filter}".
        </div>
      {/if}
    </div>
  {/if}
</SidebarSection>
