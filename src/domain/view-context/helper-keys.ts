/**
 * Same-file helper resolution — port of legacy helper-parser.ts plus the
 * resolveHelperCalls step of legacy workspace-scanner.ts, scoped to a
 * SINGLE Python file.
 *
 * Legacy semantics preserved:
 *   - dict-key patterns inside a helper body: `return {...}` (multi-line),
 *     `return dict(k=v)`, `var = {...}`, `var = dict(k=v)`, `var['k'] = ...`,
 *     `var.update({...})`, `var.update(dict(k=v))`
 *   - nested helper calls: `var.update(fn(...))` ONLY — `{**fn()}` spreads
 *     and bare `return fn()` were NOT detected by the legacy either
 *   - resolution depth cap = 3 (also terminates call cycles)
 *   - keys of the DIRECTLY called helper are unconditional; keys arriving
 *     through nested helper→helper hops are CONDITIONAL (legacy heuristic:
 *     nested update(fn()) calls sit inside if/elif branches in practice)
 *   - dotted calls (`header.to_dict`) resolve by the bare trailing name
 *
 * Divergence from legacy: helper bodies come from the SAME FILE only. The
 * legacy scanner collected bodies workspace-wide keyed by bare function name
 * (collision-prone, last-write-wins); in the new architecture contextVars
 * are populated at parse time (see parsers/views.ts header) and the parser
 * never sees other files. Cross-file enrichment still happens, but one layer
 * up: unresolved names ride out on `View.pendingHelpers`, and the scanner's
 * pass 2 (infra/scanner.ts `resolveCrossFileViewHelpers`) re-runs the
 * functions in THIS module over the imported modules, folding the keys into
 * the cached View on every scan.
 *
 * Pure domain: no vscode / fs / path imports.
 */

import {
  dictBodyOf,
  extractDictKeys,
  extractKwargKeys,
  PY_IDENT,
} from '$domain/parsers/_shared/python-tokens';
import { inferContextTypes } from './context-inference';
import type { ResolvedType } from './types';

// ── Patterns (legacy helper-parser.ts) ────────────────────────────────────────

/**
 * Built with `new RegExp` and the `u` flag rather than written as literals,
 * because a Python 3 identifier is Unicode — `índice`, `日本語`, `Artículo` are
 * ordinary names — and `\w` is `[A-Za-z0-9_]`. A reader written with `\w` does
 * not misread those; it does not see them at all, so the whole construct is
 * dropped in silence. `parseViews` was fixed for this and `PY_IDENT` exported
 * for the purpose; these were the readers still carrying the old shape.
 */
