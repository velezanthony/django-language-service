export interface ModelFieldDiff {
  key: string;
  added: string[];
  removed: string[];
  altered: string[];
}

export interface SchemaComparison {
  addedModels: string[];
  removedModels: string[];
  changedModels: ModelFieldDiff[];
  unchangedModels: string[];
}

export interface CompareStatsCounts {
  added: number;
  removed: number;
  changed: number;
  unchanged: number;
}

export const buildChangedByKey = (comparison: SchemaComparison): Map<string, ModelFieldDiff> => {
  const out = new Map<string, ModelFieldDiff>();
  for (const c of comparison.changedModels) out.set(c.key, c);
  return out;
};

export const countComparisonStats = (cmp: SchemaComparison): CompareStatsCounts => ({
  added: cmp.addedModels.length,
  removed: cmp.removedModels.length,
  changed: cmp.changedModels.length,
  unchanged: cmp.unchangedModels.length,
});

export const formatCompareStats = (counts: CompareStatsCounts): string => {
  const parts: string[] = [];
  if (counts.added) parts.push(`+${counts.added} model${counts.added === 1 ? '' : 's'}`);
  if (counts.removed) parts.push(`−${counts.removed} removed`);
  if (counts.changed) parts.push(`~${counts.changed} changed`);
  if (counts.unchanged) parts.push(`${counts.unchanged} unchanged`);
  return parts.join(' · ');
};

export const setCompareBodyMode = (on: boolean): void => {
  if (on) document.body.classList.add('compare-mode');
  else document.body.classList.remove('compare-mode');
};

/**
 * Decide whether a saved compareIdx is still valid against the current
 * migration comparison list. Returns the index to restore, or null if the
 * saved state is stale / absent / invalid.
 *
 * Pure function — ported from OLD core/view-context/compare-state.ts.
 */
export function shouldRestoreCompareIdx(
  savedCompareIdx: unknown,
  migrationCount: number,
): number | null {
  if (typeof savedCompareIdx !== 'number') return null;
  if (!Number.isInteger(savedCompareIdx)) return null;
  if (savedCompareIdx < 0) return null;
  if (savedCompareIdx >= migrationCount) return null;
  return savedCompareIdx;
}
