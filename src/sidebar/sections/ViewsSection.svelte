<script lang="ts">
  import SidebarSection from '../components/SidebarSection.svelte';
  import LoadingSkeleton from '../components/LoadingSkeleton.svelte';
  import TreeView from '../components/TreeView.svelte';
  import { EmptyState } from '$atoms';
  import {
    IconBolt,
    IconCheck,
    IconChevronRight,
    IconFolderOpen,
    IconList,
    IconSchema,
    IconScience,
    IconSearch,
  } from '$icons';
  import { subscribeToData } from '../lib/messages';
  import { postMessage } from '../lib/vscode';
  import type { TreeNodeData, TreeTrailingAction } from '../lib/tree';

  // Wire shapes mirror the discriminated union in sidebar-data.ts. VIEWS is
  // template-centric: chain mode shows which views render the active
  // template; otherwise the section is intentionally inert with a hint.
  type ViewLeaf = {
    /** Qualified index key '<app>.<name>' — the Live Mode identity. */
    key: string;
    /** Bare view name — display only. */
    name: string;
    type: 'fbv' | 'cbv';
    file: string;
    line: number;
    templateName: string | null;
  };
  type ViewsChainPayload = {
    mode: 'chain';
    currentFileName: string;
    currentTemplatePath: string;
    chainViews: Array<{ view: ViewLeaf; templateChain: string[] }>;
    templateFiles: Record<string, string>;
    liveViewKey: string | null;
  };
  type ViewsNoTemplatePayload = {
    mode: 'no-template';
    liveViewKey: string | null;
  };
  type ViewsPayload = ViewsChainPayload | ViewsNoTemplatePayload;

  let payload = $state<ViewsPayload | null>(null);
  $effect(() => subscribeToData<ViewsPayload>(p => (payload = p)));

  // FBV → flask, CBV → schema. Matches the legacy native TreeView's
  // symbol-function / symbol-class so the icon vocabulary stays familiar.
  const iconForView = (v: ViewLeaf) => (v.type === 'cbv' ? IconSchema : IconScience);

  // The three per-view inline actions. Order is intentional: validate first
  // (the diagnostic pass), go-to in the middle as a quick nav shortcut,
  // Live Mode last (a sticky toggle with its own accent state).
  // Live Mode identity is the qualified key (v.key), never the display name —
  // two apps can define same-named views.
  const viewActions = (v: ViewLeaf, liveKey: string | null): TreeTrailingAction[] => [
    {
      id: 'validate',
      icon: IconCheck,
      active: false,
      title: `Validate context for ${v.name} against the currently open template`,
    },
    {
      id: 'goto',
      icon: IconChevronRight,
      active: false,
      title: `Open ${v.name} source`,
    },
    {
      id: 'live',
      icon: IconBolt,
      active: liveKey === v.key,
      title:
        liveKey === v.key
          ? `Live Mode is ON for ${v.name} — click to disable`
          : `Enable Live Mode (real-time intellisense + diagnostics) for ${v.name}`,
    },
  ];

  // Recursively wrap each chain template into nested children so the user
  // sees the full include/extends path. The deepest descendant is the
  // active file, marked with `selectedId` on TreeView so it lights up.
  function chainToTree(
    chain: string[],
    files: Record<string, string>,
    currentPath: string,
    currentName: string,
    keyPrefix: string,
  ): TreeNodeData[] {
    if (chain.length === 0) return [];
    const [head, ...rest] = chain;
    // `chain.length === 0` returned above, so `head` is there — but the
    // compiler cannot see that through a destructure, and neither can a reader
    // skimming the function.
    if (head === undefined) return [];
    const isCurrent = head === currentPath;
    const fsFile = files[head];
    const trailing: TreeTrailingAction[] | undefined =
      !isCurrent && fsFile
        ? [{ id: 'goto', icon: IconChevronRight, active: false, title: `Open ${head}` }]
        : undefined;
    const node: TreeNodeData = {
      id: `${keyPrefix}:${head}`,
      label: isCurrent ? currentName : head.split('/').pop() || head,
      title: head,
      icon: IconList,
      initiallyExpanded: true,
      payload: fsFile ? { file: fsFile } : undefined,
      trailing,
      children: chainToTree(rest, files, currentPath, currentName, keyPrefix),
    };
    return [node];
  }

  const chainNodes = (p: ViewsChainPayload): TreeNodeData[] =>
    p.chainViews.map(entry => ({
      id: `chain-view:${entry.view.key}`,
      label: entry.view.name,
      title: `${entry.view.name} (${entry.view.type.toUpperCase()})${entry.view.templateName ? ` → ${entry.view.templateName}` : ''}`,
      icon: iconForView(entry.view),
      initiallyExpanded: true,
      payload: { file: entry.view.file, line: entry.view.line, viewKey: entry.view.key },
      trailingAlwaysVisible: true,
      trailing: viewActions(entry.view, p.liveViewKey),
      children: chainToTree(
        entry.templateChain,
        p.templateFiles,
        p.currentTemplatePath,
        p.currentFileName,
        `chain-view:${entry.view.key}`,
      ),
    }));

  const selectedLeafId = $derived.by<string | null>(() => {
    if (!payload || payload.mode !== 'chain' || payload.chainViews.length === 0) return null;
    const v = payload.chainViews[0];
    if (!v) return null;
    let prefix = `chain-view:${v.view.key}`;
    for (const p of v.templateChain) prefix = `${prefix}:${p}`;
    return prefix;
  });

  const nodes = $derived.by<TreeNodeData[]>(() => {
    if (!payload || payload.mode !== 'chain') return [];
    return chainNodes(payload);
  });

  // The open template's display name, when the payload carried one.
  //
  // The wire type says `currentFileName` is always a string, and that is an
  // annotation on an untyped postMessage, not a check on one — the same reason
  // the diagram panel stopped reading `.type` off whatever arrives. It matters
  // here because `mode: 'chain'` now also carries the "a template is open and
  // NOTHING renders it" state, which is reached with an empty `chainViews` and
  // no view data; a producer trimming the payload for that case turns every
  // interpolation below into the literal word "undefined" on screen, which
  // reads to a user like a crash.
  const openTemplateName = $derived.by<string | null>(() => {
    if (!payload || payload.mode !== 'chain') return null;
    const name: unknown = payload.currentFileName;
    return typeof name === 'string' && name.trim() ? name : null;
  });

  const description = $derived.by(() => {
    if (!payload || payload.mode === 'no-template') {
      return 'Template-centric section. Open a Django template (.html under templates/) to see which views render it — directly or through {% extends %} / {% include %} chains.';
    }
    const subject = openTemplateName
      ? `the active template ${openTemplateName}`
      : 'the active template';
    return `Views that render ${subject} — directly or through {% extends %} / {% include %} chains. Per-view actions stay attached: ✓ validate against this file, › jump to source, ⚡ toggle Live Mode.`;
  });

  const countLabel = $derived.by<string | undefined>(() => {
    if (!payload || payload.mode !== 'chain') return undefined;
    return payload.chainViews.length > 0 ? String(payload.chainViews.length) : undefined;
  });

  function onSelect(node: TreeNodeData): void {
    const p = node.payload as { file?: string; line?: number } | undefined;
    if (p?.file) postMessage({ type: 'openFile', file: p.file, line: p.line });
  }

  function onTrailingAction(node: TreeNodeData, actionId: string): void {
    const p = node.payload as { file?: string; line?: number; viewKey?: string } | undefined;
    // Template nodes in the chain carry only { file } — they handle goto
    // and nothing else. View nodes additionally have viewKey (qualified
    // '<app>.<name>' index key) for the validate / live commands.
    if (actionId === 'goto' && p?.file) {
      postMessage({ type: 'openFile', file: p.file, line: p.line });
      return;
    }
    if (!p?.viewKey) return;
    if (actionId === 'live') {
      postMessage({ type: 'toggleLiveForView', viewKey: p.viewKey });
    } else if (actionId === 'validate') {
      postMessage({ type: 'validateForView', viewKey: p.viewKey });
    }
  }
</script>

<SidebarSection title="Views" {description} {countLabel}>
  {#if payload === null}
    <LoadingSkeleton rows={6} />
  {:else if payload.mode === 'no-template'}
    <EmptyState
      title="Open a template"
      hint="This panel lists the views that render the template you're editing. Switch to a .html file under any templates/ folder to populate it."
      density="compact"
    >
      {#snippet icon()}
        <IconFolderOpen size={32} />
      {/snippet}
    </EmptyState>
  {:else if payload.chainViews.length === 0}
    <EmptyState
      title="No view renders this template"
      hint={`${openTemplateName ?? 'This template'} isn't reachable from any view through render(), {% extends %}, or {% include %}. It may be a layout fragment or dead code — check the ORPHANS section.`}
      density="compact"
    >
      {#snippet icon()}
        <IconSearch size={32} />
      {/snippet}
    </EmptyState>
  {:else}
    <TreeView {nodes} selectedId={selectedLeafId} {onSelect} {onTrailingAction} />
  {/if}
</SidebarSection>
