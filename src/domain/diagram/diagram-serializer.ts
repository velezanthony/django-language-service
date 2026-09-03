/**
 * Orchestrates all diagram sub-systems and produces the full `DiagramDataPayload`
 * that the webview reads from `window.__DIAGRAM_DATA__`.
 *
 * Pure function — takes a `Project` and returns a plain serializable object.
 * No vscode / fs / DOM dependency — purity is rg-verifiable.
 *
 * @inventory DGM-001..DGM-003, DGM-009..DGM-014, DGM-021..DGM-023
 */

import type { Project } from '$domain/contracts/project';
import type { Model } from '$domain/types/model';
import type { Relation } from '$domain/types/relation';
import type { Migration } from '$domain/types/migration';
import type { FieldChoices } from '$domain/types/choice';
import { attrTokens } from '$domain/parsers/_shared/field-attrs';
import type { PropertyDef } from '$domain/types/model';

import { findCycles, computeHubTiers, detectOrphans } from './diagram-layout';
import { generateMermaid, generateDBML, generatePlantUML } from './diagram-exports';
import {
  buildTimelineSteps,
  buildSnapshots,
  buildMigrationComparisons,
  orderMigrations,
} from './diagram-migrations';
import type {
  DiagramTimelineStep,
  DiagramSnapshot,
  DiagramMigrationComparisonEntry,
} from './diagram-migrations';

// ── Payload types (consumed by the Svelte webview) ───────────────────────────

/** Relation line as serialized for the webview. */
export interface DiagramRelationLine {
  from: string;
  to: string;
  fieldName: string;
  type: 'FK' | 'M2M' | 'O2O';
  onDelete?: string;
}

/** Field line inside a tooltip box. */
export interface FieldLine {
  name: string;
  type: string;
  /** Canonical kwarg tokens. A LIST, not a formatted string: the diff
   *  comparator needs to tell which kwarg moved, and it cannot do that
   *  against "  (max_length=200, null)". Formatting belongs to FieldRow. */
  attrs: readonly string[];
  doc: string;
  choices?: FieldChoices;
  /** Base class the field comes from, when it is not declared on the model. */
  inheritedFrom?: string;
}

/** Relation line inside a tooltip box (distinct from DiagramRelationLine). */
export interface RelationLine {
  name: string;
  type: 'FK' | 'M2M' | 'O2O';
  target: string;
}

/** Incoming reference from another model (for "referenced by" in tooltip). */
export interface IncomingRef {
  from: string;
  fieldName: string;
  type: 'FK' | 'M2M' | 'O2O';
}

/**
 * Full data record for a single model box.
 * `BoxRecord` = `TooltipData` + search blobs + diagram flags.
 *
 * IMPORTANT for Batch 4 (Svelte webview consumers): field names here are the
 * EXACT keys that the webview state stores read from `window.__DIAGRAM_DATA__`.
 * Do NOT rename without updating the Svelte composables accordingly.
 */
export interface BoxRecord {
  key: string;
  name: string;
  appLabel: string;
  dbTable: string;
  verboseName?: string | undefined;
  tableComment: string;
  fieldCount: number;
  fields: FieldLine[];
  relations: RelationLine[];
  referencedBy: IncomingRef[];
  incomingCount: number;
  properties: PropertyDef[];
  hubTier: number;
  isOrphan: boolean;
  isAbstract: boolean;
  isProxy: boolean;
  isInCycle: boolean;
  genericFkCount: number;
  /** Precomputed lowercase search blobs for scoped search (DGM-004..007). */
  searchModel: string;
  searchFields: string;
  searchRelations: string;
}

/** The complete payload injected as `window.__DIAGRAM_DATA__`. */
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

// ── Re-exports for downstream consumers ──────────────────────────────────────

export type { DiagramTimelineStep, DiagramSnapshot, DiagramMigrationComparisonEntry };

// ── Internal helpers ──────────────────────────────────────────────────────────

