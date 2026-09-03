/**
 * Template-scope type builders — {% for %} iterators, {% with %} bindings,
 * and incoming {% include 'x.html' with k=v %} kwargs.
 *
 * Port of legacy context-diagnostics.ts buildIteratorTypes /
 * buildIncludeWithTypes, decoupled from the diagnostics pass so completion,
 * hover, definition, AND diagnostics (Fase-6 part 2 adapters) can share the
 * same scope map without re-parsing.
 *
 * Pure domain: no vscode / fs / path imports.
 */

import type { ModelGraph } from './model-graph';
import type { ResolvedType } from './types';
import { resolveChain } from './chain-resolver';
import { liveTokens } from '$domain/parsers/_shared/dtl-lexer';
import type { DtlToken } from '$domain/parsers/_shared/dtl-lexer';
import { freshRegex } from '$domain/contracts/fresh-regex';
import { PY_IDENT } from '$domain/parsers/_shared/python-tokens';

// The INTERIOR of the tags this module cares about. Delimiters, whitespace
// markers and inert regions are the lexer's job — reading the raw source here
// is what let a `{% for %}` inside `{% comment %}` register its loop variable
// as a real template local.
// `\w` is `[A-Za-z0-9_]`, and a `{% for %}` target is whatever the author
// typed: Django resolves it against the context dict, which takes any key. So
// `{% for artículo in lista %}` did not match at all and the loop variable was
// never registered — and an unregistered local is an UNDEFINED one, which put a
// red squiggle under `{{ artículo.nombre }}` on correct code.
const FOR_BODY_RE = new RegExp(
  String.raw`^for\s+(${PY_IDENT}(?:\s*,\s*${PY_IDENT})*)\s+in\s+([\s\S]+)$`,
  'u',
);
const AS_ALIAS_BODY_RE = new RegExp(String.raw`\bas\s+(${PY_IDENT})$`, 'u');

// Filters that hand back the SAME elements in a different order or quantity,
// so the loop variable keeps the element type. Deliberately short: for any
// other filter the loop name is still registered (no false "undefined") but
// gets no type, because `{% for c in word|make_list %}` iterates characters,
// not whatever `word` was.
const ELEMENT_PRESERVING_FILTERS: ReadonlySet<string> = new Set([
  'slice',
  'dictsort',
  'dictsortreversed',
]);

/**
 * The resolvable part of a `{% for %}` iterable, as chain segments.
 *
 * Returns null when the expression is not a plain dotted name once a trailing
 * `reversed` and any element-preserving filters are removed — the loop names
 * are locals either way, they simply have no type to check against.
 */
function iterableChain(raw: string): string[] | null {
  const [head, ...filters] = raw.replace(/\s+reversed\s*$/, '').split('|');
  const name = (head ?? '').trim();
  if (!DOTTED_NAME_RE.test(name)) return null;
  for (const f of filters) {
    const fname = (f.split(':')[0] ?? '').trim();
    if (!ELEMENT_PRESERVING_FILTERS.has(fname)) return null;
  }
  return name.split('.');
}
const KWARG_RE = new RegExp(String.raw`(${PY_IDENT})=(\S+)`, 'gu');

/** A plain dotted name — `artículo.lista`, not an expression. */
const DOTTED_NAME_RE = new RegExp(String.raw`^${PY_IDENT}(?:\.${PY_IDENT})*$`, 'u');
// blocktrans/blocktranslate bind their own locals, visible only inside the
// block but flat here — the same simplification `with` already makes.
const KWARG_TAGS = new Set(['with', 'blocktrans', 'blocktranslate']);

/** Every live tag token of one name. */
const tagsNamed = (source: string, names: ReadonlySet<string> | string): DtlToken[] =>
  liveTokens(source).filter(
    t => t.kind === 'tag' && (typeof names === 'string' ? t.name === names : names.has(t.name)),
  );

/** The tag's own name, which the body is measured from. */
const TAG_NAME_PREFIX_RE = new RegExp(String.raw`^${PY_IDENT}\s*`, 'u');

/** `k=v k=v` pairs inside a `{% with %}` / `{% blocktrans %}` body. */
function kwargsOf(token: DtlToken): Array<{ name: string; expr: string; at: number }> {
  const body = token.inner.replace(TAG_NAME_PREFIX_RE, '');
  const bodyAt = token.innerStart + (token.inner.length - body.length);
  const re = freshRegex(KWARG_RE);
  const out: Array<{ name: string; expr: string; at: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    out.push({ name: m[1]!, expr: m[2]!, at: bodyAt + m.index });
  }
  return out;
}

