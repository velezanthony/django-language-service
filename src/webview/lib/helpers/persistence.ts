import type { Point } from '$lib/state/positions.svelte';

export interface PersistedState {
  version: number;
  positions: Record<string, Point>;
  compareIdx?: number;
  zoom: number;
  scrollLeft: number;
  scrollTop: number;
}

interface VsCodeApi {
  setState: (state: unknown) => void;
  getState: () => unknown;
}

let vscode: VsCodeApi | null = null;

export const setPersistenceApi = (api: VsCodeApi): void => {
  vscode = api;
};

export const saveState = (state: PersistedState): void => {
  if (!vscode) return;
  vscode.setState(state);
};

export const loadState = (): PersistedState | null => {
  if (!vscode) return null;
  const raw = vscode.getState();
  return (raw ?? null) as PersistedState | null;
};

// Debounced save to coalesce scroll/zoom bursts into one setState call.
let viewportTimer: ReturnType<typeof setTimeout> | undefined;
export const saveStateSoon = (state: () => PersistedState, ms = 300): void => {
  if (viewportTimer) clearTimeout(viewportTimer);
  viewportTimer = setTimeout(() => saveState(state()), ms);
};
