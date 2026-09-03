/**
 * What keys a view actually puts in its template context.
 *
 * The previous reader looked for three shapes and hardcoded the variable name
 * `context`. Anything else came back empty, and a PARTIAL read is worse than
 * an empty one: Live Mode stays quiet when it finds nothing, but reports every
 * key it missed as undefined once it has found even one.
 *
 * What it now understands, for any variable that reaches a render call or is
 * returned from the block:
 *
 *   ctx = {...}                    dict literal, one line or many
 *   ctx['k'] = v                   item assignment
 *   ctx.update({...})              literal merged in
 *   ctx.update(fn(...))            helper call — resolved elsewhere
 *   ctx |= {...}                   dict union (Python 3.9+)
 *   ctx = {**a, **b, 'k': v}       merge of dicts built earlier in the body
 *   ctx.setdefault('k', v)         conditional-ish insert, still a key
 *   render(req, t, {...})          inline, positional or context=
 *   TemplateResponse(req, t, {...})
 *   extra_context = {...}          CBV class attribute
 *
 * Pure domain: no vscode / fs / path imports.
 */

import {
  extractBracketed,
  extractDictKeys,
  stripStringLiterals,
  PY_IDENT,
  escapeForRegExp,
} from '$domain/parsers/_shared/python-tokens';

export interface ContextSurface {
  /** Keys the view puts in the context. */
  readonly keys: readonly string[];
  /** Helper functions called in a context position, by bare name. */
  readonly helperCalls: readonly string[];
  /**
   * The view injects keys through something this reader cannot follow —
   * `ctx.update(some_dict)`, a `**spread` of a value built elsewhere.
   *
   * The key list is then INCOMPLETE, and reporting the difference as
   * undefined would be accusing the user of a mistake this reader made.
   * Consumers soften the diagnostic instead.
   */
  readonly unresolved: boolean;
}

/** Names that look like a call in a context position but never are helpers. */
const SKIP_CALLS = new Set([
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
  'sorted',
  'reversed',
  'getattr',
  'g',
]);

/** The conventional name, always treated as a context variable even when the
 *  block hands it back in a way this reader does not recognize. */
const CONVENTIONAL = 'context';

const RENDER_CALL_RE = /\b(?:render|TemplateResponse|render_to_string)\s*\(/g;
/**
 * Built with `new RegExp` and the `u` flag rather than written as literals,
 * because a Python 3 identifier is Unicode — `índice`, `日本語`, `Artículo` are
 * ordinary names — and `\w` is `[A-Za-z0-9_]`. A reader written with `\w` does
 * not misread those; it does not see them at all, so the whole construct is
 * dropped in silence. `parseViews` was fixed for this and `PY_IDENT` exported
 * for the purpose; these were the readers still carrying the old shape.
 */
const RETURN_NAME_RE = new RegExp(String.raw`^\s*return\s+(${PY_IDENT})\s*$`, 'u');
const EXTRA_CONTEXT_RE = /^\s*extra_context\s*=\s*\{/;

/** `name = {`, `name.update({`, `name |= {`, … → the dict body, balanced. */
function dictBodyAt(source: string, bracePos: number): string | null {
  return bracePos < 0 ? null : extractBracketed(source, bracePos, '{', '}');
}

/**
 * Variables the block hands to a template.
 *
 * A view can call its context dict anything; keying off the name `context`
 * meant `ctx['a'] = 1` produced nothing at all.
 */
export function contextVariableNames(source: string, lines: readonly string[]): Set<string> {
  const names = new Set<string>([CONVENTIONAL]);

  for (const m of source.matchAll(RENDER_CALL_RE)) {
    const open = source.indexOf('(', m.index ?? 0);
    const args = extractBracketed(source, open, '(', ')');
    if (args === null) continue;
    // Third positional argument, or context=<name>.
    const kw = new RegExp(String.raw`\bcontext\s*=\s*(${PY_IDENT})\s*$`, 'u').exec(args.trim());
    if (kw) {
      names.add(kw[1]!);
      continue;
    }
    const parts = splitTopLevelArgs(args);
    const third = parts[2]?.trim();
    if (third && new RegExp(String.raw`^${PY_IDENT}$`, 'u').test(third)) names.add(third);
  }

  // `return ctx` — how get_context_data and helpers hand their dict back.
  for (const line of lines) {
    const r = RETURN_NAME_RE.exec(line);
    if (r) names.add(r[1]!);
  }

  return names;
}

/** Split a call's argument text on top-level commas. */
function splitTopLevelArgs(args: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < args.length; i++) {
    const ch = args[i]!;
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth--;
    else if (ch === ',' && depth === 0) {
      out.push(args.slice(start, i));
      start = i + 1;
    }
  }
  out.push(args.slice(start));
  return out;
}

/** Every `name = { … }` in the body, so a later `{**name}` can be expanded. */
function localDictKeys(source: string): Map<string, string[]> {
  const dicts = new Map<string, string[]>();
  const re = new RegExp(String.raw`(?:^|\n)\s*(${PY_IDENT})\s*=\s*\{`, 'gu');
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const body = dictBodyAt(source, source.indexOf('{', m.index));
    if (body !== null) dicts.set(m[1]!, extractDictKeys(body));
  }
  return dicts;
}

