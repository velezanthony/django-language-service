/**
 * Migration timeline and compare entries for the ER diagram.
 * Replays migration operations to reconstruct schema snapshots and compute
 * per-step diffs. Pure functions — no vscode / fs / DOM dependency.
 *
 * @inventory DGM-010 (migration timeline), DGM-011 (migration compare/snapshot)
 */

import type { Migration, MigrationOperation, MigrationField } from '$domain/types/migration';
import type { Model } from '$domain/types/model';
import { stripDisplayOnly, attrTokens } from '$domain/parsers/_shared/field-attrs';

// ── Public payload types ──────────────────────────────────────────────────────

/** Diff between migration step (index - 1) and step (index). */
export interface TimelineStepDiff {
  addedModels: string[];
  removedModels: string[];
  renamedModels: { from: string; to: string }[];
  addedFields: { model: string; field: string }[];
  removedFields: { model: string; field: string }[];
  alteredFields: { model: string; field: string }[];
  renamedFields: { model: string; from: string; to: string }[];
}

/** One step in the migration timeline (a node in the history DAG). */
export interface DiagramTimelineStep {
  key: string; // "app.name" — node id used by the history graph
  name: string;
  appLabel: string;
  isInitial: boolean;
  dependencies: string[]; // parent node keys (several = a merge)
  opCount: number;
  opSummary: string[];
  diff: TimelineStepDiff;
}

/** Snapshot of a single model at a migration step. */
export interface DiagramSnapshotModel {
  name: string;
  appLabel: string;
  fieldCount: number;
  fields: { name: string; fieldType: string; attrs?: readonly string[] }[];
}

/** Full schema snapshot at a migration step. */
export interface DiagramSnapshot {
  models: DiagramSnapshotModel[];
  relations: DiagramSnapshotRelation[];
}

/** Relation entry used inside snapshots. */
export interface DiagramSnapshotRelation {
  from: string;
  to: string;
  fieldName: string;
  type: 'FK' | 'M2M' | 'O2O';
}

/** Per-model field-level diff for compare mode. */
export interface ModelFieldDiff {
  key: string;
  added: string[];
  removed: string[];
  altered: string[];
}

/** Schema comparison entry: current vs migration snapshot. */
export interface SchemaComparison {
  addedModels: string[];
  removedModels: string[];
  changedModels: ModelFieldDiff[];
  unchangedModels: string[];
}

/** One entry in the migration compare list (DGM-011). */
export interface DiagramMigrationComparisonEntry {
  migrationIdx: number;
  migrationName: string;
  appLabel: string;
  comparison: SchemaComparison;
}

// ── Internal schema state type ────────────────────────────────────────────────

/** Internal field record — richer than the domain Field: it carries relation
 *  metadata (relatedModel/onDelete) so snapshots can reconstruct FK/M2M/O2O. */
interface SchemaField {
  name: string;
  fieldType: string;
  /** Canonical kwarg tokens — what makes "AlterField" visible when the type
   *  itself did not change (DecimalField 10,2 -> 12,4). */
  attrs?: readonly string[];
  relatedModel?: string;
  onDelete?: string;
}

interface SchemaModel {
  name: string;
  appLabel: string;
  fields: SchemaField[];
}

/** Django relation field type → snapshot relation kind. */
const REL_KIND: Record<string, 'FK' | 'M2M' | 'O2O'> = {
  ForeignKey: 'FK',
  OneToOneField: 'O2O',
  ManyToManyField: 'M2M',
};

function toSchemaField(mf: MigrationField): SchemaField {
  const f: SchemaField = { name: mf.name, fieldType: mf.fieldType };
  if (mf.attrs.length > 0) f.attrs = mf.attrs;
  if (mf.relatedModel) f.relatedModel = mf.relatedModel;
  if (mf.onDelete) f.onDelete = mf.onDelete;
  return f;
}

// ── Schema replay ─────────────────────────────────────────────────────────────

/**
 * Rebuild the schema state at a given migration step by replaying all
 * operations from 0 through `upToIndex` (inclusive).
 */
export function rebuildSchemaAt(
  migrations: readonly Migration[],
  upToIndex: number,
): SchemaModel[] {
  const models = new Map<string, SchemaModel>();

  for (let i = 0; i <= Math.min(upToIndex, migrations.length - 1); i++) {
    const mig = migrations[i]!;
    for (const op of mig.operations) {
      applyOperation(models, op, mig.appLabel);
    }
  }

  return [...models.values()];
}

