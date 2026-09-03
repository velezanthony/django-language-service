<script lang="ts">
  import TreeNode from './TreeNode.svelte';
  import type { TreeNodeData } from '../lib/tree';

  type Props = {
    nodes: TreeNodeData[];
    /** Fires when a LEAF node (no children) is clicked. Branch clicks toggle
     *  expand state internally and don't fire this. */
    onSelect?: (node: TreeNodeData) => void;
    /** Fires when any of a node's inline trailing-action buttons is clicked.
     *  The action's stable `id` (defined in TreeTrailingAction) is forwarded
     *  so callers don't depend on array order. */
    onTrailingAction?: (node: TreeNodeData, actionId: string) => void;
    /** Optional id of the currently-selected node — used for highlight. */
    selectedId?: string | null;
  };

  let { nodes, onSelect, onTrailingAction, selectedId }: Props = $props();

  // Per-node expanded state = what the DATA asks for, overridden by what the
  // USER has done by hand.
  //
  // It used to be `$state(seed(nodes))`, which read `nodes` exactly once. That
  // silently broke every section that recomputes `initiallyExpanded` from live
  // data — ModelsSection sets it from whether a search query is present,
  // LayoutsSection from whether the filtered list came back empty — so typing a
  // search left its matching groups shut.
  //
  // Re-seeding on every `nodes` change is not the answer either: the sidebar
  // gets a fresh payload on every project rescan, so that would reset the tree
  // under the user's cursor whenever they saved a file. Hence two explicit
  // override sets that survive re-seeding.
  const seed = (list: TreeNodeData[]): Set<string> => {
    const out = new Set<string>();
    const walk = (ns: TreeNodeData[]): void => {
      for (const n of ns) {
        if (n.initiallyExpanded) out.add(n.id);
        if (n.children) walk(n.children);
      }
    };
    walk(list);
    return out;
  };

  /** Nodes the user opened by hand, whatever the data says. */
  let userExpanded = $state(new Set<string>());
  /** Nodes the user closed by hand, whatever the data says. */
  let userCollapsed = $state(new Set<string>());

  const expanded = $derived.by(() => {
    const out = seed(nodes);
    for (const id of userExpanded) out.add(id);
    for (const id of userCollapsed) out.delete(id);
    return out;
  });

  function toggle(id: string): void {
    // New Sets rather than mutation so the $derived above re-runs.
    const nextExpanded = new Set(userExpanded);
    const nextCollapsed = new Set(userCollapsed);
    if (expanded.has(id)) {
      nextExpanded.delete(id);
      nextCollapsed.add(id);
    } else {
      nextCollapsed.delete(id);
      nextExpanded.add(id);
    }
    userExpanded = nextExpanded;
    userCollapsed = nextCollapsed;
  }

  function clickNode(node: TreeNodeData): void {
    if (node.children && node.children.length > 0) {
      toggle(node.id);
    } else {
      onSelect?.(node);
    }
  }
</script>

<!--
  Recursive snippet: TreeView walks its node array and uses the same snippet
  for any nested children. Each TreeNode receives its own depth so indents
  stack cleanly.
-->
{#snippet renderNode(node: TreeNodeData, depth: number)}
  {@const hasChildren = !!(node.children && node.children.length)}
  <TreeNode
    label={node.label}
    icon={node.icon}
    subtitle={node.subtitle}
    meta={node.meta}
    {depth}
    {hasChildren}
    expanded={expanded.has(node.id)}
    selected={selectedId === node.id}
    badge={node.badge}
    title={node.title}
    trailing={node.trailing}
    trailingAlwaysVisible={node.trailingAlwaysVisible}
    onClick={() => clickNode(node)}
    onTrailingClick={id => onTrailingAction?.(node, id)}
  >
    {#if hasChildren}
      {#each node.children as child (child.id)}
        {@render renderNode(child, depth + 1)}
      {/each}
    {/if}
  </TreeNode>
{/snippet}

<div role="tree" aria-label="Section contents" class="flex flex-col">
  {#each nodes as node (node.id)}
    {@render renderNode(node, 0)}
  {/each}
</div>
