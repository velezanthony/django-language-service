import type { TooltipData } from './tooltip-data';

export interface BoxRecord extends TooltipData {
  key: string;
  hubTier: number;
  isOrphan: boolean;
  isAbstract: boolean;
  isProxy: boolean;
  isInCycle: boolean;
  /** Count of GenericForeignKey fields (DGM-022). */
  genericFkCount: number;
  /** Precomputed lowercase search blobs (emitted by panel.ts via serializer). The
   *  search filter matches the user query against one of these depending on
   *  the active scope (model: / field: / rel:). */
  searchModel: string;
  searchFields: string;
  searchRelations: string;
}