const FUNC_DEF_RE = new RegExp(String.raw`^def\s+(${PY_IDENT})\s*\(`, 'u');
const BRACKET_ASSIGN_RE = new RegExp(
  String.raw`(${PY_IDENT})\s*\[\s*['"](${PY_IDENT})['"]\s*\]\s*=(?!=)`,
  'u',
);
const RETURN_DICT_RE = /\breturn\s*\{/;
const RETURN_DICT_FUNC_RE = /\breturn\s+dict\s*\((.+)\)/;
const VAR_INIT_DICT_RE = new RegExp(String.raw`^(${PY_IDENT})\s*=\s*\{`, 'u');
const VAR_INIT_DICT_FUNC_RE = new RegExp(String.raw`^(${PY_IDENT})\s*=\s*dict\s*\((.+)\)`, 'u');
const UPDATE_DICT_RE = new RegExp(String.raw`(${PY_IDENT})\.update\s*\(\s*\{`, 'u');
const UPDATE_DICT_FUNC_RE = new RegExp(
  String.raw`(${PY_IDENT})\.update\s*\(\s*dict\s*\((.+)\)\s*\)`,
  'u',
);
const UPDATE_FUNC_RE = new RegExp(String.raw`(${PY_IDENT})\.update\s*\(\s*(${PY_IDENT})\s*\(`, 'u');

/** Builtins that look like calls inside update(...) but are never helpers. */
const SKIP_FUNC_NAMES = new Set([
  'dict',
  'super',
  'str',
  'int',
  'float',
  'bool',
  'list',
  'tuple',
  'set',
  'len',
  'range',
  'print',
  'True',
  'False',
  'None',
  'isinstance',
  'getattr',
  'setattr',
  'hasattr',
]);

const MAX_HELPER_DEPTH = 3;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HelperBody {
  /** Dict keys the helper contributes (its own, not nested). */
  readonly keys: readonly string[];
  /** Bare names of nested `var.update(fn(...))` helper calls. */
  readonly helperCalls: readonly string[];
  /** Trimmed body joined by '\n' — input for type inference. */
  readonly bodySource: string;
}

export interface ResolvedHelperKeys {
  /** Keys from the directly-called helpers — always in the context. */
  readonly direct: readonly string[];
  /** Keys from nested helper→helper hops — conditionally in the context. */
  readonly conditional: readonly string[];
  /** Model-shaped types inferred from the helper chain's bodies. */
  readonly types: ReadonlyMap<string, ResolvedType>;
}

// ── Line-based balance collector (legacy python-utils.collectUntilClosing) ───

/** Collect lines from startIdx until `open`/`close` balance out. */
export function collectLinesUntilBalanced(
  lines: readonly string[],
  startIdx: number,
  open: string,
  close: string,
): string {
  let depth = 0;
  const parts: string[] = [];
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i] ?? '';
    parts.push(line);
    for (const ch of line) {
      if (ch === open) depth++;
      if (ch === close) depth--;
    }
    if (depth <= 0 && i > startIdx) break;
    if (depth <= 0 && line.includes(close)) break;
  }
  return parts.join('\n');
}

// ── Body parsing ──────────────────────────────────────────────────────────────

function parseHelperBody(bodyLines: readonly string[]): HelperBody {
  const keys: string[] = [];
  const helperCalls: string[] = [];

  for (let i = 0; i < bodyLines.length; i++) {
    const line = bodyLines[i] ?? '';

    // var['key'] = ...
    const bracketMatch = line.match(BRACKET_ASSIGN_RE);
    if (bracketMatch) keys.push(bracketMatch[2]!);

    // return {...} — inline dict, possibly multi-line
    if (RETURN_DICT_RE.test(line)) {
      keys.push(...extractDictKeys(dictBodyOf(collectLinesUntilBalanced(bodyLines, i, '{', '}'))));
      continue;
    }

    // return dict(key=val, ...)
    const returnDictFunc = line.match(RETURN_DICT_FUNC_RE);
    if (returnDictFunc) {
      keys.push(...extractKwargKeys(returnDictFunc[1]!));
      continue;
    }

    // var.update({...}) — inline dict
    if (UPDATE_DICT_RE.test(line)) {
      keys.push(...extractDictKeys(dictBodyOf(collectLinesUntilBalanced(bodyLines, i, '{', '}'))));
      continue;
    }

    // var.update(dict(key=val, ...))
    const updateDictFunc = line.match(UPDATE_DICT_FUNC_RE);
    if (updateDictFunc) {
      keys.push(...extractKwargKeys(updateDictFunc[2]!));
      continue;
    }

    // var.update(func(...)) — nested helper call
    const updateFunc = line.match(UPDATE_FUNC_RE);
    if (updateFunc && !SKIP_FUNC_NAMES.has(updateFunc[2]!)) {
      helperCalls.push(updateFunc[2]!);
      continue;
    }

    // var = {...} — dict initialization
    if (VAR_INIT_DICT_RE.test(line)) {
      keys.push(...extractDictKeys(dictBodyOf(collectLinesUntilBalanced(bodyLines, i, '{', '}'))));
      continue;
    }

    // var = dict(key=val, ...)
    const varDictFunc = line.match(VAR_INIT_DICT_FUNC_RE);
    if (varDictFunc) {
      keys.push(...extractKwargKeys(varDictFunc[2]!));
    }
  }

  return {
    keys: [...new Set(keys)],
    helperCalls: [...new Set(helperCalls)],
    bodySource: bodyLines.join('\n'),
  };
}

