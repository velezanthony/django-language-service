import type { Component } from 'svelte';

type IconComp = Component<{ size?: number; class?: string; title?: string }>;

export interface ContextMenuItem {
  label?: string;
  onClick?: () => void;
  sep?: boolean;
  /** Optional Material icon component rendered before the label. */
  icon?: IconComp;
  /** Optional keyboard shortcut shown on the right (e.g. 'H', '⌘K'). */
  shortcut?: string;
  /** 'danger' renders the label in danger color for destructive actions. */
  tone?: 'default' | 'danger';
}

export interface ContextMenuState {
  open: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
}

export const contextMenu = $state<ContextMenuState>({
  open: false,
  x: 0,
  y: 0,
  items: [],
});

export const openContextMenu = (x: number, y: number, items: ContextMenuItem[]): void => {
  contextMenu.open = true;
  contextMenu.x = x;
  contextMenu.y = y;
  contextMenu.items = items;
};

export const closeContextMenu = (): void => {
  if (contextMenu.open) contextMenu.open = false;
};
