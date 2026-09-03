/**
 * Context-type inference — walks a single view's source (def/class line +
 * body) and infers what Django type each context value carries.
 *
 * Port of legacy context-type-inference.ts with three adaptations:
 *   - annotations are AnnotationRef[] (serializable) instead of a Map
 *   - `return render(request, tpl, {...})` inline dicts are ALSO typed
 *     (the legacy only extracted their keys, never their types)
 *   - `return {...}` dict literals are typed too — that is how same-file
 *     helper bodies (view-context/helper-keys.ts) expose their values
 *
 * Detected value shapes:
 *   Model.objects.<qs-method>(...)          → queryset (+ annotations/values)
 *   Model.objects.get/create(...)           → instance
 *   ....first()/.last()                     → instance
 *   get_object_or_404 / get_list_or_404     → instance / queryset
 *   .aggregate(kwargs)                      → dict with those keys
 *   get_or_create / update_or_create        → tuple; deliberately untyped
 *   CBV `model = X` (+ context_object_name, get_queryset override)
 *
 * Pure domain: no vscode / fs / path imports.
 */

import type { AnnotationRef, DeferredChain, PrefetchAttr } from '$domain/types/context-var';
import type { ResolvedType } from './types';
import { contextVariableNames } from './context-keys';
import { PY_IDENT, escapeForRegExp } from '$domain/parsers/_shared/python-tokens';

// ── Patterns ──────────────────────────────────────────────────────────────────

// Model.objects.filter/all/exclude/... → queryset (whitespace-tolerant for
// multi-line joins). `aggregate` included so it reaches inferFromRHS; the
// dict-result detection then reroutes it to kind='dict'.
const MODEL_OBJECTS_QS = new RegExp(
  String.raw`(${PY_IDENT})\s*\.objects\s*\.(?:filter|all|exclude|order_by|select_related|prefetch_related|annotate|values|values_list|distinct|none|aggregate)\b`,
  'u',
);
const MODEL_OBJECTS_GET = new RegExp(String.raw`(${PY_IDENT})\s*\.objects\s*\.get\b`, 'u');
const MODEL_OBJECTS_CREATE = new RegExp(String.raw`(${PY_IDENT})\s*\.objects\s*\.create\b`, 'u');
// (instance, bool) tuple terminals — bail explicitly so MODEL_OBJECTS_QS
// doesn't wrongly classify them as querysets.
const MODEL_OBJECTS_TUPLE_TERMINAL = /\.objects\s*\.(?:get_or_create|update_or_create)\b/;
// First identifier inside the call is the model — works for bare Model and
// queryset-chain (`Product.objects.select_related(...)`) forms alike.
const GET_OBJECT_OR_404 = new RegExp(String.raw`\bget_object_or_404\s*\(\s*(${PY_IDENT})`, 'u');
const GET_LIST_OR_404 = new RegExp(String.raw`\bget_list_or_404\s*\(\s*(${PY_IDENT})`, 'u');
const ENDS_WITH_FIRST_LAST = /\.\s*(?:first|last)\s*\(\s*\)\s*$/;
/**
 * Terminals that hand back a plain value.
 *
 * `.exists()` is a bool and `.count()` an int, but the chain in FRONT of them
 * matches the queryset pattern and the terminal was never looked at — so
 * `{% if has_orders %}` was typed as a queryset of the model, offering its
 * fields on a boolean and checking attribute access against them.
 */
const ENDS_WITH_SCALAR_CALL = /\.\s*(?:exists|count)\s*\(\s*\)\s*$/;

const DICT_KEY_VALUE = new RegExp(String.raw`['"](${PY_IDENT})['"]\s*:\s*(.+)`, 'u');

/**
 * A view calls its context dict whatever it likes. context-keys.ts learned that
 * long ago — its own comment says keying off the name `context` meant
 * `ctx['a'] = 1` produced nothing at all — but the TYPES side kept the name
 * hardcoded, so any view using `ctx` got its keys listed and not one of them
 * typed. Same rule, one source, built per view from the render call.
 */
interface ContextPatterns {
  readonly assign: RegExp; // ctx['key'] = …
  readonly updateDict: RegExp; // ctx.update({ …
  readonly literal: RegExp; // ctx = { …
  readonly isName: (v: string) => boolean;
}