const RELATION_FIELD_TYPES = new Set(['ForeignKey', 'OneToOneField', 'ManyToManyField']);

function makeKey(appLabel: string, name: string): string {
  return appLabel ? `${appLabel}.${name}` : name;
}

function relKindToFKM2MO2O(kind: string): 'FK' | 'M2M' | 'O2O' {
  if (kind === 'm2m') return 'M2M';
  if (kind === 'o2o') return 'O2O';
  return 'FK';
}

/**
 * Build a resolver that qualifies raw relation targets to 'app.Model' keys.
 *
 * The model parser emits `toModel` exactly as captured in source: same-app
 * refs come through BARE ('Category') and self-FKs as the literal 'self'.
 * Resolution rules (ported from the legacy diagram's resolveTarget):
 *   - 'self'            → the owner model's own key
 *   - contains '.'      → already qualified; matched to a real key, exactly
 *                         first and then case-insensitively
 *   - bare, known name  → prefer the same-app candidate, else first candidate
 *   - bare, unknown     → returned raw so external refs (e.g. 'User') are
 *                         filtered downstream by the modelKeySet check
 *
 * Case is not part of a lazy model reference. Django resolves `'blog.post'`,
 * `'blog.Post'` and a bare `'post'` to the same model, and the migration replay
 * already knows that (`findModelKey` in diagram-migrations). This builder did
 * not: it handed the raw string straight to a filter whose keys are always
 * `App.Model`, so `ForeignKey('blog.post')` — code Django runs — lost its edge.
 * Exact match still wins, so a project that really does have two models
 * differing only in case keeps the spelling it wrote.
 */
function buildTargetResolver(
  models: readonly Model[],
): (fromModel: string, toModel: string) => string {
  // Bare name → candidate qualified keys (duplicates across apps preserved).
  // Each index is dual-keyed: exact spelling and lowercase.
  const keysByBareName = new Map<string, string[]>();
  const keysByLowerBareName = new Map<string, string[]>();
  const keyByLowerKey = new Map<string, string>();
  const knownKeys = new Set<string>();

  for (const m of models) {
    const key = makeKey(m.appLabel, m.name);
    knownKeys.add(key);
    if (!keyByLowerKey.has(key.toLowerCase())) keyByLowerKey.set(key.toLowerCase(), key);

    keysByBareName.set(m.name, [...(keysByBareName.get(m.name) ?? []), key]);
    const lower = m.name.toLowerCase();
    keysByLowerBareName.set(lower, [...(keysByLowerBareName.get(lower) ?? []), key]);
  }

  return (fromModel, toModel) => {
    if (toModel === 'self') return fromModel;

    if (toModel.includes('.')) {
      if (knownKeys.has(toModel)) return toModel;
      return keyByLowerKey.get(toModel.toLowerCase()) ?? toModel;
    }

    const candidates =
      keysByBareName.get(toModel) ?? keysByLowerBareName.get(toModel.toLowerCase());
    if (candidates && candidates.length > 0) {
      const dot = fromModel.indexOf('.');
      const ownerApp = dot > 0 ? fromModel.slice(0, dot) : '';
      if (ownerApp) {
        const sameApp = candidates.find(k => k.startsWith(`${ownerApp}.`));
        if (sameApp) return sameApp;
      }
      return candidates[0]!;
    }
    return toModel;
  };
}

/** Resolve `toModel` on every relation of a list (fromModel is already qualified). */
function resolveRelations(
  relations: readonly Relation[],
  resolveTarget: (fromModel: string, toModel: string) => string,
): Relation[] {
  return relations.map(r => {
    const resolved = resolveTarget(r.fromModel, r.toModel);
    return resolved === r.toModel ? r : { ...r, toModel: resolved };
  });
}

// ── Main serializer ───────────────────────────────────────────────────────────

/**
 * Serialize a `Project` into the full `DiagramDataPayload`.
 *
 * This is the single entry point called by `src/adapters/diagram/panel.ts`.
 * The returned object is JSON-serializable (no vscode types, no Maps, no Sets).
 */