/**
 * Build the map of template-local bindings for one template source:
 *
 *   {% for item in items %}        → item: instance of items' model
 *   {% for x in obj.related_set %} → dotted iterables resolve via the chain
 *   {% with k=expr %}              → k typed from resolving expr
 *
 * Iterators inherit the queryset's annotations / values() projection so
 * `{{ item.annotation_name }}` validates. `with` is range-scoped in Django
 * but this map is flat — callers gate on context membership BEFORE
 * consulting it, so out-of-scope access still reads as undefined.
 */
/** One `{% for %}` tag, as read from the source. */
export interface ForLoop {
  /** Names bound by the loop, in order. */
  readonly iterators: readonly string[];
  /** The iterable expression exactly as written, filters and all. */
  readonly raw: string;
  /** The resolvable chain segments, or null when the expression is not a
   *  plain dotted name once modifiers and filters are accounted for. */
  readonly chain: readonly string[] | null;
  /** Absolute offset of the iterable within the source. */
  readonly offset: number;
}

/**
 * Every `{% for %}` in a template. The single reader of the tag — callers that
 * grew their own copy of this regex are how the grammar came to be understood
 * three slightly different ways.
 */
export function forLoops(templateSource: string): ForLoop[] {
  const out: ForLoop[] = [];
  for (const token of tagsNamed(templateSource, 'for')) {
    const m = FOR_BODY_RE.exec(token.inner);
    if (!m) continue;
    const raw = m[2]!;
    out.push({
      iterators: m[1]!.split(',').map(v => v.trim()),
      raw,
      chain: iterableChain(raw),
      offset: token.innerStart + token.inner.lastIndexOf(raw),
    });
  }
  return out;
}

export function buildIteratorTypes(
  templateSource: string,
  contextTypes: ReadonlyMap<string, ResolvedType>,
  graph: ModelGraph,
): Map<string, ResolvedType> {
  const iteratorTypes = new Map<string, ResolvedType>();

  // `{% with %}` used to be bound AFTER every `{% for %}`, so a loop over a
  // with-binding — `{% with prod=order.product %}{% for t in prod.tags.all %}`
  // — found no root for `prod` and left `t` untyped: a `{{ t.nme }}` typo
  // inside the loop went unreported, silently. Binding `with` first only moves
  // the hole, because a `{% with x=item.name %}` inside a loop needs `item`.
  //
  // Neither order is right, so neither is imposed: both are bound repeatedly
  // until nothing new appears. Two rounds cover every shape seen in practice
  // and a third is cheap insurance; the loop stops as soon as a round adds
  // nothing, which is the first round on almost every template.
  for (let round = 0; round < 3; round++) {
    const before = iteratorTypes.size;
    bindLoopVariables(templateSource, contextTypes, graph, iteratorTypes);
    bindWithVariables(templateSource, contextTypes, graph, iteratorTypes);
    if (iteratorTypes.size === before) break;
  }

  return iteratorTypes;
}

/** Bind every `{% for x in … %}` iterator whose iterable can be resolved. */
function bindLoopVariables(
  templateSource: string,
  contextTypes: ReadonlyMap<string, ResolvedType>,
  graph: ModelGraph,
  iteratorTypes: Map<string, ResolvedType>,
): void {
  for (const loop of forLoops(templateSource)) {
    const iterableParts = loop.chain;
    if (!iterableParts) continue;
    const iterators = loop.iterators;
    const iterableRoot = iterableParts[0]!;

    const rootType = contextTypes.get(iterableRoot) ?? iteratorTypes.get(iterableRoot);
    if (!rootType) continue;

    // Resolve the iterable (single or dotted) through the chain resolver so
    // manager-attr hops (`orders.all`) preserve annotations / projections.
    const resolved = resolveChain(iterableParts, rootType, graph);
    const iterableType = resolved.finalType;
    if (!iterableType) continue;

    if (
      (iterableType.kind === 'queryset' || iterableType.kind === 'manager') &&
      iterableType.model
    ) {
      // Dotted access to a related set produces a NEW queryset — resolveChain
      // already drops annotations/projections when the model changes; here we
      // trust whatever survived.
      for (const iter of iterators) {
        iteratorTypes.set(iter, {
          kind: 'instance',
          model: iterableType.model,
          ...(iterableType.annotations ? { annotations: iterableType.annotations } : {}),
          ...(iterableType.valuesFields ? { valuesFields: iterableType.valuesFields } : {}),
          // A Prefetch(to_attr=…) puts its attribute on each ROW, so it travels
          // with the loop variable, not with the queryset it came from.
          ...(iterableType.prefetchAttrs ? { prefetchAttrs: iterableType.prefetchAttrs } : {}),
        });
      }
    }
  }
}

