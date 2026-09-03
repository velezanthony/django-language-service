import type { Component } from 'svelte';

export type TreeIcon = Component<{ size?: number; class?: string; title?: string }>;

export interface TreeTrailingAction {
  id: string;
  icon: TreeIcon;
  active: boolean;
  title: string;
}

export interface TreeNodeData {
  id: string;
  label: string;
  icon?: TreeIcon;
  subtitle?: string;
  meta?: string;
  badge?: string;
  trailing?: TreeTrailingAction[];
  /** Keep inactive trailing buttons at full opacity (default fades on hover). */
  trailingAlwaysVisible?: boolean;
  children?: TreeNodeData[];
  initiallyExpanded?: boolean;
  payload?: unknown;
  title?: string;
}
