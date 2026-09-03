import { computeLayout } from '../../../domain/diagram/diagram-layout';
import { positionsState, type Point } from '$lib/state/positions.svelte';

export interface LayoutRelation {
  from: string;
  to: string;
  type: string;
}

export interface LayoutTooltipDatum {
  key: string;
  appLabel?: string;
}

export interface LayoutContext {
  modelKeys: string[];
  relations: LayoutRelation[];
  tooltipData: LayoutTooltipDatum[];
  /** Read at relayout time, not captured once. Detail mode makes every box
   *  several times taller, and a layout spaced for the collapsed size overlaps
   *  badly — so "Auto-arrange" has to measure what is on screen NOW. */
  getBoxSize: () => { w: number; h: number };
}

export interface LayoutApi {
  /** True if `saved` was usable and applied; false if a fresh layout was computed. */
  restoreOrCompute: (saved: { positions?: Record<string, Point> } | null) => boolean;
  /** Force-recompute layout regardless of saved state (toolbar's 🔄 Auto-arrange). */
  relayout: () => void;
  /** Replace positions wholesale from a loaded layout JSON payload. */
  setFromPayload: (positions: Record<string, Point>) => void;
}

export const installLayout = (ctx: LayoutContext): LayoutApi => {
  const computeFresh = (): Record<string, Point> => {
    const appByModel = new Map<string, string>();
    ctx.tooltipData.forEach(d => {
      appByModel.set(d.key, d.appLabel || '_none');
    });
    const { w, h } = ctx.getBoxSize();
    return computeLayout({
      names: ctx.modelKeys,
      relations: ctx.relations,
      appByModel,
      boxW: w,
      boxH: h,
    });
  };

  return {
    restoreOrCompute: (saved): boolean => {
      const savedValid =
        !!saved &&
        !!saved.positions &&
        Object.keys(saved.positions).length === ctx.modelKeys.length &&
        ctx.modelKeys.every(k => saved.positions![k]);
      positionsState.byKey = savedValid ? saved!.positions! : computeFresh();
      return savedValid;
    },
    relayout: (): void => {
      positionsState.byKey = computeFresh();
    },
    setFromPayload: (positions): void => {
      positionsState.byKey = positions;
    },
  };
};