/**
 * `{% with k=v %}` bindings — Django requires `name=value` with NO whitespace
 * inside value, which keeps the kwarg regex simple.
 */
function bindWithVariables(
  templateSource: string,
  contextTypes: ReadonlyMap<string, ResolvedType>,
  graph: ModelGraph,
  iteratorTypes: Map<string, ResolvedType>,
): void {
  for (const token of tagsNamed(templateSource, KWARG_TAGS)) {
    for (const kv of kwargsOf(token)) {
      bindExpr(kv.name, kv.expr, contextTypes, iteratorTypes, graph);
    }
  }
}

/**
 * Inject incoming `{% include 'X' with k=v %}` kwargs into `iteratorTypes`
 * (mutates). `kwargs` are the pairs collected from every parent template
 * that includes the ACTIVE template; each expr is resolved against the
 * active view's context — Live Mode already picked which view applies, so
 * last-write-wins across multiple includers is the intended behavior.
 */
export function applyIncludeWithKwargs(
  kwargs: readonly { readonly name: string; readonly expr: string }[],
  contextTypes: ReadonlyMap<string, ResolvedType>,
  iteratorTypes: Map<string, ResolvedType>,
  graph: ModelGraph,
): void {
  for (const kw of kwargs) {
    bindExpr(kw.name, kw.expr, contextTypes, iteratorTypes, graph);
  }
}

/**
 * All names the template binds LOCALLY — for-loop iterators and with-binding
 * names — regardless of whether their RHS resolved to a type. The
 * diagnostics pass needs these so an iterator over an unknown iterable
 * (`{% for x in missing %}` → `{{ x }}`) doesn't ALSO get flagged: the
 * actionable problem is `missing`, not `x`.
 */
/**
 * Where a template-local name came from, for callers that have a name but no
 * type — an untyped iterable still makes `{% for tag in tags %}` worth
 * explaining, and saying nothing at all reads as "this variable is unknown".
 */
export interface LocalOrigin {
  readonly kind: 'loop' | 'with';
  /** For a loop: the expression being iterated. For `with`: the bound value. */
  readonly source: string;
}

export function findLocalOrigin(templateSource: string, name: string): LocalOrigin | null {
  for (const loop of forLoops(templateSource)) {
    if (loop.iterators.includes(name)) return { kind: 'loop', source: loop.raw };
  }
  for (const token of tagsNamed(templateSource, KWARG_TAGS)) {
    for (const kv of kwargsOf(token)) {
      if (kv.name === name) return { kind: 'with', source: kv.expr };
    }
  }
  return null;
}

export function collectTemplateLocalNames(templateSource: string): Set<string> {
  const names = new Set<string>();

  for (const loop of forLoops(templateSource)) {
    for (const iter of loop.iterators) names.add(iter);
  }
  for (const token of tagsNamed(templateSource, KWARG_TAGS)) {
    for (const kv of kwargsOf(token)) names.add(kv.name);
  }
  // `{% anything … as name %}` — how a custom tag returns a value, and what
  // `{% regroup … as grouped %}` produces. A local from there on.
  for (const token of liveTokens(templateSource)) {
    if (token.kind !== 'tag') continue;
    const alias = AS_ALIAS_BODY_RE.exec(token.inner);
    if (alias) names.add(alias[1]!);
  }

  return names;
}

/** Shared by with-bindings and include-with kwargs: resolve `expr` against
 *  the known bindings and store the result under `name`. Literals and
 *  unresolvable roots are skipped; managers are coerced to querysets
 *  (a bound related-set behaves like one in templates). */
function bindExpr(
  name: string,
  expr: string,
  contextTypes: ReadonlyMap<string, ResolvedType>,
  iteratorTypes: Map<string, ResolvedType>,
  graph: ModelGraph,
): void {
  // Skip literals — strings ('x' / "x") and numbers carry no type info.
  if (/^["'\d]/.test(expr)) return;

  const parts = expr.split('.');
  const root = parts[0]!;
  const binding = contextTypes.get(root) ?? iteratorTypes.get(root);
  if (!binding) return;

  const resolved = resolveChain(parts, binding, graph);
  const t = resolved.finalType;
  if (!t || (!t.model && t.kind !== 'dict')) return;

  iteratorTypes.set(name, {
    kind: t.kind === 'manager' ? 'queryset' : t.kind,
    ...(t.model ? { model: t.model } : {}),
    ...(t.annotations ? { annotations: t.annotations } : {}),
    ...(t.valuesFields ? { valuesFields: t.valuesFields } : {}),
    ...(t.dictKeys ? { dictKeys: t.dictKeys } : {}),
  });
}
