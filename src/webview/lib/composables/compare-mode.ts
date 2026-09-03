import {
  buildChangedByKey,
  countComparisonStats,
  formatCompareStats,
  setCompareBodyMode,
  type ModelFieldDiff,
} from '$lib/helpers/compare';
import { compareDiff } from '$lib/state/compare-diff.svelte';
import {
  boxFlagsState,
  clearFlags,
  setManyBoxFlags,
  BoxFlag,
  type BoxFlags,
} from '$lib/state/box-flags.svelte';

const COMPARE_FLAGS = [
  BoxFlag.COMPARE_ADDED,
  BoxFlag.COMPARE_CHANGED,
  BoxFlag.COMPARE_REMOVED,
  BoxFlag.COMPARE_UNCHANGED,
] as const;
import { toolbar } from '$lib/state/toolbar.svelte';
import type { DiagramMigrationComparisonEntry } from '$lib/composables/diagram-data';

export interface CompareModeContext {
  modelKeys: string[];
  migrationComparisons: DiagramMigrationComparisonEntry[];
  /** Called when entering compare while timeline is active — force-exits timeline. */
  onTimelineConflict: () => void;
  /** Called after enter/exit so the boot can persist the new compareIdx. */
  onPersist: () => void;
  /** Called on exit so the tooltip controller can drop diff-mode styling. */
  onExit: () => void;
}

export interface CompareModeApi {
  /** -1 when inactive; index into migrationComparisons otherwise. */
  getIndex: () => number;
  /** Map<modelKey, fieldDiff> for the active comparison — used by the tooltip controller. */
  getChangedByKey: () => Map<string, ModelFieldDiff>;
  enter: (idx: number) => void;
  exit: () => void;
}

export const installCompareMode = (ctx: CompareModeContext): CompareModeApi => {
  let activeIdx = -1;
  let activeChangedByKey = new Map<string, ModelFieldDiff>();

  const clearVisuals = (): void => {
    clearFlags(...COMPARE_FLAGS);
    // Clearing the diff payload removes per-box chips/badges/removed rows.
    compareDiff.byKey = {};
  };

  const exit = (): void => {
    setCompareBodyMode(false);
    clearVisuals();
    activeIdx = -1;
    activeChangedByKey = new Map();
    ctx.onExit();
    toolbar.compareIdx = -1;
    toolbar.compareStatsText = '';
    toolbar.compareStats = null;
    ctx.onPersist();
  };

  const enter = (idx: number): void => {
    const entry = ctx.migrationComparisons[idx];
    if (!entry) return;
    const cmp = entry.comparison;

    // Timeline and compare both write to .model-box class flags — running both
    // would visually fight, so force-exit timeline before classifying.
    ctx.onTimelineConflict();

    clearVisuals();
    setCompareBodyMode(true);
    activeIdx = idx;
    toolbar.compareIdx = idx;

    activeChangedByKey = buildChangedByKey(cmp);
    const changedMap = activeChangedByKey;
    const addedSet = new Set(cmp.addedModels);

    // Removed models don't exist in the current DOM — they only contribute to
    // the banner stats. Unchanged is the fallthrough state.
    const compareUpdates: Record<string, BoxFlags> = {};
    const diffsPayload: Record<string, ModelFieldDiff> = {};
    for (const key of ctx.modelKeys) {
      if (addedSet.has(key)) {
        compareUpdates[key] = { compareAdded: true };
      } else if (changedMap.has(key)) {
        compareUpdates[key] = { compareChanged: true };
        diffsPayload[key] = changedMap.get(key)!;
      } else {
        compareUpdates[key] = { compareUnchanged: true };
      }
    }
    setManyBoxFlags(compareUpdates);
    compareDiff.byKey = diffsPayload;

    const counts = countComparisonStats(cmp);
    toolbar.compareStatsText = formatCompareStats(counts);
    toolbar.compareStats = counts;
    ctx.onPersist();
  };

  return {
    getIndex: () => activeIdx,
    getChangedByKey: () => activeChangedByKey,
    enter,
    exit,
  };
};

// Re-export for boot's TDZ guards if needed.
export { boxFlagsState };
