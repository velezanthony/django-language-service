/**
 * Completion entries — pure data the completion adapter maps to
 * vscode.CompletionItem. Port of legacy completion-provider.ts
 * instanceCompletions / managerCompletions / dictCompletions plus the
 * tryFormCompletion heuristic + formFieldCompletions.
 *
 * Pure domain: no vscode / fs / path imports.
 */

import type { Form } from '$domain/types/form';
import type { ContextVar } from '$domain/types/context-var';
import type { ModelGraph } from './model-graph';
import type { ResolvedType } from './types';
import { MANAGER_ATTRS } from './chain-resolver';
import { choiceValues } from '$domain/types/choice';
import { collectTemplateLocalNames } from './template-scope';

export type CompletionEntryKind =
  | 'field' // scalar model field
  | 'relation' // forward FK / O2O / M2M
  | 'property' // @property
  | 'annotation' // .annotate() synthetic field
  | 'reverse' // reverse relation accessor
  | 'manager-attr' // all / count / exists / first / last / none
  | 'dict-key' // .aggregate() result key
  | 'form-field' // declared form field or Meta.fields entry
  | 'form-attr' // errors / as_p / ...
  | 'context-var' // a key the view puts in the context
  | 'template-local' // {% for %} / {% with %} / {% ... as x %} binding
  | 'choice-display' // get_<field>_display
  | 'method'; // zero-argument model method

export interface CompletionEntry {
  readonly label: string;
  readonly kind: CompletionEntryKind;
  readonly detail: string;
  /** Hint for the adapter to push the entry below fields (sortText z_). */
  readonly sortLast?: boolean;
}

const MANAGER_ATTR_DESCRIPTIONS: Record<string, (model: string) => string> = {
  all: m => `QuerySet[${m}] — all objects`,
  count: () => 'int — number of objects',
  exists: () => 'bool — any objects exist?',
  first: m => `${m} | None — first object`,
  last: m => `${m} | None — last object`,
  none: m => `QuerySet[${m}] — empty queryset`,
};

const RELATION_KIND_LABEL: Record<string, string> = {
  fk: 'ForeignKey',
  o2o: 'OneToOneField',
  m2m: 'ManyToManyField',
};

/**
 * Entries for the type a dotted chain resolved to. The adapter calls
 * resolveChain first, then feeds `finalType` here.
 */
export function buildChainEntries(resolved: ResolvedType, graph: ModelGraph): CompletionEntry[] {
  if (resolved.kind === 'dict') {
    return (resolved.dictKeys ?? []).map(key => ({
      label: key,
      kind: 'dict-key' as const,
      detail: 'dict key',
    }));
  }

  if (resolved.kind === 'manager' || resolved.kind === 'queryset') {
    const modelRef = resolved.model ?? '';
    return [...MANAGER_ATTRS.keys()].map(attr => ({
      label: attr,
      kind: 'manager-attr' as const,
      detail: MANAGER_ATTR_DESCRIPTIONS[attr]?.(modelRef) ?? attr,
    }));
  }

  if (resolved.kind !== 'instance' || !resolved.model) return [];

  const model = graph.resolveModel(resolved.model);
  if (!model) return [];

  const entries: CompletionEntry[] = [];
  const annotations = resolved.annotations ?? [];

  // values()/values_list() narrows the surface to exactly the projection.
  if (resolved.valuesFields !== undefined && resolved.valuesFields.length > 0) {
    for (const key of resolved.valuesFields) {
      const field = graph.fieldOf(model, key);
      entries.push({
        label: key,
        kind: 'field',
        detail: field ? `${field.fieldType} (.values projection)` : '.values projection',
      });
    }
    for (const a of annotations) {
      entries.push({ label: a.name, kind: 'annotation', detail: `annotation (${a.func})` });
    }
    return entries;
  }

  for (const field of model.fields) {
    entries.push({ label: field.name, kind: 'field', detail: field.fieldType });
  }

  for (const rel of model.relations) {
    const target = rel.toModel === 'self' ? `${model.appLabel}.${model.name}` : rel.toModel;
    const shape = rel.kind === 'm2m' ? 'Manager' : 'Instance';
    entries.push({
      label: rel.fieldName,
      kind: 'relation',
      detail: `${RELATION_KIND_LABEL[rel.kind]} → ${target} (${shape})`,
    });
  }

  for (const { name: prop } of model.properties) {
    entries.push({ label: prop, kind: 'property', detail: '@property' });
  }

  // Attributes Django synthesizes. resolveChain already ACCEPTS all of these,
  // so leaving them out of the suggestions meant the editor knew they were
  // valid and still declined to mention them.
  for (const field of model.fields) {
    if (!field.choices) continue;
    const shown = choiceValues(field.choices).map(c => c.label ?? c.value);
    entries.push({
      label: `get_${field.name}_display`,
      kind: 'choice-display',
      detail:
        shown.length > 0
          ? `label for ${field.name} — ${shown.join(' / ')}`
          : `label for ${field.name}`,
    });
  }

  if (!model.fields.some(f => f.isPrimaryKey) && !model.compositePrimaryKey?.length) {
    entries.push({ label: 'id', kind: 'field', detail: 'AutoField (implicit primary key)' });
  }
  entries.push({ label: 'pk', kind: 'field', detail: 'primary key alias' });

  for (const method of model.methods ?? []) {
    entries.push({ label: method, kind: 'method', detail: 'method() — called with no arguments' });
  }

  for (const a of annotations) {
    entries.push({ label: a.name, kind: 'annotation', detail: `annotation (${a.func})` });
  }

  for (const rev of graph.reverseRelationsOf(resolved.model)) {
    const shape = rev.relationKind === 'o2o' ? 'Instance' : 'Manager';
    entries.push({
      label: rev.name,
      kind: 'reverse',
      detail: `← ${rev.sourceModel} (${shape})`,
    });
  }

  return entries;
}

