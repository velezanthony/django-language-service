import { mount, unmount } from 'svelte';
import { DiffTooltip } from '$organisms';
import { buildDiffRows } from '$lib/helpers/diff-rows';
import { changedAttrKeys, stripDisplayOnly } from '../../../domain/parsers/_shared/field-attrs';
import {
  DiffStatus,
  type DiffTooltipData,
  type DiffTooltipError,
  type DiffFieldRow,
} from '$lib/types/diff-tooltip-data';

type MountHandle = ReturnType<typeof mount>;

let currentHandle: MountHandle | null = null;

interface MigrationComparisonEntry {
  migrationIdx: number;
  migrationName: string;
  appLabel: string;
  comparison: unknown;
}

interface SnapshotModelField {
  name: string;
  fieldType: string;
  /** Canonical kwarg tokens — see domain/parsers/_shared/field-attrs. */
  attrs?: readonly string[];
}

interface SnapshotModel {
  name: string;
  appLabel?: string;
  fields: SnapshotModelField[];
}

interface SnapshotEntry {
  models: SnapshotModel[];
}

interface ModelFieldDiff {
  key: string;
  added: string[];
  removed: string[];
  altered: string[];
}

interface CurrentField {
  name: string;
  type: string;
  /** Wire copy of BoxRecord's field attrs, as canonical tokens. */
  attrs?: readonly string[];
}

interface CurrentModelRecord {
  key: string;
  fields: CurrentField[];
}

export interface StepDiffInputs {
  d: CurrentModelRecord;
  pinned: boolean;
  /** Index into `snapshots` for the selected migration. */
  stepIdx: number;
  /** Label of the selected migration, e.g. "billing.0002_billing_evolution". */
  stepLabel: string;
  /** Label of the one before it, for the BEFORE column. */
  previousLabel?: string;
  snapshots: SnapshotEntry[];
}

export interface DiffMountInputs {
  d: CurrentModelRecord;
  pinned: boolean;
  compareIdx: number;
  migrationComparisons: MigrationComparisonEntry[];
  snapshots: SnapshotEntry[];
  activeChangedByKey: Map<string, ModelFieldDiff>;
}

const findSnapshotModel = (
  snapshots: SnapshotEntry[],
  idx: number,
  modelKey: string,
): SnapshotModel | null => {
  const snap = snapshots[idx];
  if (!snap) return null;
  for (const m of snap.models) {
    const key = m.appLabel ? `${m.appLabel}.${m.name}` : m.name;
    if (key === modelKey) return m;
  }
  return null;
};

/**
 * Step mode: the state right BEFORE this migration against the state right
 * AFTER it. Compare mode answers a different question — "this migration vs the
 * live models" — so it keeps its own builder rather than sharing one with a
 * flag deciding which snapshot to read.
 *
 * snapshots[i] is the schema once migration i has been applied, so the previous
 * state is snapshots[i-1]; for the first migration there is nothing before it
 * and every field reads as added.
 */
export const buildStepDiffPayload = (
  inputs: StepDiffInputs,
): DiffTooltipData | DiffTooltipError => {
  const { d, pinned, stepIdx, stepLabel, previousLabel, snapshots } = inputs;

  const after = findSnapshotModel(snapshots, stepIdx, d.key);
  if (!after) {
    return {
      key: d.key,
      pinned,
      message: `No snapshot for ${d.key} at migration ${stepLabel}.`,
    };
  }
  const before = stepIdx > 0 ? findSnapshotModel(snapshots, stepIdx - 1, d.key) : null;

  const toSimple = (f: {
    name: string;
    fieldType: string;
    attrs?: readonly string[];
  }): {
    name: string;
    type: string;
    attrs?: readonly string[];
  } =>
    f.attrs?.length
      ? { name: f.name, type: f.fieldType, attrs: f.attrs }
      : { name: f.name, type: f.fieldType };

  const rows = buildDiffRows((before?.fields ?? []).map(toSimple), after.fields.map(toSimple));

  const count = (s: DiffStatus): number => rows.filter(r => r.status === s).length;
  return {
    key: d.key,
    migrationLabel: stepLabel,
    // The first migration has nothing before it — saying "BEFORE · before"
    // reads like a placeholder that got shipped.
    migrationName: previousLabel ?? 'nothing yet',
    afterLabel: stepLabel,
    rows,
    pinned,
    addedCount: count(DiffStatus.ADDED),
    alteredCount: count(DiffStatus.ALTERED),
    removedCount: count(DiffStatus.REMOVED),
  };
};

