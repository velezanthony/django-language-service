import type { RenderedRelation } from '$lib/types/relations';

/** `$state.raw`: replaced wholesale on every redraw, never mutated per element,
 *  so the deep proxy is cost with no benefit at 500+ relations. */
class RelationsState {
  rendered = $state.raw<RenderedRelation[]>([]);
}

export const relationsState = new RelationsState();
