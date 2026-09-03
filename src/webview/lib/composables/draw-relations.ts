import { computeRelationPath, relationInView, cardinalityFor } from '$lib/helpers/path-math';
import { positionsState } from '$lib/state/positions.svelte';
import { relationsState } from '$lib/state/relations.svelte';
import { toolbar } from '$lib/state/toolbar.svelte';
import type { RenderedRelation, RelationKind } from '$lib/types/relations';

export interface DrawRelationsContext {
  canvas: HTMLElement;
  modelKeys: string[];
  relations: { from: string; to: string; type: RelationKind; onDelete?: string }[];
  boxW: number;
  boxH: number;
  /** Filters from the toolbar — controls which relation types render. */
  getActiveFilters: () => Record<RelationKind, boolean>;
  /** Active model for blast-radius mode; siblings render dimmed. */
  getSelectedModel: () => string | null;
}

export interface DrawRelationsApi {
  /** Recompute paths for currently-visible models (set externally). */
  draw: (visibleModels?: Set<string> | null) => void;
  /** Schedule a draw on the next animation frame; coalesces bursts. */
  scheduleDraw: () => void;
}

// Above this model count + zoom > 1, we cull off-viewport relations to keep
// path computation linear in visible-relations instead of total.
const CULL_THRESHOLD = 80;
const CULL_MARGIN = 200;

export const installDrawRelations = (ctx: DrawRelationsContext): DrawRelationsApi => {
  let pendingFrame = 0;
  let lastVisibleModels: Set<string> | null = null;

  const compute = (visibleModels?: Set<string> | null): void => {
    if (visibleModels !== undefined) lastVisibleModels = visibleModels;
    const filters = ctx.getActiveFilters();
    const selectedModel = ctx.getSelectedModel();
    const z = toolbar.zoom;
    const shouldCull = ctx.modelKeys.length > CULL_THRESHOLD && z > 1.0;
    let viewMinX = -Infinity,
      viewMinY = -Infinity,
      viewMaxX = Infinity,
      viewMaxY = Infinity;
    if (shouldCull) {
      viewMinX = ctx.canvas.scrollLeft / z - CULL_MARGIN;
      viewMinY = ctx.canvas.scrollTop / z - CULL_MARGIN;
      viewMaxX = (ctx.canvas.scrollLeft + ctx.canvas.clientWidth) / z + CULL_MARGIN;
      viewMaxY = (ctx.canvas.scrollTop + ctx.canvas.clientHeight) / z + CULL_MARGIN;
    }

    const pairCount: Record<string, number> = {};
    const out: RenderedRelation[] = [];

    for (const rel of ctx.relations) {
      if (!filters[rel.type]) continue;
      if (visibleModels && (!visibleModels.has(rel.from) || !visibleModels.has(rel.to))) continue;

      const f = positionsState.byKey[rel.from];
      const t = positionsState.byKey[rel.to];
      if (!f || !t) continue;
      if (
        shouldCull &&
        !relationInView(f, t, ctx.boxW, ctx.boxH, viewMinX, viewMinY, viewMaxX, viewMaxY)
      )
        continue;

      const pairKey = [rel.from, rel.to].sort().join('-');
      const pairIndex = pairCount[pairKey] ?? 0;
      pairCount[pairKey] = pairIndex + 1;

      const p = computeRelationPath(f, t, ctx.boxW, ctx.boxH, pairIndex);
      const touchesSelected = selectedModel === rel.from || selectedModel === rel.to;
      const dimmed = !!(selectedModel && !touchesSelected);
      const focused = !!(selectedModel && touchesSelected);

      const entry: RenderedRelation = {
        id: `${rel.from}->${rel.to}#${pairIndex}`,
        type: rel.type,
        d: p.d,
        labelX: p.labelX,
        labelY: p.labelY,
        cardX: p.cardX,
        cardY: p.cardY,
        cardLabel: cardinalityFor(rel.type),
        dimmed,
        focused,
      };
      if (rel.onDelete && (rel.type === 'FK' || rel.type === 'O2O')) {
        entry.onDelete = rel.onDelete;
        entry.onDeleteX = p.cardX;
        entry.onDeleteY = p.cardY + 12;
      }
      out.push(entry);
    }

    relationsState.rendered = out;
  };

  return {
    draw: compute,
    scheduleDraw: (): void => {
      if (pendingFrame) return;
      pendingFrame = requestAnimationFrame(() => {
        pendingFrame = 0;
        compute(lastVisibleModels);
      });
    },
  };
};