const buildPayload = (inputs: DiffMountInputs): DiffTooltipData | DiffTooltipError => {
  const { d, pinned, compareIdx, migrationComparisons, snapshots, activeChangedByKey } = inputs;
  const entry = migrationComparisons[compareIdx];
  if (!entry) {
    console.warn('[mount-diff-tooltip] no comparison entry at index', compareIdx);
    return {
      key: d.key,
      message: `Migration comparison data is missing for index ${compareIdx}.`,
    };
  }

  const snapshotModel = findSnapshotModel(snapshots, compareIdx, d.key);
  // Model absent from the snapshot → added in current; mark every field added.
  const isFullyAdded = !snapshotModel;
  if (isFullyAdded) {
    console.warn('[mount-diff-tooltip] snapshot has no model for key', d.key, 'at', compareIdx);
  }

  const baseDiff: ModelFieldDiff = activeChangedByKey.get(d.key) ?? {
    key: d.key,
    added: [],
    altered: [],
    removed: [],
  };
  const diff: ModelFieldDiff = isFullyAdded
    ? { key: d.key, added: d.fields.map(f => f.name), altered: [], removed: [] }
    : baseDiff;
  const addedSet = new Set(diff.added);
  const alteredSet = new Set(diff.altered);

  const snapshotFieldByName: Record<string, SnapshotModelField> = {};
  if (snapshotModel) {
    for (const f of snapshotModel.fields) snapshotFieldByName[f.name] = f;
  }
  const currentFieldNames = new Set<string>(d.fields.map(f => f.name));

  const rows: DiffFieldRow[] = [];

  for (const f of d.fields) {
    let status: DiffFieldRow['status'] = DiffStatus.UNCHANGED;
    if (addedSet.has(f.name)) status = DiffStatus.ADDED;
    else if (alteredSet.has(f.name)) status = DiffStatus.ALTERED;

    const snapField = snapshotFieldByName[f.name];
    const before = snapField
      ? {
          name: snapField.name,
          type: snapField.fieldType,
          ...(snapField.attrs?.length ? { attrs: snapField.attrs } : {}),
        }
      : null;
    const after = { name: f.name, type: f.type, ...(f.attrs?.length ? { attrs: f.attrs } : {}) };
    const changed = changedAttrKeys(
      stripDisplayOnly(before?.attrs ?? []),
      stripDisplayOnly(after.attrs ?? []),
    );
    rows.push({
      before,
      after,
      status,
      ...(changed.size > 0 ? { changedAttrs: [...changed] } : {}),
    });
  }

  if (snapshotModel) {
    for (const f of snapshotModel.fields) {
      if (currentFieldNames.has(f.name)) continue;
      rows.push({
        before: { name: f.name, type: f.fieldType, ...(f.attrs?.length ? { attrs: f.attrs } : {}) },
        after: null,
        status: DiffStatus.REMOVED,
      });
    }
  }

  const migrationLabel = entry.appLabel
    ? `${entry.appLabel}.${entry.migrationName}`
    : entry.migrationName;

  return {
    key: d.key,
    migrationLabel,
    migrationName: entry.migrationName,
    rows,
    pinned,
    addedCount: diff.added.length,
    alteredCount: diff.altered.length,
    removedCount: diff.removed.length,
  };
};

export const mountStepDiffTooltip = (target: HTMLElement, inputs: StepDiffInputs): void => {
  unmountDiffTooltip();
  target.textContent = '';
  currentHandle = mount(DiffTooltip, { target, props: { data: buildStepDiffPayload(inputs) } });
};

export const mountDiffTooltip = (target: HTMLElement, inputs: DiffMountInputs): void => {
  unmountDiffTooltip();
  const payload = buildPayload(inputs);
  target.textContent = '';
  currentHandle = mount(DiffTooltip, { target, props: { data: payload } });
};

export const unmountDiffTooltip = (): void => {
  if (!currentHandle) return;
  try {
    unmount(currentHandle);
  } catch (err) {
    console.error('[mount-diff-tooltip] unmount failed', err);
  }
  currentHandle = null;
};
