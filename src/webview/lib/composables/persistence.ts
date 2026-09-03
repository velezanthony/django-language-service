import {
  saveState,
  saveStateSoon,
  setPersistenceApi,
  type PersistedState,
} from '$lib/helpers/persistence';
import { positionsState } from '$lib/state/positions.svelte';
import { toolbar } from '$lib/state/toolbar.svelte';

// Bump when the layout schema changes — invalidates saved positions so a fresh
// auto-layout runs on next boot. Lives here because the snapshot version is a
// persistence concern, not a layout one.
export const LAYOUT_VERSION = 4;

interface VsCodeApi {
  setState: (state: unknown) => void;
  getState: () => unknown;
}

export interface PersistenceContext {
  vscode: VsCodeApi;
  canvas: HTMLElement;
}

export interface PersistenceApi {
  /** Persist current snapshot synchronously (positions, compare, viewport). */
  persist: () => void;
  /** Debounced — coalesces scroll/zoom bursts into one setState call. */
  persistSoon: () => void;
  /** Read the previously-saved snapshot (or null). */
  load: () => PersistedState | null;
}

export const installPersistence = (ctx: PersistenceContext): PersistenceApi => {
  setPersistenceApi(ctx.vscode);

  const snapshot = (): PersistedState => ({
    version: LAYOUT_VERSION,
    positions: positionsState.byKey,
    // `compareIdx?: number` means the key may be ABSENT, not that it may hold
    // `undefined`. Writing the key with an undefined value round-trips through
    // JSON as a missing key anyway, so the spread says what is meant.
    ...(toolbar.compareIdx >= 0 ? { compareIdx: toolbar.compareIdx } : {}),
    zoom: toolbar.zoom,
    scrollLeft: ctx.canvas.scrollLeft,
    scrollTop: ctx.canvas.scrollTop,
  });

  return {
    persist: () => saveState(snapshot()),
    persistSoon: () => saveStateSoon(snapshot),
    load: () => {
      const raw = ctx.vscode.getState() as PersistedState | null;
      return raw ?? null;
    },
  };
};
