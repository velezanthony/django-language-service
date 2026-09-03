/**
 * diagnoseTemplate — the pure diagnostics core for Live Mode context
 * validation. Port of legacy context-diagnostics.ts diagnoseContext,
 * recomposed on top of the new-arch pieces:
 *
 *   - parseTemplateVariables ($domain/parsers/template-variables) is the
 *     single source of `{{ var }}` / tag-expression extraction. It was
 *     dead code until this module — the adapter used to carry its own
 *     simplified regexes; those are gone now (one source of truth).
 *   - buildIteratorTypes / applyIncludeWithKwargs provide the template's
 *     local scope; collectTemplateLocalNames covers UNTYPED locals.
 *   - resolveChain validates dotted access hop by hop.
 *
 * Pure domain: no vscode / fs / path imports. Lines/cols are 1-based
 * (adapter converts to vscode 0-based ranges).
 */

import { parseTemplateVariables } from '$domain/parsers/template-variables';
import { offsetMapper } from '$domain/parsers/_shared/offsets';
import type { ContextVar } from '$domain/types/context-var';
import type { ModelGraph } from './model-graph';
import type { ResolvedType } from './types';
import { contextVarToResolvedType } from './context-vars';
import { resolveChain } from './chain-resolver';
import {
  buildIteratorTypes,
  applyIncludeWithKwargs,
  collectTemplateLocalNames,
  forLoops,
} from './template-scope';
import { findSimilar } from './find-similar';

/** DTL builtins + context processors that must never be flagged. */
export const DTL_BUILTIN_VARS: ReadonlySet<string> = new Set([
  'forloop',
  'block',
  'loop',
  'True',
  'False',
  'None',
  'now',
  'request',
  'user',
  'perms',
  'messages',
  'STATIC_URL',
  'MEDIA_URL',
  'DEBUG',
  'csrf_token',
  'LANGUAGE_CODE',
  'LANGUAGES',
  'LANGUAGE_BIDI',
]);

export type ContextDiagnosticCode =
  'undefined-variable' | 'conditional-variable' | 'invalid-chain' | 'manager-not-iterable';

export interface ContextDiagnostic {
  /** Full expression as written ('product.nme') or the root for
   *  undefined-variable diagnostics. */
  readonly variable: string;
  /** Root identifier — what the adapter should locate in the line text. */
  readonly root: string;
  /** 1-based line number. */
  readonly line: number;
  /** 1-based column of the expression start. */
  readonly col: number;
  readonly severity: 'warning' | 'info';
  readonly message: string;
  readonly suggestion?: string;
  readonly code: ContextDiagnosticCode;
}

export interface DiagnoseTemplateOptions {
  readonly templateSource: string;
  readonly contextVars: readonly ContextVar[];
  readonly graph: ModelGraph;
  /** Incoming `{% include 'this-template' with k=v %}` kwargs collected
   *  from parent templates — each becomes a local binding. */
  readonly incomingKwargs?: readonly { readonly name: string; readonly expr: string }[];
  /**
   * The view's context list is known to be partial — it injects keys in a
   * shape the reader could not follow, or a helper/mixin it uses was never
   * found. A name missing from a partial list is this tool's gap, not the
   * user's mistake, so it is reported as a note rather than a warning.
   *
   * Chain errors are unaffected: those are about a variable we DO have.
   */
  readonly contextIncomplete?: boolean;
}

/** Heuristic from legacy: skip the "undefined" warning while the user is
 *  CLEARLY mid-typing — the partial is a prefix of a known name with at
 *  least this many characters still missing. A 1-2 char gap reads like an
 *  abandoned typo and keeps the warning. */
const TYPING_GAP_MIN = 3;

/**
 * `{% for t in order.tags %}` — iterating a related manager.
 *
 * A Manager has no `__iter__`, so the for tag's `list(values)` raises TypeError
 * and the page returns a 500. The fix is always the same `.all`, and the two
 * spellings look identical, so this is worth saying out loud rather than
 * leaving to a stack trace in production.
 */
function iterableManagerErrors(
  templateSource: string,
  contextTypes: ReadonlyMap<string, ResolvedType>,
  iteratorTypes: ReadonlyMap<string, ResolvedType>,
  graph: ModelGraph,
): ContextDiagnostic[] {
  const at = offsetMapper(templateSource);
  const found: ContextDiagnostic[] = [];

  for (const loop of forLoops(templateSource)) {
    if (!loop.chain || loop.chain.length === 0) continue;
    // A loop variable as well as a context key: `{% for p in places %}` then
    // `{% for z in p.pizzas %}` is the commonest shape this mistake takes, and
    // looking only at context keys missed all of it.
    const root = iteratorTypes.get(loop.chain[0]!) ?? contextTypes.get(loop.chain[0]!);
    if (!root) continue;
    const finalType = resolveChain(loop.chain, root, graph).finalType;
    if (finalType?.kind !== 'manager') continue;

    const pos = at(loop.offset);
    found.push({
      variable: loop.raw,
      root: loop.chain[0]!,
      line: pos.line,
      col: pos.col,
      severity: 'warning',
      message: `'${loop.raw}' is a related manager, which cannot be iterated — use '${loop.raw}.all'`,
      suggestion: `${loop.raw}.all`,
      code: 'manager-not-iterable',
    });
  }
  return found;
}