function contextPatterns(lines: readonly string[]): ContextPatterns {
  const names = contextVariableNames(lines.join('\n'), lines);
  const alt = [...names].map(escapeForRegExp).filter(Boolean).join('|') || 'context';
  return {
    assign: new RegExp(`^(?:${alt})\\s*\\[\\s*['"](${PY_IDENT})['"]\\s*\\]\\s*=(?!=)\\s*(.+)`, 'u'),
    updateDict: new RegExp(`^(?:${alt})\\s*(?:\\.update\\s*\\(\\s*|\\|=\\s*)\\{`, 'u'),
    literal: new RegExp(`^(?:${alt})\\s*=\\s*\\{`),
    isName: (v: string) => names.has(v),
  };
}
// render(request, 'tpl.html', { ... }) / render(request, template_name, { ... })
// — new-arch extension: type the inline dict values, not just their keys.
const RENDER_INLINE_DICT = /render\s*\(\s*\w+\s*,\s*(?:['"][^'"]+['"]|[\w.]+)\s*,\s*\{/;
// return { ... } — dict literal returned by a helper function (or a view
// slice that ends in one). `return render(...)` does NOT match: the brace
// must directly follow `return`.
const RETURN_DICT = /\breturn\s*\{/;
const VAR_ASSIGN = new RegExp(String.raw`^(${PY_IDENT})\s*=\s*(.+)`, 'u');

// CBV
const CBV_MODEL = new RegExp(String.raw`^\s*model\s*=\s*(${PY_IDENT})\s*$`, 'u');
const CBV_CONTEXT_NAME = new RegExp(
  String.raw`^\s*context_object_name\s*=\s*['"](${PY_IDENT})['"]`,
  'u',
);
const CBV_CLASS = new RegExp(String.raw`^class\s+${PY_IDENT}\s*\(([^)]*)\)\s*:`, 'u');

const LIST_VIEW_BASES = ['ListView', 'BaseListView'];

/**
 * Infer `{ context_key → ResolvedType }` from a view's source slice
 * (def/class line + body). Only model-shaped values appear in the result;
 * strings, numbers, and unknown calls are deliberately absent.
 */
export function inferContextTypes(source: string): Map<string, ResolvedType> {
  if (!source.trim()) return new Map();

  const result = new Map<string, ResolvedType>();
  const lines = source.split('\n');
  const ctx = contextPatterns(lines);

  // Phase 1: variable → type map from local assignments.
  const varTypes = new Map<string, ResolvedType>();

  for (let i = 0; i < lines.length; i++) {
    const trimmed = (lines[i] ?? '').trimStart();
    const varMatch = trimmed.match(VAR_ASSIGN);
    if (varMatch && !ctx.isName(varMatch[1]!)) {
      const varName = varMatch[1]!;
      let rhs = (varMatch[2] ?? '').trim();
      if (hasUnbalancedParens(rhs)) {
        rhs = collectBalanced(lines, i);
      }
      // `qs = qs.filter(...).annotate(...)` — refine BEFORE inferFromRHS gets a
      // chance to see nothing it recognises, and keep what the earlier
      // statement already established.
      const typeInfo = refineFromLocal(rhs, varTypes) ?? inferFromRHS(rhs);
      if (typeInfo) varTypes.set(varName, typeInfo);
    }
  }

  // Phase 2: context assignments (bracket / update-dict / render-dict / CBV).
  let inDict = false;
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = (lines[i] ?? '').trimStart();

    // context.update({...}), render(..., {...}) or return {...} —
    // possibly multi-line.
    if (
      ctx.updateDict.test(trimmed) ||
      ctx.literal.test(trimmed) ||
      RENDER_INLINE_DICT.test(trimmed) ||
      RETURN_DICT.test(trimmed)
    ) {
      inDict = true;
      braceDepth = 0;
    }

    if (inDict) {
      for (const ch of trimmed) {
        if (ch === '{') braceDepth++;
        if (ch === '}') braceDepth--;
      }

      const kvMatch = trimmed.match(DICT_KEY_VALUE);
      if (kvMatch) {
        const key = kvMatch[1]!;
        const rhs = trimEnclosingClosers(kvMatch[2] ?? '');
        const typeInfo = inferFromRHS(rhs) ?? varTypes.get(rhs) ?? deferFromLocal(rhs, varTypes);
        if (typeInfo) result.set(key, typeInfo);
      }

      if (braceDepth <= 0) inDict = false;
      continue;
    }

    // context['key'] = RHS
    const ctxMatch = trimmed.match(ctx.assign);
    if (ctxMatch) {
      const key = ctxMatch[1]!;
      let rhs = (ctxMatch[2] ?? '').trim();
      if (hasUnbalancedParens(rhs)) {
        rhs = collectBalanced(lines, i);
      }
      const typeInfo = inferFromRHS(rhs) ?? varTypes.get(rhs) ?? deferFromLocal(rhs, varTypes);
      if (typeInfo) result.set(key, typeInfo);
      continue;
    }

    // CBV: model = ModelName
    const cbvModelMatch = trimmed.match(CBV_MODEL);
    if (cbvModelMatch) {
      const modelName = cbvModelMatch[1]!;

      const classLine = findClassLine(lines, i);
      const bases = classLine ? parseClassBases(classLine) : [];
      const isList = bases.some(b => LIST_VIEW_BASES.includes(b));

      const contextName = findContextObjectName(lines, i);

      // Every CBV template gets `view` — ContextMixin.get_context_data does
      // `kwargs.setdefault("view", self)`.
      result.set('view', { kind: 'primitive' });

      if (isList) {
        // Prefer a get_queryset() override — that's where annotate/values
        // chains live in real CBVs.
        const override = findGetQuerysetReturnType(lines, i);
        const listType: ResolvedType =
          override && override.kind === 'queryset'
            ? override
            : { model: modelName, kind: 'queryset' };
        result.set('object_list', listType);
        result.set(contextName ?? `${djangoModelName(modelName)}_list`, listType);

        // Always in the context, as None when unpaginated — so neither
        // "undefined" nor "definitely a Page" is the right answer. Naming them
        // without a type is: no false warning, no invented attributes.
        result.set('paginator', { kind: 'primitive' });
        result.set('page_obj', { kind: 'primitive' });
        result.set('is_paginated', { kind: 'primitive' });
      } else {
        // Detail-like view (DetailView / UpdateView / CreateView / ...).
        // `object` is set as well as the alias — SingleObjectMixin assigns
        // both, and dropping it made `{{ object.name }}` read as undefined on
        // any view that named its object.
        const instance: ResolvedType = { model: modelName, kind: 'instance' };
        result.set('object', instance);
        result.set(contextName ?? djangoModelName(modelName), instance);
      }
    }
  }

  return result;
}

/**
 * Django's `Options.model_name` — `self.object_name.lower()`, and nothing else.
 *
 * No CamelCase splitting: `BlogPost` becomes `blogpost`, NOT `blog_post`. Only
 * `verbose_name` splits words, and confusing the two invents a context key that
 * does not exist while missing the one that does.
 */
function djangoModelName(className: string): string {
  return className.toLowerCase();
}

// ── RHS classification ────────────────────────────────────────────────────────

function inferFromRHS(rhs: string): ResolvedType | null {
  // get_object_or_404 — terminal, always a single instance. Must run BEFORE
  // MODEL_OBJECTS_QS or the queryset arg inside the call would win.
  const goorMatch = rhs.match(GET_OBJECT_OR_404);
  if (goorMatch) return { model: goorMatch[1]!, kind: 'instance' };

  const glorMatch = rhs.match(GET_LIST_OR_404);
  if (glorMatch) return { model: glorMatch[1]!, kind: 'queryset' };

  const getMatch = rhs.match(MODEL_OBJECTS_GET);
  if (getMatch) return { model: getMatch[1]!, kind: 'instance' };

  const createMatch = rhs.match(MODEL_OBJECTS_CREATE);
  if (createMatch) return { model: createMatch[1]!, kind: 'instance' };

  // get_or_create / update_or_create return an (instance, bool) tuple —
  // bail before MODEL_OBJECTS_QS mislabels them.
  if (MODEL_OBJECTS_TUPLE_TERMINAL.test(rhs)) return null;

  // Checked before the queryset pattern, which matches the chain in front of
  // these terminals and would claim the whole expression is a queryset —
  // including `Product.objects.exists()`, where the chain is only `.objects`.
  if (ENDS_WITH_SCALAR_CALL.test(rhs)) {
    return { kind: 'primitive' };
  }

  const qsMatch = rhs.match(MODEL_OBJECTS_QS);
  if (qsMatch) {
    const model = qsMatch[1]!;

    // `.aggregate(...)` short-circuits queryset semantics — a single dict
    // keyed by the aggregate kwargs.
    const aggregateKeys = parseAggregateKeys(rhs);
    if (aggregateKeys.length > 0) {
      return { kind: 'dict', dictKeys: aggregateKeys };
    }

    if (ENDS_WITH_FIRST_LAST.test(rhs)) {
      return { model, kind: 'instance' };
    }

    const opaque = opaqueRowType(rhs);
    if (opaque) return opaque;

    const annotations = parseAnnotations(rhs);
    const valuesFields = parseValuesFields(rhs);
    const prefetchAttrs = parsePrefetchAttrs(rhs);
    return {
      model,
      kind: 'queryset',
      ...(annotations.length > 0 ? { annotations } : {}),
      ...(valuesFields.length > 0 ? { valuesFields } : {}),
      ...(prefetchAttrs.length > 0 ? { prefetchAttrs } : {}),
    };
  }

  return null;
}

/**
 * `qs = qs.filter(...).annotate(n=Count('x'))` — a queryset built up over
 * several statements, which is how any non-trivial view composes one.
 *
 * inferFromRHS only recognises `Model.objects…`, so the second statement
 * matched nothing and the variable kept its ORIGINAL type: every annotation
 * added after the first line was silently dropped, and `{{ o.n }}` in the
 * template read as a field that does not exist.
 *
 * Only the case where the local is CALLED straight away — an uncalled hop is a
 * relation walk, which needs the graph and is deferFromLocal's job.
 */
function refineFromLocal(
  rhs: string,
  varTypes: ReadonlyMap<string, ResolvedType>,
): ResolvedType | null {
  const m = /^(\w+)\s*\.\s*(\w+)\s*\(/.exec(rhs);
  if (!m) return null;

  const base = varTypes.get(m[1]!);
  if (!base?.model) return null;
  if (base.kind !== 'queryset' && base.kind !== 'manager' && base.kind !== 'instance') return null;

  // Every called method must be one we understand, or the resulting shape is a
  // guess and the earlier type is the safer answer.
  //
  // `values()` is allowed HERE and refused by deferFromLocal on purpose: the
  // base is already a queryset of a known model and parseValuesFields records
  // exactly which fields survive the projection, whereas a relation walk
  // carries no projection and would end up claiming the whole model.
  let terminal: 'queryset' | 'instance' | undefined;
  for (const call of rhs.matchAll(/\.\s*(\w+)\s*\(/g)) {
    const name = call[1]!;
    const step =
      QS_TAIL.get(name) ??
      (name === 'values' || name === 'values_list' ? ('queryset' as const) : undefined);
    if (!step) return null;
    terminal = step;
  }
  if (!terminal) return null;

  const merge = <T>(a: readonly T[] | undefined, b: readonly T[]): readonly T[] | undefined => {
    const all = [...(a ?? []), ...b];
    return all.length > 0 ? all : undefined;
  };
  const annotations = merge(base.annotations, parseAnnotations(rhs));
  const valuesFields = merge(base.valuesFields, parseValuesFields(rhs));

  return {
    kind: terminal,
    model: base.model,
    ...(annotations !== undefined ? { annotations } : {}),
    ...(valuesFields !== undefined ? { valuesFields } : {}),
  };
}

// ── Walks off a local ─────────────────────────────────────────────────────────

/** Trailing Python queryset calls, and what each leaves behind. Absent names
 *  (`values`, `aggregate`, `count`) are deliberately NOT guessed — their result
 *  is a projection or a number, and claiming a model shape would invent fields
 *  the template does not have. */
const QS_TAIL: ReadonlyMap<string, 'queryset' | 'instance'> = new Map([
  ['all', 'queryset'],
  ['filter', 'queryset'],
  ['exclude', 'queryset'],
  ['order_by', 'queryset'],
  ['select_related', 'queryset'],
  ['prefetch_related', 'queryset'],
  ['distinct', 'queryset'],
  ['reverse', 'queryset'],
  ['annotate', 'queryset'],
  ['only', 'queryset'],
  ['defer', 'queryset'],
  ['first', 'instance'],
  ['last', 'instance'],
  ['get', 'instance'],
]);

/**
 * `context['tags'] = product.tags.all()` — a walk starting at a local whose
 * type IS known. What `product.tags` resolves to needs the model graph, which
 * this module has no business knowing about, so record the walk instead of
 * dropping the value on the floor.
 *
 * The split point is the first segment that is CALLED: everything before it is
 * a relation hop for the graph, everything from it on is a Python queryset
 * chain resolved here.
 */
function deferFromLocal(
  rhs: string,
  varTypes: ReadonlyMap<string, ResolvedType>,
): ResolvedType | null {
  const m = rhs.match(/^(\w+)((?:\s*\.\s*\w+)+)/);
  if (!m) return null;

  const rootType = varTypes.get(m[1]!);
  if (!rootType || !rootType.model) return null;
  if (rootType.kind !== 'instance' && rootType.kind !== 'queryset' && rootType.kind !== 'manager') {
    return null;
  }

  const segments = m[2]!
    .split('.')
    .map(x => x.trim())
    .filter(Boolean);
  // A segment is "called" when a `(` follows it in the source.
  const path: string[] = [];
  let tailStart = segments.length;
  let cursor = m[1]!.length;
  for (let i = 0; i < segments.length; i++) {
    const at = rhs.indexOf(segments[i]!, cursor);
    cursor = at + segments[i]!.length;
    if (/^\s*\(/.test(rhs.slice(cursor))) {
      tailStart = i;
      break;
    }
    path.push(segments[i]!);
  }
  if (path.length === 0) return null;

  let terminal: 'queryset' | 'instance' | undefined;
  for (let i = tailStart; i < segments.length; i++) {
    const step = QS_TAIL.get(segments[i]!);
    // One unknown call and the whole shape is a guess — say nothing.
    if (!step) return null;
    terminal = step;
  }

  const annotations = parseAnnotations(rhs);
  const deferred: DeferredChain = {
    rootKind: rootType.kind,
    rootModel: rootType.model,
    path,
    ...(terminal ? { terminal } : {}),
    ...(annotations.length > 0 ? { annotations } : {}),
  };
  return { kind: 'primitive', deferred };
}

/**
 * `Prefetch('pizzas', queryset=…, to_attr='veg_menu')`.
 *
 * Django hands the prefetched rows back on `veg_menu` as a plain LIST — a real
 * attribute that the model does not declare, so it read as "not a field of
 * Restaurant" on perfectly good code. The relation path comes along so the
 * element type can be resolved later, against the graph this module lacks.
 */
function parsePrefetchAttrs(rhs: string): PrefetchAttr[] {
  const out: PrefetchAttr[] = [];
  const callRe = /\bPrefetch\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = callRe.exec(rhs)) !== null) {
    const open = m.index + m[0].length - 1;
    const close = findMatchingParen(rhs, open);
    if (close === -1) continue;
    const args = splitTopLevelCommas(rhs.substring(open + 1, close)).map(a => a.trim());

    const path = /^['"]([\w.]+)['"]$/.exec(args[0] ?? '')?.[1];
    const name = args
      .map(a => /^to_attr\s*=\s*['"](\w+)['"]$/.exec(a)?.[1])
      .find((x): x is string => x !== undefined);
    if (path && name) out.push({ name, path });
  }
  return out;
}

// ── Chain-argument parsers ────────────────────────────────────────────────────

/** Union of positional string args across every `.values(...)` /
 *  `.values_list(...)` call. Chained calls reset the projection in Django,
 *  but for intellisense a field in ANY of them is reachable. */
function parseValuesFields(rhs: string): string[] {
  const out = new Set<string>();
  for (const call of valuesCalls(rhs)) {
    for (const part of splitTopLevelCommas(call.args)) {
      const trimmed = part.trim();
      const eq = topLevelEq(trimmed);
      if (eq >= 0) {
        // `values(lower=Lower('title'))` names a column too — Django adds it to
        // the row alongside the positional ones. Skipping every kwarg meant a
        // projection built only from expressions looked like no projection at
        // all, and the row was validated against the whole model.
        const name = trimmed.substring(0, eq).trim();
        if (/^[A-Za-z_]\w*$/.test(name) && !VALUES_FLAGS.has(name)) out.add(name);
        continue;
      }
      const strMatch = trimmed.match(/^['"]([\w]+)['"]$/);
      if (strMatch) out.add(strMatch[1]!);
    }
  }
  return [...out];
}

/** The kwargs that configure `values_list`, as opposed to naming a column. */
const VALUES_FLAGS: ReadonlySet<string> = new Set(['flat', 'named']);

interface ValuesCall {
  readonly listForm: boolean;
  readonly args: string;
}

function valuesCalls(rhs: string): ValuesCall[] {
  return topLevelCalls(rhs, /\.values(_list)?\s*\(/g).map(call => ({
    listForm: call.groups[1] !== undefined,
    args: call.args,
  }));
}

/**
 * What a `.values*()` call leaves the row as, when it is not a dict this tool
 * can describe.
 *
 * `values_list()` hands back TUPLES unless `named=True`, so `{{ row.id }}` on
 * one renders blank however right it looks; with `flat=True` the row is a bare
 * scalar. `values()` with no arguments projects every concrete field, with each
 * foreign key under its `<name>_id` attname — knowable, but only with the model
 * graph, which this module does not have.
 *
 * All three used to come out as a queryset of the model, so the template was
 * measured against fields the row does not carry and completion offered them.
 * Saying "a value, no further" is what this module can honestly claim.
 */
function opaqueRowType(rhs: string): ResolvedType | null {
  const calls = valuesCalls(rhs);
  const last = calls.at(-1);
  if (!last) return null;

  const kwargs = splitTopLevelCommas(last.args)
    .map(a => a.trim())
    .filter(a => topLevelEq(a) >= 0)
    .map(a => a.substring(0, topLevelEq(a)).trim());

  if (last.listForm) {
    if (kwargs.includes('named')) return null; // a Row: attribute access works
    return { kind: 'primitive' }; // a tuple, or flat: a scalar
  }
  // values() with no positional column at all.
  const positional = splitTopLevelCommas(last.args).some(a => /^\s*['"]/.test(a));
  return positional || kwargs.length > 0 ? null : { kind: 'primitive' };
}

/** `.aggregate(...)` kwarg names → dict keys. Positional args get Django's
 *  auto-generated alias via defaultAggregateName (`Avg("price")` → `price__avg`). */
function parseAggregateKeys(rhs: string): string[] {
  const out: string[] = [];
  for (const { args } of topLevelCalls(rhs, /\.aggregate\s*\(/g)) {
    for (const part of splitTopLevelCommas(args)) {
      const trimmed = part.trim();
      const eq = topLevelEq(trimmed);
      if (eq < 0) {
        const auto = defaultAggregateName(trimmed);
        if (auto) out.push(auto);
        continue;
      }
      const name = trimmed.substring(0, eq).trim();
      if (/^[A-Za-z_]\w*$/.test(name)) out.push(name);
    }
  }
  return out;
}

/** Every `.annotate(...)` call's kwargs, paren-balanced (aggregate functions
 *  carry their own arg lists). `func` is the RHS call name or 'expr'. */
function parseAnnotations(rhs: string): AnnotationRef[] {
  const byName = new Map<string, string>();
  const annotateRe = /\.annotate\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = annotateRe.exec(rhs)) !== null) {
    const openParen = m.index + m[0].length - 1;
    const closeParen = findMatchingParen(rhs, openParen);
    if (closeParen === -1) continue;
    const args = rhs.substring(openParen + 1, closeParen);
    for (const raw of splitTopLevelCommas(args)) {
      const part = raw.trim();
      if (!part) continue;
      const eq = topLevelEq(part);
      if (eq < 0) {
        // `annotate(Count("entries"))` is legal and Django names it
        // `entries__count`, exactly as in aggregate().
        const auto = defaultAggregateName(part);
        const call = part.match(/^([A-Za-z_]\w*)\s*\(/);
        if (auto && call) byName.set(auto, call[1]!);
        continue;
      }
      const name = part.substring(0, eq).trim();
      if (!/^[A-Za-z_]\w*$/.test(name)) continue;
      const expr = part.substring(eq + 1).trim();
      const callMatch = expr.match(/^([A-Za-z_]\w*)\s*\(/);
      byName.set(name, callMatch ? callMatch[1]! : 'expr');
    }
  }
  return [...byName].map(([name, func]) => ({ name, func }));
}

/**
 * Index of the `=` that separates a keyword argument, or -1.
 *
 * `indexOf('=')` found the one nested inside `Count("x", distinct=True)` and
 * read the whole thing as a malformed kwarg, so the aggregate produced no key
 * at all. Comparison operators are skipped for the same reason.
 */
function topLevelEq(text: string): number {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    else if (ch === '=' && depth === 0) {
      if (text[i + 1] === '=') {
        i++;
        continue;
      }
      if (i > 0 && ['=', '!', '<', '>'].includes(text[i - 1]!)) continue;
      return i;
    }
  }
  return -1;
}

/**
 * The name Django invents for a positional aggregate.
 *
 * `Aggregate.default_alias` is `"%s__%s" % (expression.name, name.lower())`,
 * so `Avg("price")` is read as `price__avg`. That name appears NOWHERE in the
 * source, which is why skipping these reported the only spelling that works as
 * a key that does not exist.
 */
function defaultAggregateName(expr: string): string | null {
  const m = /^(\w+)\s*\(\s*['"]([\w.]+)['"]/.exec(expr);
  if (!m) return null;
  return `${m[2]!.replace(/\./g, '__')}__${m[1]!.toLowerCase()}`;
}

// ── Text helpers ──────────────────────────────────────────────────────────────

function splitTopLevelCommas(args: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < args.length; i++) {
    const ch = args[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    else if (ch === ',' && depth === 0) {
      parts.push(args.substring(start, i));
      start = i + 1;
    }
  }
  parts.push(args.substring(start));
  return parts;
}

/** One call found in the outer chain: its capture groups and its arguments. */
interface TopLevelCall {
  readonly groups: RegExpExecArray;
  readonly args: string;
}

/**
 * Every match of `callRe` that sits in the OUTER chain of `rhs`, with the text
 * between its parentheses.
 *
 * Scanning the whole right-hand side for `.values(`, `.values_list(` or
 * `.aggregate(` and treating whatever turns up as the expression's own call is
 * what made a subquery rewrite the type of the queryset containing it:
 * `Product.objects.filter(id__in=Order.objects.values('product_id'))` reported
 * the OUTER queryset as projected to `product_id`. The same mistake reached
 * through `Prefetch(queryset=…)`, `Subquery(…)` and `exclude(…)`.
 *
 * Depth is carried forward as the regex walks, so this stays one pass over the
 * string however many calls it holds.
 */
function topLevelCalls(rhs: string, callRe: RegExp): TopLevelCall[] {
  const re = new RegExp(
    callRe.source,
    callRe.flags.includes('g') ? callRe.flags : `${callRe.flags}g`,
  );
  const out: TopLevelCall[] = [];

  let depth = 0;
  let scanned = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rhs)) !== null) {
    for (; scanned < m.index; scanned++) {
      const ch = rhs[scanned];
      if (ch === '(' || ch === '[' || ch === '{') depth++;
      else if (ch === ')' || ch === ']' || ch === '}') depth--;
    }
    if (depth !== 0) continue;

    const open = m.index + m[0].length - 1;
    const close = findMatchingParen(rhs, open);
    if (close === -1) continue;
    out.push({ groups: m, args: rhs.substring(open + 1, close) });
  }
  return out;
}

function findMatchingParen(text: string, openIdx: number): number {
  let depth = 0;
  for (let i = openIdx; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Drop the brackets that close the ENCLOSING dict or call, keeping the ones
 * the value opened itself.
 *
 * Two hand-written `.replace`s used to do this and only handled `})`, so a
 * one-line `context = {'orders': qs}` yielded the value `qs}` — which matched
 * no local and typed nothing. Counting depth is the only way to tell
 * `Count('items'))}` (keep one paren, drop the rest) from `qs}`.
 */
function trimEnclosingClosers(rhs: string): string {
  let depth = 0;
  for (let i = 0; i < rhs.length; i++) {
    const ch = rhs[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') {
      if (depth === 0) return rhs.slice(0, i).replace(/[\s,]+$/, '');
      depth--;
    }
  }
  return rhs.replace(/[\s,]+$/, '').trim();
}

function hasUnbalancedParens(text: string): boolean {
  let depth = 0;
  for (const ch of text) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
  }
  return depth > 0;
}

function collectBalanced(lines: string[], startIdx: number): string {
  let depth = 0;
  const parts: string[] = [];
  for (let i = startIdx; i < lines.length; i++) {
    const line = (lines[i] ?? '').trimStart();
    parts.push(line);
    for (const ch of line) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
    }
    if (depth <= 0 && i > startIdx) break;
  }
  return parts.join(' ');
}

// ── CBV helpers ───────────────────────────────────────────────────────────────

function findClassLine(lines: string[], currentIdx: number): string | null {
  for (let i = currentIdx - 1; i >= 0; i--) {
    const line = lines[i] ?? '';
    const trimmed = line.trimStart();
    if (CBV_CLASS.test(trimmed)) return trimmed;
    // Stop at a top-level def — we've walked out of any class.
    if (trimmed.startsWith('def ') && line.length === trimmed.length) break;
  }
  return null;
}

function parseClassBases(classLine: string): string[] {
  const m = classLine.match(CBV_CLASS);
  if (!m) return [];
  return (m[1] ?? '').split(',').map(b => b.trim());
}

/**
 * `context_object_name` anywhere in the class that declares `model`.
 *
 * The window used to be five lines above the `model =` line and ten below. A
 * docstring plus the ordinary run of CBV attributes — template_name,
 * paginate_by, ordering, allow_empty, a permission or two — pushes the
 * attribute straight out of it, and the alias the template iterates is then
 * reported as not defined in the view context: a hard warning on correct code.
 *
 * The attribute belongs to the class, so the class body is the window. It ends
 * where the indentation does, which is also where the NEXT class begins — so a
 * neighbour cannot lend its alias either.
 */
function findContextObjectName(lines: string[], modelLineIdx: number): string | null {
  let start = modelLineIdx;
  for (let i = modelLineIdx - 1; i >= 0; i--) {
    const line = lines[i] ?? '';
    const trimmed = line.trimStart();
    if (CBV_CLASS.test(trimmed)) {
      start = i + 1;
      break;
    }
    if (trimmed.startsWith('def ') && line.length === trimmed.length) break;
  }

  for (let i = start; i < lines.length; i++) {
    const line = lines[i] ?? '';
    // A non-empty line at column zero has left the class body.
    if (i > start && line.trim() !== '' && !/^\s/.test(line)) break;
    const m = line.match(CBV_CONTEXT_NAME);
    if (m) return m[1]!;
  }
  return null;
}

/** Look for a `def get_queryset(self)` override below the CBV's `model =`
 *  line (same class body) and infer its first `return <expr>` — that's
 *  where annotate / values / filter chains live in real CBVs. */
function findGetQuerysetReturnType(lines: string[], modelLineIdx: number): ResolvedType | null {
  let defLine = -1;
  let defIndent = -1;
  for (let i = modelLineIdx + 1; i < lines.length; i++) {
    const line = lines[i] ?? '';
    // Top-level definition → out of the class body.
    if (/^(def |class |async\s+def |@)/.test(line)) break;
    const m = line.match(/^(\s+)def\s+get_queryset\s*\(/);
    if (m) {
      defLine = i;
      defIndent = m[1]!.length;
      break;
    }
  }
  if (defLine === -1) return null;

  for (let i = defLine + 1; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (line.trim() === '') continue;
    const leading = line.length - line.replace(/^\s+/, '').length;
    if (leading <= defIndent) break;

    const m = line.replace(/^\s+/, '').match(/^return\s+(.+)$/);
    if (!m) continue;
    let rhs = (m[1] ?? '').trim();
    if (hasUnbalancedParens(rhs)) {
      rhs = collectBalanced(lines, i);
    }
    return inferFromRHS(rhs);
  }
  return null;
}
