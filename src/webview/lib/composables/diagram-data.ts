import type { BoxRecord } from '$lib/types/box-data';
import type { SchemaComparison } from '$lib/helpers/compare';
import type { TimelineStepDiff } from '$lib/helpers/timeline';

// The payload panel.ts injects via `window.__DIAGRAM_DATA__`. Types
// here are end-to-end — every composable downstream consumes these directly,
// no `as any` casts at composable boundaries.
// NOTE: `onDelete` is typed as `string` (not the domain's OnDeleteAction enum) so
// the webview bundle stays decoupled from the extension-host domain layer.

export interface DiagramRelationLine {
  from: string;
  to: string;
  fieldName: string;
  type: 'FK' | 'M2M' | 'O2O';
  onDelete?: string;
}

export interface DiagramTimelineStep {
  key: string; // "app.name" — node id in the history graph
  name: string;
  appLabel?: string;
  isInitial?: boolean;
  dependencies?: string[]; // parent node keys (several = a merge)
  opSummary: string[];
  diff: TimelineStepDiff;
}

/** One snapshot from the migration schema replayer — used by DiffTooltip's BEFORE column. */
export interface DiagramSnapshotModel {
  name: string;
  appLabel?: string;
  fields: { name: string; fieldType: string; attrs?: readonly string[] }[];
}
export interface DiagramSnapshot {
  models: DiagramSnapshotModel[];
}

export interface DiagramMigrationComparisonEntry {
  migrationIdx: number;
  migrationName: string;
  appLabel: string;
  comparison: SchemaComparison;
}

export interface DiagramDataPayload {
  tooltipData: BoxRecord[];
  relations: DiagramRelationLine[];
  modelKeys: string[];
  appLabels: string[];
  mermaidSrc: string;
  dbmlSrc: string;
  plantUmlSrc: string;
  timelineSteps: DiagramTimelineStep[];
  snapshots: DiagramSnapshot[];
  migrationComparisons: DiagramMigrationComparisonEntry[];
}

declare global {
  interface Window {
    __DIAGRAM_DATA__?: DiagramDataPayload;
  }
}

const EMPTY: DiagramDataPayload = {
  tooltipData: [],
  relations: [],
  modelKeys: [],
  appLabels: [],
  mermaidSrc: '',
  dbmlSrc: '',
  plantUmlSrc: '',
  timelineSteps: [],
  snapshots: [],
  migrationComparisons: [],
};

// Returns the payload $adapters/diagram/panel.ts injected, or an empty skeleton if the
// global is missing (defensive — should never happen in practice since the
// inline data script is emitted right above the bundle <script>).
export const loadDiagramData = (): DiagramDataPayload => {
  return window.__DIAGRAM_DATA__ ?? EMPTY;
};