// The schema Map is keyed by the QUALIFIED 'appLabel.ModelName' of the
// migration executing each operation. Migration operations are app-scoped in
// Django, so the executing migration's appLabel always identifies the owner.
// A bare-name key would let two apps with a homonymous model (blog.Comment /
// shop.Comment) overwrite each other when orderMigrations interleaves their
// histories, corrupting timeline and compare views.

/**
 * The key a model of `name` is stored under, whatever its capitalisation.
 *
 * `AddField`, `AlterField` and the rest carry `model_name='blogpost'` — the
 * class name lowercased, with no separator — while `CreateModel` carries
 * `name='BlogPost'`. The capitalisation was reconstructed by upper-casing the
 * first letter, which gives `Blogpost` and matches nothing, so EVERY field
 * operation on a multi-word model was silently discarded: the replayed schema
 * lost columns the project really has, and compare mode called a fully
 * migrated project drifted.
 *
 * It cannot be reconstructed — `blogpost` is equally `BlogPost`, `Blogpost` or
 * `BLOGPost` — so it is not guessed. Django lowercases precisely because the
 * comparison is meant to be case-insensitive.
 */
function findModelKey(
  models: Map<string, SchemaModel>,
  name: string,
  appLabel: string,
): string | undefined {
  const exact = makeKey(appLabel, name);
  if (models.has(exact)) return exact;

  const wanted = name.toLowerCase();
  const prefix = makeKey(appLabel, '');
  for (const [key, model] of models) {
    if (key.startsWith(prefix) && model.name.toLowerCase() === wanted) return key;
  }
  return undefined;
}

function findModel(
  models: Map<string, SchemaModel>,
  name: string,
  appLabel: string,
): SchemaModel | undefined {
  const key = findModelKey(models, name, appLabel);
  return key === undefined ? undefined : models.get(key);
}

function deleteModel(models: Map<string, SchemaModel>, name: string, appLabel: string): void {
  const key = findModelKey(models, name, appLabel);
  if (key !== undefined) models.delete(key);
}

function applyOperation(
  models: Map<string, SchemaModel>,
  op: MigrationOperation,
  appLabel: string,
): void {
  switch (op.kind) {
    case 'CreateModel': {
      models.set(makeKey(appLabel, op.modelName), {
        name: op.modelName,
        fields: (op.fields ?? []).map(toSchemaField),
        appLabel,
      });
      break;
    }
    case 'DeleteModel': {
      deleteModel(models, op.modelName, appLabel);
      break;
    }
    case 'RenameModel': {
      const old = findModel(models, op.modelName, appLabel);
      if (old && op.newName) {
        deleteModel(models, op.modelName, appLabel);
        old.name = op.newName;
        models.set(makeKey(appLabel, op.newName), old);
      }
      break;
    }
    case 'AddField': {
      const model = findModel(models, op.modelName, appLabel);
      if (model && op.fieldName && !model.fields.some(f => f.name === op.fieldName)) {
        const mf = op.fields?.[0];
        model.fields.push({
          name: op.fieldName,
          fieldType: mf?.fieldType ?? 'Unknown',
          ...(mf?.attrs?.length ? { attrs: mf.attrs } : {}),
          ...(mf?.relatedModel ? { relatedModel: mf.relatedModel } : {}),
          ...(mf?.onDelete ? { onDelete: mf.onDelete } : {}),
        });
      }
      break;
    }
    case 'RemoveField': {
      const model = findModel(models, op.modelName, appLabel);
      if (model && op.fieldName) {
        model.fields = model.fields.filter(f => f.name !== op.fieldName);
      }
      break;
    }
    case 'AlterField': {
      const model = findModel(models, op.modelName, appLabel);
      const mf = op.fields?.[0];
      if (model && op.fieldName && mf) {
        const idx = model.fields.findIndex(f => f.name === op.fieldName);
        if (idx >= 0) {
          model.fields[idx] = {
            name: op.fieldName,
            fieldType: mf.fieldType,
            ...(mf.attrs.length > 0 ? { attrs: mf.attrs } : {}),
            ...(mf.relatedModel ? { relatedModel: mf.relatedModel } : {}),
            ...(mf.onDelete ? { onDelete: mf.onDelete } : {}),
          };
        }
      }
      break;
    }
    case 'RenameField': {
      const model = findModel(models, op.modelName, appLabel);
      if (model && op.fieldName && op.newName) {
        const field = model.fields.find(f => f.name === op.fieldName);
        if (field) field.name = op.newName;
      }
      break;
    }
  }
}