// ── Form completion (legacy tryFormCompletion heuristic) ──────────────────────

/**
 * Match a template root var against the known forms by naming convention:
 * `form`, `product` / `product_form` (for ProductForm), or camelCase
 * `productForm`. First match wins — same as legacy iteration order.
 */
export function matchFormVar(rootVar: string, forms: readonly Form[]): Form | undefined {
  const normalizedVar = rootVar.toLowerCase();
  for (const form of forms) {
    const normalizedFormName = form.name.replace(/Form$/, '').toLowerCase();
    if (
      normalizedVar === 'form' ||
      normalizedVar === normalizedFormName ||
      normalizedVar === `${normalizedFormName}_form` ||
      rootVar === form.name.charAt(0).toLowerCase() + form.name.slice(1)
    ) {
      return form;
    }
  }
  return undefined;
}

/** Standard BoundForm attributes every Django form exposes in templates. */
const FORM_ATTRS = [
  'errors',
  'non_field_errors',
  'is_valid',
  'cleaned_data',
  'as_p',
  'as_table',
  'as_ul',
  'media',
] as const;

/**
 * Entries for `{{ form.| }}`: declared fields, then Meta.fields resolved
 * through the bound model (`__all__` expands to every model field), then
 * the standard form attributes sorted last.
 */
export function buildFormFieldEntries(form: Form, graph: ModelGraph): CompletionEntry[] {
  const entries: CompletionEntry[] = [];

  for (const field of form.fields) {
    entries.push({
      label: field.name,
      kind: 'form-field',
      detail: `${field.fieldType} (${form.name})`,
    });
  }

  if (form.modelRef && form.metaFields && form.metaFields.length > 0) {
    const model = graph.resolveModel(form.modelRef);
    if (model) {
      const isAll = form.metaFields[0] === '__all__';
      const allowed = isAll
        ? [...model.fields.map(f => f.name), ...model.relations.map(r => r.fieldName)]
        : form.metaFields;

      for (const fieldName of allowed) {
        // Declared form fields override Meta.fields entries.
        if (form.fields.some(f => f.name === fieldName)) continue;

        const modelField = graph.fieldOf(model, fieldName);
        const relation = graph.relationOf(model, fieldName);
        if (modelField) {
          entries.push({
            label: fieldName,
            kind: 'form-field',
            detail: `${modelField.fieldType} (from ${form.modelRef})`,
          });
        } else if (relation) {
          entries.push({
            label: fieldName,
            kind: 'form-field',
            detail: `${RELATION_KIND_LABEL[relation.kind]} (from ${form.modelRef})`,
          });
        }
      }
    }
  }

  for (const attr of FORM_ATTRS) {
    entries.push({ label: attr, kind: 'form-attr', detail: 'Form attribute', sortLast: true });
  }

  return entries;
}

// ── Root level ────────────────────────────────────────────────────────────────

/**
 * Everything nameable at the start of an expression: the view's context keys
 * plus every name the template binds itself.
 *
 * Lives here, not in the adapter, because three features answer "is this name
 * in scope?" — completion, diagnostics and hover — and they must not disagree.
 * They did: the adapter listed only locals that had been given a TYPE, so
 * `{% for tag in tags %}` over an untyped iterable offered no `tag` at all,
 * while diagnostics accepted it and hover explained it.
 */
export function buildRootEntries(
  contextVars: readonly ContextVar[],
  templateSource: string,
  iteratorTypes: ReadonlyMap<string, ResolvedType>,
): CompletionEntry[] {
  const entries: CompletionEntry[] = [];
  const taken = new Set<string>();

  for (const v of contextVars) {
    taken.add(v.name);
    const bits: string[] = [];
    if (v.kind !== 'scalar') bits.push(v.typeRef ? `${v.kind}: ${v.typeRef}` : v.kind);
    if (v.conditional) bits.push('not always available');
    entries.push({
      label: v.name,
      kind: 'context-var',
      detail: bits.join(' · ') || 'context',
      // A key that is only sometimes present belongs below the ones that always are.
      ...(v.conditional ? { sortLast: true } : {}),
    });
  }

  // Typed locals — the for-loop shadows a context var by intent, so a second
  // entry under the same name would only be noise.
  for (const [name, type] of iteratorTypes) {
    if (taken.has(name)) continue;
    taken.add(name);
    entries.push({
      label: name,
      kind: 'template-local',
      detail: `${type.kind}${type.model ? `: ${type.model}` : ''} · template-local`,
    });
  }

  // Untyped locals. An unresolved iterable does not make the loop variable any
  // less real, and leaving it out is what sent users looking for a name the
  // editor had decided not to mention.
  for (const name of collectTemplateLocalNames(templateSource)) {
    if (taken.has(name)) continue;
    taken.add(name);
    entries.push({ label: name, kind: 'template-local', detail: 'template-local' });
  }

  return entries;
}
