import type { ModelFieldDiff } from '$lib/helpers/compare';

/** Per-box field diffs, read by ModelBox via BoxesLayer. `$state.raw`: the map
 *  is replaced on enter/clear, never mutated per key. */
class CompareDiff {
  byKey = $state.raw<Record<string, ModelFieldDiff>>({});
}

export const compareDiff = new CompareDiff();