// ── Diff computation ──────────────────────────────────────────────────────────

/**
 * Compute what changed between migration step (index - 1) and step (index).
 */
export function computeDiff(migrations: readonly Migration[], index: number): TimelineStepDiff {
  const diff: TimelineStepDiff = {
    addedModels: [],
    removedModels: [],
    renamedModels: [],
    addedFields: [],
    removedFields: [],
    alteredFields: [],
    renamedFields: [],
  };

  if (index < 0 || index >= migrations.length) return diff;

  const mig = migrations[index]!;
  for (const op of mig.operations) {
    switch (op.kind) {
      case 'CreateModel':
        diff.addedModels.push(op.modelName);
        break;
      case 'DeleteModel':
        diff.removedModels.push(op.modelName);
        break;
      case 'RenameModel':
        diff.renamedModels.push({ from: op.modelName, to: op.newName ?? op.modelName });
        break;
      case 'AddField':
        if (op.fieldName) diff.addedFields.push({ model: op.modelName, field: op.fieldName });
        break;
      case 'RemoveField':
        if (op.fieldName) diff.removedFields.push({ model: op.modelName, field: op.fieldName });
        break;
      case 'AlterField':
        if (op.fieldName) diff.alteredFields.push({ model: op.modelName, field: op.fieldName });
        break;
      case 'RenameField':
        if (op.fieldName && op.newName) {
          diff.renamedFields.push({ model: op.modelName, from: op.fieldName, to: op.newName });
        }
        break;
    }
  }

  return diff;
}

// ── Op summary text ───────────────────────────────────────────────────────────

function opSummaryLine(op: MigrationOperation): string {
  switch (op.kind) {
    case 'CreateModel':
      return `+ ${op.modelName}`;
    case 'DeleteModel':
      return `- ${op.modelName}`;
    case 'AddField':
      return `+ ${op.modelName}.${op.fieldName ?? '?'}`;
    case 'RemoveField':
      return `- ${op.modelName}.${op.fieldName ?? '?'}`;
    case 'AlterField':
      return `~ ${op.modelName}.${op.fieldName ?? '?'}`;
    case 'RenameField':
      return `${op.modelName}.${op.fieldName ?? '?'} → ${op.newName ?? '?'}`;
    case 'RenameModel':
      return `${op.modelName} → ${op.newName ?? '?'}`;
    default:
      return op.kind;
  }
}

// ── DGM-010: Timeline steps ───────────────────────────────────────────────────

/**
 * Build the full timeline step array from a sorted migration list.
 * Each step includes the diff relative to the previous step and a
 * human-readable summary of operations.
 */
export function buildTimelineSteps(migrations: readonly Migration[]): DiagramTimelineStep[] {
  return migrations.map((mig, idx) => {
    const diff = computeDiff(migrations, idx);
    return {
      key: makeKey(mig.appLabel, mig.name),
      name: mig.name,
      appLabel: mig.appLabel,
      isInitial: mig.dependencies.length === 0,
      dependencies: [...mig.dependencies],
      opCount: mig.operations.length,
      opSummary: mig.operations.map(opSummaryLine),
      diff,
    };
  });
}

// ── Schema comparison ─────────────────────────────────────────────────────────

const RELATION_FIELD_TYPES = new Set(['ForeignKey', 'OneToOneField', 'ManyToManyField']);

/**
 * Compare the current live models against a snapshot schema and return
 * a symmetric diff: which models/fields were added/removed/changed.
 */
/** Minimal model shape that both current models and replayed snapshots meet. */
interface SchemaLikeModel {
  readonly name: string;
  readonly appLabel: string;
  readonly fields: readonly {
    readonly name: string;
    readonly fieldType: string;
    readonly attrs?: readonly string[];
  }[];
}

/**
 * Generic schema diff: what changed going from `before` to `after`. Added =
 * present only in after; removed = present only in before. The single engine
 * behind both the timeline (step vs previous step) and compare mode (snapshot
 * vs current models) — any two schemas are just a (before, after) pair.
 */
