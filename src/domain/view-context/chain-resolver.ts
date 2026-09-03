/**
 * Chain resolver — types a dotted template expression (`a.b.c`) hop by hop
 * against the model graph. Port of legacy chain-type-resolver.ts adapted to
 * the new Model shape (scalar fields vs relations split) and to ModelGraph.
 *
 * Semantics (unchanged from legacy):
 *   instance  → fields / forward relations / @property / annotations /
 *               reverse relations; unknown → error + suggestion
 *   manager | queryset → ONLY the 0-arg attrs Django templates can call
 *               (MANAGER_ATTRS); model fields on a manager are an error
 *   dict      → dictKeys only
 *   primitive → chain stops, no further validation
 *   unknown model → graceful skip (finalType null, NO error)
 *
 * Pure domain: no vscode / fs / path imports.
 */

import type { Model } from '$domain/types/model';
import type { Field } from '$domain/types/field';
import type { Relation } from '$domain/types/relation';
import type { AnnotationRef } from '$domain/types/context-var';
import { PY_IDENT } from '$domain/parsers/_shared/python-tokens';
import type { ModelGraph } from './model-graph';
import type { ChainError, ChainResult, ResolvedType } from './types';
import { hasAnnotation } from './types';
import { findSimilar } from './find-similar';

// ── Manager/QuerySet valid attributes (0-arg callables in Django templates) ──

export const MANAGER_ATTRS: ReadonlyMap<string, (model: string) => ResolvedType> = new Map([
  ['all', (m: string): ResolvedType => ({ kind: 'queryset', model: m })],
  ['count', (): ResolvedType => ({ kind: 'primitive' })],
  ['exists', (): ResolvedType => ({ kind: 'primitive' })],
  ['first', (m: string): ResolvedType => ({ kind: 'instance', model: m })],
  ['last', (m: string): ResolvedType => ({ kind: 'instance', model: m })],
  ['none', (m: string): ResolvedType => ({ kind: 'queryset', model: m })],
]);

// ── Attributes Django adds that never appear in the model body ───────────────

/**
 * `pk` is an alias for the primary key on every single model, and `id` is the
 * column Django creates when the model declares no primary key of its own.
 * Neither is written in the source, so a field-list lookup will never find
 * them — and `{{ obj.pk }}` is about as common as template code gets.
 */
export function implicitInstanceAttr(field: string, model: Model): boolean {
  if (field === 'pk') return true;
  if (field !== 'id') return false;
  // An explicit primary key REPLACES `id`; claiming otherwise would hide a
  // real mistake on models keyed by a UUID or a composite key.
  if (model.compositePrimaryKey?.length) return false;
  return !model.fields.some(f => f.isPrimaryKey);
}

/**
 * `get_<field>_display` is generated for any field declared with choices.
 * Matching the name alone would accept `get_anything_display`, so the field
 * has to exist and actually have choices.
 */
export function choiceDisplaySource(field: string, model: Model): Field | undefined {
  const m = /^get_(\w+)_display$/.exec(field);
  if (!m) return undefined;
  const target = model.fields.find(f => f.name === m[1]);
  return target?.choices ? target : undefined;
}

function isChoiceDisplayAccessor(field: string, model: Model): boolean {
  return choiceDisplaySource(field, model) !== undefined;
}

/**
 * `order.customer_id` — the raw foreign key, readable without the join.
 *
 * `ForeignKey.get_attname()` is hardcoded to `"%s_id" % self.name`, so the
 * attribute is always `<name>_id` even with `db_column=` or `to_field=`.
 * Reading it instead of `order.customer.pk` is how you avoid a query, which
 * makes it common in real templates.
 */
export function fkIdSource(field: string, model: Model): Relation | undefined {
  const m = new RegExp(String.raw`^(${PY_IDENT})_id$`, 'u').exec(field);
  if (!m) return undefined;
  const rel = model.relations.find(r => r.fieldName === m[1]);
  return rel && (rel.kind === 'fk' || rel.kind === 'o2o') ? rel : undefined;
}

/**
 * `get_next_by_<field>` / `get_previous_by_<field>`.
 *
 * Django adds both for every DateField and DateTimeField that is not
 * `null=True` — the guard in `DateField.contribute_to_class` is exactly
 * `if not self.null`. Each call runs a query, and when there is no neighbour it
 * raises DoesNotExist, which templates swallow silently.
 */
export function dateNavSource(field: string, model: Model): Field | undefined {
  const m = new RegExp(String.raw`^get_(?:next|previous)_by_(${PY_IDENT})$`, 'u').exec(field);
  if (!m) return undefined;
  const target = model.fields.find(f => f.name === m[1]);
  if (!target || target.isNull) return undefined;
  return /^Date(Time)?Field$/.test(target.fieldType) ? target : undefined;
}