export function serializeDiagram(project: Project): DiagramDataPayload {
  const models = project.models.all();
  const allRelations = project.models.all().flatMap(m => [...m.relations]);
  const migrations = project.migrations.all();

  return buildDiagramPayload(models, allRelations, migrations);
}

/**
 * Inner builder exposed for testing without needing a full `Project` instance.
 */
export function buildDiagramPayload(
  models: readonly Model[],
  allRelations: readonly Relation[],
  migrations: readonly Migration[],
): DiagramDataPayload {
  const modelKeys = models.map(m => makeKey(m.appLabel, m.name));
  const modelKeySet = new Set(modelKeys);

  // Build a lookup by key for O(1) access.
  const modelByKey = new Map<string, Model>();
  for (const m of models) modelByKey.set(makeKey(m.appLabel, m.name), m);

  // Normalize raw targets ('self', bare same-app names) to qualified keys
  // BEFORE any filtering/indexing — otherwise intra-app FKs (the most common
  // case) silently disappear because modelKeySet only holds 'app.Model' keys.
  const resolveTarget = buildTargetResolver(models);
  const resolvedRelations = resolveRelations(allRelations, resolveTarget);

  // Filter relations to only those where both endpoints are in the diagram.
  const filteredRelations = resolvedRelations.filter(
    r => modelKeySet.has(r.fromModel) && modelKeySet.has(r.toModel),
  );

  // Incoming relation index: toModel → list of incoming refs.
  const incomingByKey = new Map<string, IncomingRef[]>();
  for (const r of filteredRelations) {
    const list = incomingByKey.get(r.toModel) ?? [];
    list.push({
      from: r.fromModel,
      fieldName: r.fieldName,
      type: relKindToFKM2MO2O(r.kind),
    });
    incomingByKey.set(r.toModel, list);
  }

  // Per-model relations with resolved targets (drives BoxRecord serialization
  // and outgoing counts — the raw m.relations may carry bare/'self' targets).
  const resolvedRelationsByKey = new Map<string, Relation[]>();
  for (const m of models) {
    resolvedRelationsByKey.set(
      makeKey(m.appLabel, m.name),
      resolveRelations(m.relations, resolveTarget),
    );
  }

  // Outgoing count per model.
  // NOT filtered by modelKeySet: a relation to settings.AUTH_USER_MODEL, to a
  // Django built-in or to a third-party model is still a relation. Filtering
  // here made every such model an orphan — a Profile hanging off the user
  // model being the obvious casualty.
  const outgoingCountByKey = new Map<string, number>();
  for (const m of models) {
    const key = makeKey(m.appLabel, m.name);
    outgoingCountByKey.set(key, (resolvedRelationsByKey.get(key) ?? []).length);
  }

  // Incoming count per model.
  const incomingCountByKey = new Map<string, number>();
  for (const key of modelKeys) {
    incomingCountByKey.set(key, incomingByKey.get(key)?.length ?? 0);
  }

  // DGM-002: Hub heatmap tiers.
  const hubTiers = computeHubTiers(modelKeys, incomingCountByKey);

  // DGM-003: Orphan detection.
  const orphanSet = detectOrphans(modelKeys, incomingCountByKey, outgoingCountByKey);

  // DGM-009: Tarjan SCC — cycle detection.
  const cycleNodes = new Set<string>();
  const edges = filteredRelations.map(r => ({ from: r.fromModel, to: r.toModel }));
  const sccs = findCycles(modelKeys, edges);
  for (const scc of sccs) for (const k of scc) cycleNodes.add(k);

  // Build tooltipData / BoxRecord array.
  const tooltipData: BoxRecord[] = models.map(m => {
    const key = makeKey(m.appLabel, m.name);
    const meta = m.meta;
    const appLabel = m.appLabel;
    const dbTable =
      meta?.dbTable ?? (appLabel ? `${appLabel}_${m.name.toLowerCase()}` : m.name.toLowerCase());

    // Scalar fields only (relation fields are in m.relations).
    const scalarFields = m.fields.filter(
      f => !RELATION_FIELD_TYPES.has(f.fieldType) && !f.isGenericFk,
    );
    const fieldLines: FieldLine[] = scalarFields.map(f => {
      // Same reader the migration parser uses — a box and the snapshot
      // it gets diffed against must describe a field identically.
      const attrs = attrTokens(f);
      return {
        name: f.name,
        type: f.fieldType,
        attrs,
        doc: f.docComment ?? '',
        ...(f.choices ? { choices: f.choices } : {}),
        ...(f.inheritedFrom ? { inheritedFrom: f.inheritedFrom } : {}),
      };
    });

    // Relation lines from m.relations, with targets resolved to qualified keys.
    const resolvedRels = resolvedRelationsByKey.get(key) ?? [];
    const relLines: RelationLine[] = resolvedRels.map(r => ({
      name: r.fieldName,
      type: relKindToFKM2MO2O(r.kind),
      target: r.toModel,
    }));

    const incoming = incomingByKey.get(key) ?? [];
    const genericFkCount = m.fields.filter(f => f.isGenericFk).length;

    return {
      key,
      name: m.name,
      appLabel,
      dbTable,
      verboseName: meta?.verboseName,
      tableComment: meta?.tableComment ?? '',
      fieldCount: m.fields.length,
      fields: fieldLines,
      relations: relLines,
      referencedBy: incoming,
      incomingCount: incoming.length,
      properties: [...m.properties],
      hubTier: hubTiers[key] ?? 0,
      isOrphan: orphanSet.has(key),
      isAbstract: meta?.abstract === true,
      isProxy: meta?.proxy === true,
      isInCycle: cycleNodes.has(key),
      genericFkCount,
      // `key` (appLabel.Name) is included so the dropdown suggestion —
      // which sets the query to "appLabel.Name" on pick — matches its own
      // model instead of filtering everything out.
      searchModel: [m.name, key, dbTable, meta?.verboseName ?? '']
        .filter(Boolean)
        .join(' ')
        .toLowerCase(),
      searchFields: [...m.fields.map(f => f.name), ...m.properties.map(p => p.name)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase(),
      searchRelations: resolvedRels
        .flatMap(r => [r.toModel, r.relatedName ?? ''])
        .filter(Boolean)
        .join(' ')
        .toLowerCase(),
    };
  });

  // Unique app labels.
  const appLabels = [...new Set(models.map(m => m.appLabel).filter(a => a))].sort();

  // DGM-012/013/014: text-format exports.
  const mermaidSrc = generateMermaid(models, filteredRelations);
  const dbmlSrc = generateDBML(models, filteredRelations);
  const plantUmlSrc = generatePlantUML(models, filteredRelations);

  // Serialized relation lines.
  const relations: DiagramRelationLine[] = filteredRelations.map(r => ({
    from: r.fromModel,
    to: r.toModel,
    fieldName: r.fieldName,
    type: relKindToFKM2MO2O(r.kind),
    ...(r.onDelete ? { onDelete: r.onDelete } : {}),
  }));

  // DGM-010/011: timeline + snapshots + compare. Order by the dependency DAG
  // first so the timeline is chronological and schema replay applies ops in
  // the real order (Django's), not scan order.
  const orderedMigrations = orderMigrations(migrations);
  const timelineSteps = buildTimelineSteps(orderedMigrations);
  const snapshots = buildSnapshots(orderedMigrations);
  const migrationComparisons = buildMigrationComparisons(models, orderedMigrations);

  return {
    tooltipData,
    relations,
    modelKeys,
    appLabels,
    mermaidSrc,
    dbmlSrc,
    plantUmlSrc,
    timelineSteps,
    snapshots,
    migrationComparisons,
  };
}
