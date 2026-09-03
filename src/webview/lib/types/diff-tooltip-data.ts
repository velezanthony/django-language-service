/**
 * Per-field comparison outcome — drives the diff tooltip's cell tints and
 * the ModelBox per-row badges. Dot-access (`DiffStatus.ADDED`) + iteration
 * (`DIFF_STATUSES`) + tight literal-union type, all from one declaration.
 */
export const DiffStatus = {
  ADDED: 'added',
  ALTERED: 'altered',
  REMOVED: 'removed',
  UNCHANGED: 'unchanged',
} as const;

export type DiffStatus = (typeof DiffStatus)[keyof typeof DiffStatus];

export const DIFF_STATUSES = Object.values(DiffStatus);

/** One side of a comparison row. `attrs` are canonical kwarg tokens, e.g.
 *  ["max_digits=10", "decimal_places=2"]. */
export interface DiffFieldCell {
  name: string;
  type: string;
  attrs?: readonly string[];
}

export interface DiffFieldRow {
  // Before cell (snapshot). null = field didn't exist at the snapshot point.
  before: DiffFieldCell | null;
  // After cell (current). null = field has since been removed.
  after: DiffFieldCell | null;
  status: DiffStatus;
  /** Kwarg keys that differ between the two sides — the cells tint just these,
   *  so an AlterField that only moved decimal_places is readable at a glance. */
  changedAttrs?: readonly string[];
}

export interface DiffTooltipData {
  // Fully-qualified model key (app.Name) — used as the tooltip header.
  key: string;
  // Migration we're comparing against, e.g. "blog.0042_add_tags".
  migrationLabel: string;
  // Just the migration name for the BEFORE column header (without app prefix).
  migrationName: string;
  // AFTER column header. Compare mode looks at the live models; step mode looks
  // at the state right after the migration, so the two cannot share a label.
  afterLabel?: string;
  rows: DiffFieldRow[];
  pinned: boolean;
  // Summary counts shown at the top of the body as compact chips.
  // 0 = don't render the chip for that status.
  addedCount: number;
  alteredCount: number;
  removedCount: number;
}

// Defensive-path payload — rendered when migrationComparisons[idx] is missing.
// Surfaced via DiffTooltipData.error: setting this skips the grid and shows
// just the error message in the body.
export interface DiffTooltipError {
  key: string;
  message: string;
}
