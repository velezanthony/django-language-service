/**
 * Diff two field lists into BEFORE/AFTER rows.
 *
 * The compare-mode builder derives status from precomputed diff sets, because
 * it compares a snapshot against the LIVE models. Step mode compares two
 * snapshots, where no such set exists — the status falls straight out of the
 * two lists, which is also less to keep in sync.
 */

import { DiffStatus, type DiffFieldRow } from '$lib/types/diff-tooltip-data';
import { changedAttrKeys, stripDisplayOnly } from '../../../domain/parsers/_shared/field-attrs';

export interface SimpleField {
  readonly name: string;
  readonly type: string;
  /** Canonical kwarg tokens from the domain's shared reader. */
  readonly attrs?: readonly string[];
}

const cellOf = (f: SimpleField): { name: string; type: string; attrs?: readonly string[] } =>
  f.attrs?.length ? { name: f.name, type: f.type, attrs: f.attrs } : { name: f.name, type: f.type };

export function buildDiffRows(
  before: readonly SimpleField[],
  after: readonly SimpleField[],
): DiffFieldRow[] {
  const beforeByName = new Map(before.map(f => [f.name, f]));
  const rows: DiffFieldRow[] = [];

  // AFTER order first: that is the state being looked at.
  for (const f of after) {
    const prev = beforeByName.get(f.name);
    if (!prev) {
      rows.push({ before: null, after: cellOf(f), status: DiffStatus.ADDED });
      continue;
    }
    // A field can change without its type changing — an AlterField that only
    // moves max_digits/decimal_places used to read as UNCHANGED here.
    const changed = changedAttrKeys(
      stripDisplayOnly(prev.attrs ?? []),
      stripDisplayOnly(f.attrs ?? []),
    );
    const altered = prev.type !== f.type || changed.size > 0;
    rows.push({
      before: cellOf(prev),
      after: cellOf(f),
      status: altered ? DiffStatus.ALTERED : DiffStatus.UNCHANGED,
      ...(changed.size > 0 ? { changedAttrs: [...changed] } : {}),
    });
  }

  // Then whatever only existed before, so a deletion cannot go unnoticed.
  const afterNames = new Set(after.map(f => f.name));
  for (const f of before) {
    if (afterNames.has(f.name)) continue;
    rows.push({ before: cellOf(f), after: null, status: DiffStatus.REMOVED });
  }

  return rows;
}