export function diagnoseTemplate(opts: DiagnoseTemplateOptions): ContextDiagnostic[] {
  const { templateSource, contextVars, graph } = opts;
  if (!templateSource.trim()) return [];

  const parsed = parseTemplateVariables(templateSource);
  if (!parsed.ok) return [];

  // ── Context surface ──────────────────────────────────────────────────────
  const contextNames = new Set<string>();
  const conditionalNames = new Set<string>();
  const contextTypes = new Map<string, ResolvedType>();
  for (const cv of contextVars) {
    if (cv.conditional) {
      conditionalNames.add(cv.name);
      continue; // conditional keys are NOT "defined" — they downgrade to info
    }
    contextNames.add(cv.name);
    const t = contextVarToResolvedType(cv, graph);
    if (t) contextTypes.set(cv.name, t);
  }

  // ── Template-local scope ─────────────────────────────────────────────────
  // Incoming `{% include … with k=v %}` values are resolved FIRST, so they are
  // roots when the template's own scope is built and are in place before the
  // manager checks run. They used to be injected after both, which meant that
  // inside a partial nothing written in terms of an incoming value was checked
  // at all — not even `manager-not-iterable`, which is a 500 in production.
  const incoming = new Map<string, ResolvedType>();
  if (opts.incomingKwargs && opts.incomingKwargs.length > 0) {
    applyIncludeWithKwargs(opts.incomingKwargs, contextTypes, incoming, graph);
  }
  const scopeRoots: ReadonlyMap<string, ResolvedType> =
    incoming.size > 0 ? new Map([...contextTypes, ...incoming]) : contextTypes;

  const iteratorTypes = buildIteratorTypes(templateSource, scopeRoots, graph);
  for (const [name, type] of incoming) {
    if (!iteratorTypes.has(name)) iteratorTypes.set(name, type);
  }

  const out: ContextDiagnostic[] = iterableManagerErrors(
    templateSource,
    scopeRoots,
    iteratorTypes,
    graph,
  );
  const localNames = collectTemplateLocalNames(templateSource);
  // Include-with kwarg names are locals even when their expr didn't resolve.
  for (const kw of opts.incomingKwargs ?? []) localNames.add(kw.name);
  for (const name of iteratorTypes.keys()) localNames.add(name);

  // Names the user might be mid-typing towards.
  const knownNames = new Set<string>([...contextNames, ...localNames, ...conditionalNames]);
  const isPartialOfKnown = (name: string): boolean => {
    if (name.length < 2) return false;
    for (const known of knownNames) {
      if (known === name || !known.startsWith(name)) continue;
      if (known.length - name.length >= TYPING_GAP_MIN) return true;
    }
    return false;
  };

  // ── Walk every reference ─────────────────────────────────────────────────
  const diagnostics: ContextDiagnostic[] = [...out];
  const contextNameList = [...contextNames];

  for (const ref of parsed.value) {
    const root = ref.name;
    if (DTL_BUILTIN_VARS.has(root)) continue;

    const isLocal = localNames.has(root);
    const fullName = ref.chain.length > 0 ? `${root}.${ref.chain.join('.')}` : root;

    // Undefined root — locals and context names are fine; conditionals
    // downgrade to info; typing-in-progress prefixes are swallowed.
    if (!isLocal && !contextNames.has(root)) {
      if (ref.chain.length === 0 && isPartialOfKnown(root)) continue;

      if (conditionalNames.has(root)) {
        diagnostics.push({
          variable: root,
          root,
          line: ref.line,
          col: ref.col,
          severity: 'info',
          message: `'${root}' — not always available (injected conditionally)`,
          code: 'conditional-variable',
        });
        continue;
      }

      const suggestion = findSimilar(root, contextNameList);
      if (opts.contextIncomplete) {
        diagnostics.push({
          variable: root,
          root,
          line: ref.line,
          col: ref.col,
          severity: 'info',
          message: `'${root}' was not found in the view context — the view builds it in a way this extension cannot read, so it may well be fine`,
          ...(suggestion ? { suggestion } : {}),
          code: 'undefined-variable',
        });
        continue;
      }
      diagnostics.push({
        variable: root,
        root,
        line: ref.line,
        col: ref.col,
        severity: 'warning',
        message: `'${root}' is not defined in the view context`,
        ...(suggestion ? { suggestion } : {}),
        code: 'undefined-variable',
      });
      continue;
    }

    // Deep chain validation — needs a typed root (iterator shadows context).
    if (ref.chain.length === 0) continue;
    const rootType = iteratorTypes.get(root) ?? contextTypes.get(root);
    if (!rootType) continue;

    const result = resolveChain([root, ...ref.chain], rootType, graph);
    if (result.error) {
      diagnostics.push({
        variable: fullName,
        root,
        line: ref.line,
        col: ref.col,
        severity: 'warning',
        message: result.error.message,
        ...(result.error.suggestion ? { suggestion: result.error.suggestion } : {}),
        code: 'invalid-chain',
      });
    }
  }

  return diagnostics;
}
