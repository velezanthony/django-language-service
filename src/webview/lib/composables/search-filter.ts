import { parseSearchQuery, computeVisibleModels, type SearchParsed } from '$lib/helpers/search';
import { setManyBoxFlags, type BoxFlags } from '$lib/state/box-flags.svelte';
import { toolbar } from '$lib/state/toolbar.svelte';
import type { BoxRecord } from '$lib/types/box-data';

export interface SearchFilterContext {
  modelKeys: string[];
  dataMap: Record<string, BoxRecord>;
  /** Called after a filter pass so the relations layer can cull and redraw. */
  onApply: (visibleModels: Set<string> | null) => void;
  /** Called after a filter pass to recompute app zones. */
  onRedrawAppZones: () => void;
  /** Frame the surviving models. Filtering hides most of the canvas without
   *  shrinking it, so without this you are left looking at the empty region
   *  where the hidden models still sit. */
  onFrameVisible: (keys: Set<string>) => void;
}

export interface SearchFilterApi {
  /** Update the search bar query (debounced apply). */
  setSearchQuery: (raw: string) => void;
  /** Update the app dropdown filter. */
  setAppFilter: (label: string) => void;
  /** Hide one model (right-click → 🚫 Hide this model). */
  hideKey: (key: string) => void;
  /** Hide every model under an app label (right-click → 🚫 Hide all from "X"). */
  hideApp: (appLabel: string) => void;
  /** Unhide every model that was hidden. */
  showAll: () => void;
  /** Current snapshot of hidden keys — used by the context menu builder. */
  getHiddenKeys: () => Set<string>;
  /** Force a filter pass (e.g. after a layout reset). */
  apply: () => void;
}

const SEARCH_DEBOUNCE_MS = 200;

/**
 * Typed on the argument TUPLE rather than on `any[]`, so the returned function
 * keeps the exact signature it was given and a wrong call site is still an
 * error. `any[]` would have accepted anything at both ends.
 */
const debounce = <A extends unknown[]>(fn: (...a: A) => void, ms: number): ((...a: A) => void) => {
  let t: ReturnType<typeof setTimeout> | null = null;
  return (...args: A) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      t = null;
      fn(...args);
    }, ms);
  };
};

export const installSearchFilter = (ctx: SearchFilterContext): SearchFilterApi => {
  let searchParsed: SearchParsed = { scope: 'model', query: '' };
  let appFilter = '';
  const hiddenKeys = new Set<string>();

  const updateHiddenCount = (): void => {
    toolbar.hiddenCount = hiddenKeys.size;
  };

  const apply = (): void => {
    const visibleModels = computeVisibleModels({
      modelKeys: ctx.modelKeys,
      dataByKey: ctx.dataMap,
      hiddenKeys,
      appFilter,
      search: searchParsed,
    });

    const updates: Record<string, BoxFlags> = {};
    for (const k of ctx.modelKeys) updates[k] = { hidden: !visibleModels.has(k) };
    setManyBoxFlags(updates);

    ctx.onRedrawAppZones();
    const subset = visibleModels.size < ctx.modelKeys.length ? visibleModels : null;
    ctx.onApply(subset);

    // Frame the survivors when a filter is actively narrowing the set (avoid
    // snapping on every keystroke when the filter is empty).
    const hasFilter = !!searchParsed.query || !!appFilter;
    if (hasFilter && visibleModels.size > 0 && visibleModels.size < ctx.modelKeys.length) {
      ctx.onFrameVisible(visibleModels);
    }
  };

  const debouncedApply = debounce(apply, SEARCH_DEBOUNCE_MS);

  return {
    setSearchQuery: raw => {
      searchParsed = parseSearchQuery(raw);
      debouncedApply();
    },
    setAppFilter: label => {
      appFilter = label;
      apply();
    },
    hideKey: key => {
      hiddenKeys.add(key);
      updateHiddenCount();
      apply();
    },
    // Membership is decided on the DATA, exactly as the app dropdown decides it
    // in computeVisibleModels (`d.appLabel !== appFilter`). It used to be
    // decided by building `.model-box[data-app="${label}"]` and asking the DOM,
    // which made an app label — a workspace DIRECTORY NAME, so any byte the
    // filesystem allows — part of a CSS selector. A label with a double quote
    // threw SyntaxError out of the context-menu handler; a backslash or a
    // newline matched nothing at all and hid silently nothing. Escaping the
    // interpolation would have fixed the crash, but the DOM has no say in this
    // question anyway: a box scrolled out of the tree is still that app's.
    hideApp: label => {
      for (const key of ctx.modelKeys) {
        if (ctx.dataMap[key]?.appLabel === label) hiddenKeys.add(key);
      }
      updateHiddenCount();
      apply();
    },
    showAll: () => {
      hiddenKeys.clear();
      updateHiddenCount();
      apply();
    },
    getHiddenKeys: () => hiddenKeys,
    apply,
  };
};
