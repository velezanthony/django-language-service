import type { BoxRecord } from '$lib/types/box-data';
import type { CompareStatsCounts } from '$lib/helpers/compare';
import { allRelationsActive, type RelationKind } from '$lib/types/relations';

export interface ToolbarMetrics {
  totalModels: number;
  fkCount: number;
  m2mCount: number;
  o2oCount: number;
  appCount: number;
  avgFields: number;
  maxFieldsModel: string;
  maxFieldsCount: number;
}

export interface MigrationEntry {
  appLabel: string;
  name: string;
}

// Unified toolbar state. Every primitive lives as a property here so consumers
// can read reactively via `toolbar.X` without manual store subscriptions.
export const toolbar = $state<{
  zoom: number;
  panToolActive: boolean;
  detailMode: boolean;
  cyclesMode: boolean;
  blastMode: boolean;
  timelineMode: boolean;
  hiddenCount: number;
  searchQuery: string;
  appFilter: string;
  compareIdx: number;
  compareStatsText: string;
  /** Structured counts for the compare banner Pills — null when not in compare mode. */
  compareStats: CompareStatsCounts | null;
  hasMigrations: boolean;
  /** True after the user clicks Refresh, until the extension swaps webview.html
   *  (the fresh boot naturally starts with false — no clearing message needed). */
  isRefreshing: boolean;
  /** Visual density: 'compact' shrinks ModelBox padding + font for denser overview, 'comfortable' uses the default sizes. */
  densityMode: 'compact' | 'comfortable';
  activeFilters: Record<RelationKind, boolean>;
  metrics: ToolbarMetrics | null;
  appLabels: string[];
  migrations: MigrationEntry[];
  /** Full list of model boxes — used by search autocomplete to suggest matches. */
  boxes: BoxRecord[];
}>({
  zoom: 1.0,
  panToolActive: false,
  detailMode: false,
  cyclesMode: false,
  blastMode: false,
  timelineMode: false,
  hiddenCount: 0,
  searchQuery: '',
  appFilter: '',
  compareIdx: -1,
  compareStatsText: '',
  compareStats: null,
  hasMigrations: false,
  isRefreshing: false,
  densityMode: 'comfortable',
  activeFilters: allRelationsActive(),
  metrics: null,
  appLabels: [],
  migrations: [],
  boxes: [],
});

export interface ToolbarActions {
  zoomIn(): void;
  zoomOut(): void;
  zoomReset(): void;
  fitToVisible(): void;
  togglePan(): void;
  refresh(): void;
  relayout(): void;
  toggleDetail(): void;
  toggleDensity(): void;
  showAllHidden(): void;
  toggleCycles(): void;
  toggleBlast(): void;
  toggleTimeline(): void;
  enterCompare(): void;
  exitCompare(): void;
  selectCompareMigration(idx: number): void;
  exportMermaid(): void;
  exportDbml(): void;
  exportPuml(): void;
  exportSvg(): void;
  saveLayout(): void;
  loadLayout(): void;
  setSearchQuery(q: string): void;
  setAppFilter(label: string): void;
  toggleRelationFilter(kind: RelationKind): void;
  /** Scroll the canvas so the given model key is centered in view. */
  navigateToModel(key: string): void;
}

const noop = (): void => {};

const noopActions: ToolbarActions = {
  zoomIn: noop,
  zoomOut: noop,
  zoomReset: noop,
  fitToVisible: noop,
  togglePan: noop,
  refresh: noop,
  relayout: noop,
  toggleDetail: noop,
  toggleDensity: noop,
  showAllHidden: noop,
  toggleCycles: noop,
  toggleBlast: noop,
  toggleTimeline: noop,
  enterCompare: noop,
  exitCompare: noop,
  selectCompareMigration: noop,
  exportMermaid: noop,
  exportDbml: noop,
  exportPuml: noop,
  exportSvg: noop,
  saveLayout: noop,
  loadLayout: noop,
  setSearchQuery: noop,
  setAppFilter: noop,
  toggleRelationFilter: noop,
  navigateToModel: noop,
};

let _actions: ToolbarActions = noopActions;

export const setActions = (a: ToolbarActions): void => {
  _actions = a;
};

export const actions = (): ToolbarActions => _actions;
