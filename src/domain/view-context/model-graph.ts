/**
 * ModelGraph — indexed view over the scanned Model[] for the chain engine.
 *
 * Port of the legacy relation-indexer.ts (buildReverseIndex) plus the
 * bare-name fallback lookups that lived in chain-type-resolver.ts
 * (lookupByBareSuffix) and model-parser.ts (getFieldByName).
 *
 * Build ONCE per Project snapshot and reuse across chain resolutions —
 * construction walks every model/relation; lookups are O(1).
 *
 * Pure domain: no vscode / fs / path imports.
 */

import { bareClassName } from '$domain/parsers/_shared/python-tokens';
import type { Model } from '$domain/types/model';
import type { Field } from '$domain/types/field';
import type { Relation } from '$domain/types/relation';
import type { ReverseRelation } from './types';

export interface ModelGraph {
  readonly models: readonly Model[];
  /** Resolve a model ref as written in source: 'app.Name' or bare 'Name'.
   *  Bare-name collisions resolve first-wins (legacy iteration order). */
  resolveModel(ref: string): Model | undefined;
  /** O(1) scalar-field lookup by name (relations are NOT fields here). */
  fieldOf(model: Model, name: string): Field | undefined;
  /** O(1) forward-relation lookup by field name. */
  relationOf(model: Model, fieldName: string): Relation | undefined;
  /** Reverse accessors declared against `ref` (qualified or bare). */
  reverseRelationsOf(ref: string): readonly ReverseRelation[];
}

const NO_REVERSE: readonly ReverseRelation[] = [];

/**
 * The attribute Django puts on the TARGET model, or null when there is none.
 *
 * Only explicit `related_name`s used to be indexed, so the default — which is
 * what most code relies on — did not exist as far as the tool was concerned and
 * `{{ customer.order_set.all }}` read as a mistake.
 */
function reverseAccessorName(r: Relation): string | null {
  // `related_name="+"` asks Django for no reverse accessor at all.
  if (r.relatedName === '+') return null;
  // `"%(class)s_set"` on an abstract base is a template resolved per concrete
  // child. Interpolating it is not attempted, so claim nothing.
  if (r.relatedName?.includes('%(')) return null;
  if (r.relatedName) return r.relatedName;
  // Django's default: `<model>_set`, except a OneToOne, which reverses to a
  // single instance under the bare model name.
  const source = bareClassName(r.fromModel).toLowerCase();
  return r.kind === 'o2o' ? source : `${source}_set`;
}

/**
 * Fold a model's inherited members into it, so every consumer sees one flat
 * surface.
 *
 * This is NOT a duplicate of the parser's applyInheritance, which answers a
 * different question. That one describes the SCHEMA: a multi-table child has
 * its own table, so it gets a `<parent>_ptr` link rather than the parent's
 * columns — right for the diagram. This one describes what a TEMPLATE may
 * write, and `{{ restaurant.address }}` is valid however the rows are stored.
 * The `_ptr` relation is the parser's to emit; this only reads members. Fields declared on an abstract base or reached through multi-table
 * inheritance are accessed exactly like the model's own, and treating them as
 * absent reported a false error on every `{{ obj.created }}` in any project
 * with a TimeStampedModel — which is most of them.
 */