/**
 * Extract every function definition from a Python source file.
 * Returns functionName → HelperBody. Nested defs are swallowed into their
 * enclosing function's body (legacy behavior).
 */
export function extractHelperBodies(source: string): Map<string, HelperBody> {
  if (!source.trim()) return new Map();

  const lines = source.split('\n');
  const result = new Map<string, HelperBody>();
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? '';
    const trimmed = line.trimStart();
    const match = trimmed.match(FUNC_DEF_RE);

    if (!match) {
      i++;
      continue;
    }

    const name = match[1]!;
    const defIndent = line.length - trimmed.length;
    const bodyLines: string[] = [];
    i++;

    while (i < lines.length) {
      const bodyLine = lines[i] ?? '';
      const bodyTrimmed = bodyLine.trimStart();
      const bodyIndent = bodyLine.length - bodyTrimmed.length;

      if (bodyTrimmed === '' || bodyTrimmed.startsWith('#')) {
        bodyLines.push(bodyTrimmed);
        i++;
        continue;
      }
      if (bodyIndent > defIndent) {
        bodyLines.push(bodyTrimmed);
        i++;
      } else {
        break;
      }
    }

    result.set(name, parseHelperBody(bodyLines));
  }

  return result;
}

// ── Resolution (legacy workspace-scanner resolveHelperCalls) ─────────────────

/**
 * Resolve a view's helper calls against the same-file helper bodies.
 * Unknown helpers resolve to nothing (never throw).
 */
export function resolveHelperKeys(
  helperCalls: readonly string[],
  bodies: ReadonlyMap<string, HelperBody>,
): ResolvedHelperKeys {
  const direct = new Set<string>();
  const conditional = new Set<string>();
  const types = new Map<string, ResolvedType>();

  // Per-helper type inference, computed once.
  const typeCache = new Map<string, Map<string, ResolvedType>>();
  const typesOf = (name: string): Map<string, ResolvedType> => {
    const cached = typeCache.get(name);
    if (cached) return cached;
    const body = bodies.get(name);
    const inferred = body ? inferContextTypes(body.bodySource) : new Map<string, ResolvedType>();
    typeCache.set(name, inferred);
    return inferred;
  };

  function resolve(funcName: string, depth: number): { direct: string[]; conditional: string[] } {
    if (depth > MAX_HELPER_DEPTH) return { direct: [], conditional: [] };
    const body = bodies.get(funcName);
    if (!body) return { direct: [], conditional: [] };

    const d = [...body.keys];
    const c: string[] = [];
    for (const nested of body.helperCalls) {
      const r = resolve(nested, depth + 1);
      c.push(...r.direct, ...r.conditional);
    }
    return { direct: d, conditional: c };
  }

  function mergeTypes(funcName: string, depth: number, into: Map<string, ResolvedType>): void {
    if (depth > MAX_HELPER_DEPTH) return;
    for (const [k, v] of typesOf(funcName)) {
      if (!into.has(k)) into.set(k, v);
    }
    const body = bodies.get(funcName);
    if (!body) return;
    for (const nested of body.helperCalls) {
      mergeTypes(nested, depth + 1, into);
    }
  }

  for (const call of helperCalls) {
    const funcName = call.includes('.') ? call.split('.').pop()! : call;
    const resolved = resolve(funcName, 0);
    for (const k of resolved.direct) direct.add(k);
    for (const k of resolved.conditional) conditional.add(k);
    mergeTypes(funcName, 0, types);
  }

  // A key reachable both directly and through a nested hop is direct.
  for (const k of direct) conditional.delete(k);

  return { direct: [...direct], conditional: [...conditional], types };
}