export function diffSchemas(
  before: readonly SchemaLikeModel[],
  after: readonly SchemaLikeModel[],
): SchemaComparison {
  const beforeByKey = new Map<string, SchemaLikeModel>();
  for (const m of before) beforeByKey.set(makeKey(m.appLabel, m.name), m);
  const afterByKey = new Map<string, SchemaLikeModel>();
  for (const m of after) afterByKey.set(makeKey(m.appLabel, m.name), m);

  const result: SchemaComparison = {
    addedModels: [],
    removedModels: [],
    changedModels: [],
    unchangedModels: [],
  };

  for (const [key, afterModel] of afterByKey) {
    const beforeModel = beforeByKey.get(key);
    if (!beforeModel) {
      result.addedModels.push(key);
      continue;
    }
    const fd = diffModelFields(beforeModel, afterModel);
    if (fd.added.length === 0 && fd.removed.length === 0 && fd.altered.length === 0) {
      result.unchangedModels.push(key);
    } else {
      result.changedModels.push({ key, ...fd });
    }
  }
  for (const key of beforeByKey.keys()) {
    if (!afterByKey.has(key)) result.removedModels.push(key);
  }

  return result;
}

/**
 * Compare current models against a migration snapshot. Thin wrapper over
 * diffSchemas: the snapshot is "before", the current models are "after".
 */
export function compareSchemas(
  current: readonly Model[],
  snapshot: readonly SchemaModel[],
): SchemaComparison {
  // Live fields carry structured kwargs; snapshot fields carry tokens. Feed
  // the diff tokens on both sides or every field with a kwarg reads as
  // altered — the two representations are never string-equal.
  const asSchemaLike: SchemaLikeModel[] = current.map(m => ({
    name: m.name,
    appLabel: m.appLabel,
    fields: m.fields.map(f => ({
      name: f.name,
      fieldType: f.fieldType,
      attrs: attrTokens(f),
    })),
  }));
  return diffSchemas(snapshot, asSchemaLike);
}

/** Comparison key for a field's kwargs — `default` deliberately excluded, see
 *  comparableTokens. */
const signatureOf = (f: { attrs?: readonly string[] }): string =>
  stripDisplayOnly(f.attrs ?? []).join('|');

function diffModelFields(
  before: SchemaLikeModel,
  after: SchemaLikeModel,
): Omit<ModelFieldDiff, 'key'> {
  // Only compare non-relation scalar fields (relations are a separate concern).
  const beforeFields = before.fields.filter(f => !RELATION_FIELD_TYPES.has(f.fieldType));
  const afterFields = after.fields.filter(f => !RELATION_FIELD_TYPES.has(f.fieldType));

  const beforeByName = new Map(beforeFields.map(f => [f.name, f]));
  const afterByName = new Map(afterFields.map(f => [f.name, f]));
  const added: string[] = [];
  const removed: string[] = [];
  const altered: string[] = [];

  for (const [name, af] of afterByName) {
    const bf = beforeByName.get(name);
    if (!bf) {
      added.push(name);
      continue;
    }
    // Not just the type: an AlterField that only moves max_digits/decimal_places
    // keeps the type identical, and used to read as "nothing changed".
    if (af.fieldType !== bf.fieldType || signatureOf(af) !== signatureOf(bf)) {
      altered.push(name);
    }
  }
  for (const name of beforeByName.keys()) {
    if (!afterByName.has(name)) removed.push(name);
  }

  return { added, removed, altered };
}

// ── Snapshot relations helper ─────────────────────────────────────────────────

function schemaModelToSnapshotRelations(models: SchemaModel[]): DiagramSnapshotRelation[] {
  const rels: DiagramSnapshotRelation[] = [];
  for (const m of models) {
    for (const f of m.fields) {
      const type = REL_KIND[f.fieldType];
      if (!type || !f.relatedModel) continue;
      rels.push({ from: m.name, to: f.relatedModel, fieldName: f.name, type });
    }
  }
  return rels;
}

// ── DGM-011: Snapshots ────────────────────────────────────────────────────────

/**
 * The schema after each migration in turn, replaying the history ONCE.
 *
 * `rebuildSchemaAt(migrations, idx)` replays operations 0..idx, so calling it
 * per migration is O(M²) replays — and both builders below did exactly that,
 * for 2 x O(M²) on every project snapshot, synchronously, on the extension
 * host. A history a few hundred migrations long froze the window.
 *
 * The consumers each project the yielded array into fresh objects before the
 * next step mutates the map, which is what makes one shared map safe here.
 * `rebuildSchemaAt` stays: it is the random-access form, and it is what the
 * tests compare this against.
 */