// ── Core resolver ─────────────────────────────────────────────────────────────

export function resolveChain(
  parts: readonly string[],
  rootType: ResolvedType,
  graph: ModelGraph,
): ChainResult {
  // Single part — just the root, no field access.
  if (parts.length <= 1) return { finalType: rootType };

  let current: ResolvedType | null = rootType;

  for (let i = 1; i < parts.length; i++) {
    if (!current) return { finalType: null };

    // Primitive — no further validation possible.
    if (current.kind === 'primitive') return { finalType: current };

    const field = parts[i]!;

    // A numeric segment is a sequence index, which Django resolves on any
    // subscriptable value: `{{ products.0.name }}` is the first row.
    if (/^\d+$/.test(field)) {
      current =
        current.kind === 'queryset' || current.kind === 'manager'
          ? { kind: 'instance', ...(current.model ? { model: current.model } : {}) }
          : null; // indexing something we cannot type — stop, do not accuse.
      continue;
    }

    if (current.kind === 'instance') {
      const resolved = resolveInstanceAccess(field, current, graph);
      if (resolved.error) return { finalType: null, error: { ...resolved.error, level: i } };
      current = resolved.type;
    } else if (current.kind === 'dict') {
      const resolved = resolveDictAccess(field, current.dictKeys ?? []);
      if (resolved.error) return { finalType: null, error: { ...resolved.error, level: i } };
      current = resolved.type;
    } else {
      // manager or queryset
      const resolved = resolveManagerAccess(field, current.model ?? '', current.kind, graph);
      if (resolved.error) return { finalType: null, error: { ...resolved.error, level: i } };
      // Inherit annotations / values projection when the result stays on
      // the same model (`.first`, `.last`, `.all`, `.none`) — otherwise
      // `{{ products.first.review_count }}` would lose the annotate().
      if (resolved.type && resolved.type.model === current.model) {
        current = {
          ...resolved.type,
          ...(current.annotations ? { annotations: current.annotations } : {}),
          ...(current.valuesFields ? { valuesFields: current.valuesFields } : {}),
        };
      } else {
        current = resolved.type;
      }
    }
  }

  return { finalType: current };
}

// ── Instance field resolution ─────────────────────────────────────────────────

interface AccessResult {
  type: ResolvedType | null;
  error?: Omit<ChainError, 'level'>;
}