function flattenInheritance(models: readonly Model[]): Model[] {
  const byName = new Map<string, Model>();
  for (const m of models) {
    byName.set(`${m.appLabel}.${m.name}`, m);
    if (!byName.has(m.name)) byName.set(m.name, m);
  }

  const done = new Map<Model, Model>();

  const flatten = (m: Model, seen: Set<Model>): Model => {
    const cached = done.get(m);
    if (cached) return cached;
    // A cycle cannot happen in valid Python, but a malformed parse must not
    // hang the language server.
    if (seen.has(m)) return m;
    seen.add(m);

    const parents = (m.bases ?? [])
      // Through the shared rule: a base written `core.mixins.TimeStampedModel`
      // hit neither key and the model silently inherited nothing.
      .map(b => byName.get(b.trim()) ?? byName.get(bareClassName(b)))
      .filter((b): b is Model => b !== undefined && b !== m)
      .map(b => flatten(b, seen));

    if (parents.length === 0) {
      done.set(m, m);
      return m;
    }

    // The model's OWN declarations win: `field = None` on a child, or a
    // redeclared field, must not be shadowed by the base's version.
    const fields = [...m.fields];
    const relations = [...m.relations];
    const properties = [...m.properties];
    const methods = [...(m.methods ?? [])];
    const has = (xs: { name: string }[], n: string): boolean => xs.some(x => x.name === n);
    // `field = None` is how Django DROPS something an abstract base declared.
    const dropped = new Set(m.removedFields ?? []);

    for (const parent of parents) {
      for (const f of parent.fields) {
        if (!dropped.has(f.name) && !has(fields, f.name)) fields.push(f);
      }
      for (const r of parent.relations) {
        if (dropped.has(r.fieldName)) continue;
        if (!relations.some(x => x.fieldName === r.fieldName)) relations.push(r);
      }
      for (const p of parent.properties) if (!has(properties, p.name)) properties.push(p);
      for (const x of parent.methods ?? []) if (!methods.includes(x)) methods.push(x);
    }

    const flat: Model = { ...m, fields, relations, properties, methods };
    done.set(m, flat);
    return flat;
  };

  return models.map(m => flatten(m, new Set()));
}

export function createModelGraph(rawModels: readonly Model[]): ModelGraph {
  // Inherited members are folded in ONCE here, so every consumer — the chain
  // resolver, hover, completion — sees the same flat surface.
  const models = flattenInheritance(rawModels);
  const byQualified = new Map<string, Model>();
  const byBare = new Map<string, Model>();
  const fieldIndex = new Map<Model, Map<string, Field>>();
  const relationIndex = new Map<Model, Map<string, Relation>>();
  const reverseIndex = new Map<string, ReverseRelation[]>();

  const pushReverse = (key: string, rel: ReverseRelation): void => {
    const existing = reverseIndex.get(key);
    if (existing) existing.push(rel);
    else reverseIndex.set(key, [rel]);
  };

  for (const m of models) {
    const qualified = `${m.appLabel}.${m.name}`;
    byQualified.set(qualified, m);
    // First-wins keeps legacy lookupByBareSuffix iteration-order semantics.
    if (!byBare.has(m.name)) byBare.set(m.name, m);

    const fields = new Map<string, Field>();
    for (const f of m.fields) fields.set(f.name, f);
    fieldIndex.set(m, fields);

    const relations = new Map<string, Relation>();
    for (const r of m.relations) {
      relations.set(r.fieldName, r);

      const accessor = reverseAccessorName(r);
      if (accessor === null) continue;
      const entry: ReverseRelation = {
        name: accessor,
        sourceModel: r.fromModel,
        relationKind: r.kind,
      };
      // 'self' relations reverse onto the declaring model itself.
      const target = r.toModel === 'self' ? r.fromModel : r.toModel;
      pushReverse(target, entry);
      // Qualified targets also get indexed under the bare class name so
      // consumers that only have the bare name (DTL context) still hit.
      // Same object reference under both keys — legacy dual-keying.
      const dotIdx = target.lastIndexOf('.');
      if (dotIdx > 0 && dotIdx < target.length - 1) {
        pushReverse(target.substring(dotIdx + 1), entry);
      }
    }
    relationIndex.set(m, relations);
  }

  return {
    models,
    resolveModel(ref: string): Model | undefined {
      const direct = byQualified.get(ref) ?? byBare.get(ref);
      if (direct) return direct;
      // Qualified ref whose appLabel doesn't match what the parser derived
      // (e.g. nested app paths) — fall back to the bare class name.
      const dotIdx = ref.lastIndexOf('.');
      if (dotIdx > 0 && dotIdx < ref.length - 1) {
        return byBare.get(ref.substring(dotIdx + 1));
      }
      return undefined;
    },
    fieldOf(model: Model, name: string): Field | undefined {
      return fieldIndex.get(model)?.get(name);
    },
    relationOf(model: Model, fieldName: string): Relation | undefined {
      return relationIndex.get(model)?.get(fieldName);
    },
    reverseRelationsOf(ref: string): readonly ReverseRelation[] {
      return reverseIndex.get(ref) ?? NO_REVERSE;
    },
  };
}