function* schemaStates(migrations: readonly Migration[]): Generator<SchemaModel[]> {
  const models = new Map<string, SchemaModel>();
  for (const mig of migrations) {
    for (const op of mig.operations) {
      applyOperation(models, op, mig.appLabel);
    }
    yield [...models.values()];
  }
}

/**
 * Build one schema snapshot per migration step, for use by the Compare mode.
 * Each snapshot is a minimal description of the schema at that point in time.
 */
export function buildSnapshots(migrations: readonly Migration[]): DiagramSnapshot[] {
  const out: DiagramSnapshot[] = [];
  for (const snapshotModels of schemaStates(migrations)) {
    out.push({
      models: snapshotModels.map(m => ({
        name: m.name,
        appLabel: m.appLabel,
        fieldCount: m.fields.length,
        fields: m.fields.map(f => ({
          name: f.name,
          fieldType: f.fieldType,
          ...(f.attrs?.length ? { attrs: f.attrs } : {}),
        })),
      })),
      relations: schemaModelToSnapshotRelations(snapshotModels),
    });
  }
  return out;
}

/**
 * Build the migration comparison list: for each migration, compare the current
 * live model set against the schema state at that migration.
 */
export function buildMigrationComparisons(
  currentModels: readonly Model[],
  migrations: readonly Migration[],
): DiagramMigrationComparisonEntry[] {
  const out: DiagramMigrationComparisonEntry[] = [];
  let idx = 0;
  for (const snapshotModels of schemaStates(migrations)) {
    const mig = migrations[idx]!;
    out.push({
      migrationIdx: idx,
      migrationName: mig.name,
      appLabel: mig.appLabel,
      comparison: compareSchemas(currentModels, snapshotModels),
    });
    idx++;
  }
  return out;
}

// ── Utility ───────────────────────────────────────────────────────────────────

function makeKey(appLabel: string, name: string): string {
  return appLabel ? `${appLabel}.${name}` : name;
}

// ── DGM-010: topological (chronological) ordering ──────────────────────────────

/**
 * Order migrations into their real chronological (application) order by
 * topologically sorting the dependency DAG. A node may depend on several others
 * (a "merge") and is emitted only after all its in-set deps. Concurrent nodes
 * are broken by (appLabel, name) for determinism. Dependencies on apps outside
 * the scanned set are ignored; cycles never hang — leftover nodes are appended
 * in stable order. Also fixes schema replay, which previously used scan order.
 */
export function orderMigrations(migrations: readonly Migration[]): Migration[] {
  if (migrations.length === 0) return [];

  const byKey = new Map<string, Migration>();
  for (const m of migrations) byKey.set(makeKey(m.appLabel, m.name), m);

  const cmp = (a: string, b: string): number => {
    const ma = byKey.get(a)!;
    const mb = byKey.get(b)!;
    return ma.appLabel === mb.appLabel
      ? ma.name.localeCompare(mb.name)
      : ma.appLabel.localeCompare(mb.appLabel);
  };

  const inDeg = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const m of migrations) {
    const k = makeKey(m.appLabel, m.name);
    if (!inDeg.has(k)) inDeg.set(k, 0);
    for (const dep of m.dependencies) {
      if (!byKey.has(dep)) continue; // external / unknown dep — ignore
      inDeg.set(k, (inDeg.get(k) ?? 0) + 1);
      const arr = dependents.get(dep) ?? [];
      arr.push(k);
      dependents.set(dep, arr);
    }
  }

  const ready = [...inDeg.entries()]
    .filter(([, d]) => d === 0)
    .map(([k]) => k)
    .sort(cmp);
  const out: Migration[] = [];
  const seen = new Set<string>();

  while (ready.length > 0) {
    const k = ready.shift()!;
    seen.add(k);
    out.push(byKey.get(k)!);
    for (const dep of dependents.get(k) ?? []) {
      const d = (inDeg.get(dep) ?? 1) - 1;
      inDeg.set(dep, d);
      if (d === 0) ready.push(dep);
    }
    ready.sort(cmp);
  }

  // Cycle fallback: append any unreached nodes in stable order so a malformed
  // graph never drops a migration or loops forever.
  if (out.length < migrations.length) {
    const remaining = [...byKey.keys()]
      .filter(k => !seen.has(k))
      .sort(cmp)
      .map(k => byKey.get(k)!);
    out.push(...remaining);
  }

  return out;
}