function resolveInstanceAccess(
  field: string,
  current: ResolvedType,
  graph: ModelGraph,
): AccessResult {
  const modelRef = current.model ?? '';
  const model = graph.resolveModel(modelRef);
  if (!model) {
    // Unknown model — graceful skip.
    return { type: null };
  }

  const annotations = current.annotations;
  const valuesFields = current.valuesFields;

  // values()/values_list() narrows the surface to exactly those names plus
  // annotations. Anything else — even legitimate model fields — is gone.
  if (valuesFields !== undefined && valuesFields.length > 0) {
    if (valuesFields.includes(field) || hasAnnotation(annotations, field)) {
      return { type: { kind: 'primitive' } };
    }
    const validKeys = [...valuesFields, ...(annotations ?? []).map(a => a.name)];
    const suggestion = findSimilar(field, validKeys);
    return {
      type: null,
      error: {
        field,
        message: `'${field}' is not in .values() projection of ${modelRef} (available: ${validKeys.join(', ')})`,
        ...(suggestion ? { suggestion } : {}),
      },
    };
  }

  // 1. Direct scalar fields.
  if (graph.fieldOf(model, field)) {
    return { type: { kind: 'primitive' } };
  }

  // 2. Forward relations (FK / O2O → instance, M2M → manager).
  const relation = graph.relationOf(model, field);
  if (relation) {
    return { type: resolveForwardRelation(relation, model) };
  }

  // 3. @property, and plain zero-argument methods — a template calls both the
  //    same way, and get_absolute_url is in Django's own model docs.
  if (model.properties.some(p => p.name === field)) {
    return { type: { kind: 'primitive' } };
  }
  if (model.methods?.includes(field)) {
    return { type: { kind: 'primitive' } };
  }

  // 3b. Attributes Django synthesizes: pk / id / get_<choice field>_display.
  if (implicitInstanceAttr(field, model) || isChoiceDisplayAccessor(field, model)) {
    return { type: { kind: 'primitive' } };
  }

  // The raw FK value — a scalar, so nothing chains off it.
  if (fkIdSource(field, model)) return { type: { kind: 'primitive' } };

  // get_next_by_<date field> returns an instance of this same model.
  const dateNav = dateNavSource(field, model);
  if (dateNav) {
    return { type: { kind: 'instance', model: `${model.appLabel}.${model.name}` } };
  }

  // 4. Queryset annotations — treated as primitive.
  if (hasAnnotation(annotations, field)) {
    return { type: { kind: 'primitive' } };
  }

  // 4b. An attribute a Prefetch(to_attr=…) put on this row. Django stores a
  // plain LIST there, which iterates exactly like the queryset it came from —
  // so the element type is what matters, and it is resolved through the same
  // relation path the prefetch named.
  const prefetched = current.prefetchAttrs?.find(a => a.name === field);
  if (prefetched) {
    const via = resolveChain(
      ['_', ...prefetched.path.split('__')],
      { kind: 'instance', model: modelRef },
      graph,
    );
    const target = via.finalType?.model;
    return { type: target ? { kind: 'queryset', model: target } : { kind: 'primitive' } };
  }

  // 5. Reverse relations. The reverse index is dual-keyed (qualified AND
  //    bare), so whichever form `modelRef` arrives in still hits.
  const reverseRels = graph.reverseRelationsOf(modelRef);
  const reverseRel = reverseRels.find(r => r.name === field);
  if (reverseRel) {
    // O2O reverse → instance; FK / M2M reverse → manager.
    return {
      type:
        reverseRel.relationKind === 'o2o'
          ? { kind: 'instance', model: reverseRel.sourceModel }
          : { kind: 'manager', model: reverseRel.sourceModel },
    };
  }

  // Not found — error with suggestion.
  const allValid = [
    'pk',
    ...model.fields.map(f => f.name),
    ...model.relations.map(r => r.fieldName),
    ...model.properties.map(p => p.name),
    ...(model.methods ?? []),
    ...(annotations ?? []).map((a: AnnotationRef) => a.name),
    ...reverseRels.map(r => r.name),
  ];
  const suggestion = findSimilar(field, allValid);

  return {
    type: null,
    error: {
      field,
      message: `'${field}' is not a field of ${modelRef}`,
      ...(suggestion ? { suggestion } : {}),
    },
  };
}

/** FK / O2O forward → instance of target; M2M forward → manager.
 *  `toModel === 'self'` points back at the declaring model. */
function resolveForwardRelation(relation: Relation, owner: Model): ResolvedType {
  const target = relation.toModel === 'self' ? `${owner.appLabel}.${owner.name}` : relation.toModel;
  if (relation.kind === 'fk' || relation.kind === 'o2o') {
    return { kind: 'instance', model: target };
  }
  return { kind: 'manager', model: target };
}

// ── Dict (e.g. .aggregate() result) access ────────────────────────────────────

function resolveDictAccess(field: string, dictKeys: readonly string[]): AccessResult {
  if (dictKeys.includes(field)) {
    return { type: { kind: 'primitive' } };
  }
  const suggestion = findSimilar(field, dictKeys);
  return {
    type: null,
    error: {
      field,
      message: `'${field}' is not a key of this dict (available: ${dictKeys.join(', ')})`,
      ...(suggestion ? { suggestion } : {}),
    },
  };
}

// ── Manager/QuerySet attribute resolution ─────────────────────────────────────

function resolveManagerAccess(
  field: string,
  modelRef: string,
  kind: 'manager' | 'queryset',
  graph: ModelGraph,
): AccessResult {
  const resolver = MANAGER_ATTRS.get(field);
  if (resolver) {
    return { type: resolver(modelRef) };
  }

  // Model field on a manager — give a specific, actionable error.
  const model = graph.resolveModel(modelRef);
  const isModelField =
    model !== undefined &&
    (graph.fieldOf(model, field) !== undefined ||
      graph.relationOf(model, field) !== undefined ||
      model.properties.some(p => p.name === field));

  const kindLabel = kind === 'queryset' ? `QuerySet[${modelRef}]` : `RelatedManager[${modelRef}]`;

  if (isModelField) {
    return {
      type: null,
      error: {
        field,
        message: `'${field}' is not accessible on ${kindLabel} — use .first to get a single instance, or iterate with {% for %}`,
      },
    };
  }

  const validAttrs = [...MANAGER_ATTRS.keys()];
  const suggestion = findSimilar(field, validAttrs);
  return {
    type: null,
    error: {
      field,
      message: `'${field}' is not a valid attribute on ${kindLabel}`,
      ...(suggestion ? { suggestion } : {}),
    },
  };
}