/** Keys of a dict literal, expanding `**other` against dicts built earlier. */
function keysOfLiteral(
  body: string,
  locals: ReadonlyMap<string, string[]>,
  onUnknown?: () => void,
): string[] {
  const keys = extractDictKeys(body);
  for (const spread of body.matchAll(new RegExp(String.raw`\*\*\s*(${PY_IDENT})`, 'gu'))) {
    const known = locals.get(spread[1]!);
    if (known) keys.push(...known);
    else onUnknown?.();
  }
  return keys;
}

export function extractContextSurface(bodyLines: readonly string[]): ContextSurface {
  // String literals are stripped per line only where they could fake a match;
  // the dict scanners need the quotes, so the raw source is what they read.
  const source = bodyLines.join('\n');
  const names = contextVariableNames(source, bodyLines);
  const locals = localDictKeys(source);
  const keys: string[] = [];
  const helperCalls: string[] = [];
  let unresolved = false;

  const nameAlt = [...names].map(escapeForRegExp).filter(Boolean).join('|');
  if (!nameAlt) return { keys: [], helperCalls: [], unresolved: false };

  // ctx['k'] = …  (=== excluded so a comparison is not read as an assignment)
  for (const m of source.matchAll(
    new RegExp(`\\b(?:${nameAlt})\\s*\\[\\s*['"](${PY_IDENT})['"]\\s*\\]\\s*=(?!=)`, 'gu'),
  )) {
    keys.push(m[1]!);
  }
  // ctx.setdefault('k', …)
  for (const m of source.matchAll(
    new RegExp(`\\b(?:${nameAlt})\\.setdefault\\s*\\(\\s*['"](\\w+)['"]`, 'g'),
  )) {
    keys.push(m[1]!);
  }

  // ctx = { … } / ctx.update({ … }) / ctx |= { … }
  const literalRe = new RegExp(`\\b(?:${nameAlt})\\s*(?:=|\\|=|\\.update\\s*\\(\\s*)\\s*\\{`, 'g');
  for (const m of source.matchAll(literalRe)) {
    const body = dictBodyAt(source, source.indexOf('{', m.index ?? 0));
    if (body !== null)
      keys.push(
        ...keysOfLiteral(body, locals, () => {
          unresolved = true;
        }),
      );
  }

  // ctx = fn(…) / ctx.update(fn(…)) — the helper's own keys come from
  // helper-keys.ts, in this file or (via the scanner) another one.
  const callRe = new RegExp(
    `\\b(?:${nameAlt})\\s*(?:,\\s*\\w+\\s*)*(?:=|\\|=|\\.update\\s*\\(\\s*)\\s*(\\w+(?:\\.\\w+)*)\\s*\\(`,
    'g',
  );
  for (const m of source.matchAll(callRe)) {
    const bare = m[1]!.split('.').pop()!;
    if (!SKIP_CALLS.has(bare)) helperCalls.push(bare);
  }

  // render(request, 't.html', { … }) — positional or context=, plus the
  // TemplateResponse and render_to_string equivalents.
  for (const m of source.matchAll(RENDER_CALL_RE)) {
    const open = source.indexOf('(', m.index ?? 0);
    const args = extractBracketed(source, open, '(', ')');
    if (args === null) continue;
    const braceInArgs = args.indexOf('{');
    if (braceInArgs < 0) continue;
    const body = extractBracketed(args, braceInArgs, '{', '}');
    if (body !== null)
      keys.push(
        ...keysOfLiteral(body, locals, () => {
          unresolved = true;
        }),
      );
  }

  // CBV `extra_context = { … }` — a plain class attribute, no method involved.
  for (const line of bodyLines) {
    if (!EXTRA_CONTEXT_RE.test(stripStringLiterals(line))) continue;
    const at = source.indexOf(line);
    const body = dictBodyAt(source, source.indexOf('{', at));
    if (body !== null)
      keys.push(
        ...keysOfLiteral(body, locals, () => {
          unresolved = true;
        }),
      );
  }

  // ctx.update(<anything else>) — a dict held in a variable, a session
  // lookup, a subscript. Its keys are unknown, and pretending otherwise
  // misreports them as the user's mistake.
  const injectRe = new RegExp(`\\b(?:${nameAlt})\\s*(?:\\|=\\s*|\\.update\\s*\\(\\s*)`, 'g');
  for (const m of source.matchAll(injectRe)) {
    const rest = source.slice((m.index ?? 0) + m[0].length);
    if (rest.startsWith('{')) continue; // literal, read above
    if (new RegExp(String.raw`^${PY_IDENT}(?:\.${PY_IDENT})*\s*\(`, 'u').test(rest)) continue; // call, read above
    const bare = new RegExp(String.raw`^(${PY_IDENT})\s*[),]`, 'u').exec(rest); // update(other_dict)
    if (bare && locals.has(bare[1]!)) {
      keys.push(...(locals.get(bare[1]!) ?? []));
      continue;
    }
    unresolved = true;
  }

  return { keys: [...new Set(keys)], helperCalls: [...new Set(helperCalls)], unresolved };
}
