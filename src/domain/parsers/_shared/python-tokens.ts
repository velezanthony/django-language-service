/**
 * Shared Python lexing helpers used by multiple domain parsers.
 * Pure constants and pure functions only — no vscode / fs / path imports.
 */

// ── Identifiers ───────────────────────────────────────────────────────────────

/**
 * The source of a Python 3 identifier, for composing into larger patterns.
 * Unicode, so `índice` and `記事` are names — `\w` is not a substitute.
 *
 * Any regex built from this MUST carry the `u` flag.
 */
export const PY_IDENT = String.raw`[\p{ID_Start}_][\p{ID_Continue}]*`;

/**
 * A name, safe to interpolate into a pattern, still meaning itself.
 * Escapes rather than strips: stripping deletes a non-ASCII name entirely.
 */
export function escapeForRegExp(name: string): string {
  return name.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

// ── Field classification ───────────────────────────────────────────────────────

/** Django ORM relation field type names — used to split fields → relations. */
export const RELATION_FIELDS = new Set([
  'ForeignKey',
  'OneToOneField',
  'ManyToManyField',
  'ForeignObject',
  'GenericForeignKey',
  'GenericRelatedObjectManager',
]);

// ── String-literal stripping ──────────────────────────────────────────────────

/** Match a Python string literal (single, double, or triple-quoted). */
const STRING_LITERAL_RE = /"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g;

/**
 * A quoted Python string following `prefixSource`. Group 1 is the delimiter,
 * group 2 the content — the OPENING quote closes it, so the other quote is
 * ordinary text. Content comes back raw, escapes included.
 *
 * `prefixSource` must hold no capturing group: the backreference is numbered
 * from the whole pattern.
 */
export function quotedAfter(prefixSource: string): RegExp {
  return new RegExp(String.raw`${prefixSource}(['"])((?:(?!\1)[^\\]|\\.)*)\1`);
}

/** Strip string literals from a Python source line to avoid false positives. */
export function stripStringLiterals(line: string): string {
  return line.replace(STRING_LITERAL_RE, '""');
}

/**
 * How many characters the string literal starting at `from` occupies, or 0 when
 * there is no literal there.
 *
 * Depth counting has to know that a brace inside quotes is a character, not a
 * bracket: `context = {'tpl': '{{ x }}', 'ok': True}` closed early otherwise, so
 * every key after the literal disappeared — and because the result was not
 * flagged unresolved, the missing names came back as hard warnings about the
 * author's own code.
 *
 * Written as a scan rather than a regex over a masked COPY of the text. The
 * copy was correct and cost a full pass plus an allocation on every call, which
 * showed up as a measurable slowdown in `parseUrls`, one of the hottest readers
 * in the project.
 */
export function stringLiteralLength(text: string, from: number): number {
  const quote = text[from];
  if (quote !== '"' && quote !== "'") return 0;

  const triple = text.startsWith(quote.repeat(3), from);
  const closer = triple ? quote.repeat(3) : quote;
  let i = from + closer.length;

  while (i < text.length) {
    if (text[i] === '\\') {
      i += 2;
      continue;
    }
    if (text.startsWith(closer, i)) return i + closer.length - from;
    i++;
  }
  // Unterminated: the rest of the text is inside it, which is also what
  // Python would say.
  return text.length - from;
}

// ── Decorator detection ───────────────────────────────────────────────────────

/** Match a `@register.<kind>` decorator line, capturing the decorator kind. */
export const DECORATOR_RE = /^\s*@\s*register\s*\.\s*(simple_tag|tag|filter|inclusion_tag)\b/;

// ── Bracket / paren extraction ────────────────────────────────────────────────

/**
 * Scan `source` starting at `openPos` (the position of the opening bracket/paren).
 * Returns the content between the opener and its matching closer, or null if unmatched.
 *
 * @param source - Full source string
 * @param openPos - Index of the opening character
 * @param open - Opening character, e.g. '('
 * @param close - Closing character, e.g. ')'
 */
export function extractBracketed(
  source: string,
  openPos: number,
  open: string,
  close: string,
): string | null {
  // A brace written inside a quoted value is a character, not a bracket.
  let depth = 0;
  const start = openPos + 1;
  for (let i = openPos; i < source.length; i++) {
    const literal = stringLiteralLength(source, i);
    if (literal > 0) {
      i += literal - 1;
      continue;
    }
    if (source[i] === open) depth++;
    else if (source[i] === close) {
      depth--;
      if (depth === 0) return source.substring(start, i);
    }
  }
  return null;
}

/**
 * Collect characters from `source[start]` forward until a character at depth 0
 * matches one of `stopChars`. Returns the collected content (excluding the stop char).
 */
export function collectUntilClosing(
  source: string,
  start: number,
  stopChars: string,
  openChar?: string,
  closeChar?: string,
): string {
  let depth = 0;
  let i = start;
  const buf: string[] = [];
  while (i < source.length) {
    const ch = source[i]!;
    if (openChar && ch === openChar) depth++;
    if (closeChar && ch === closeChar) {
      if (depth === 0) break;
      depth--;
    }
    if (depth === 0 && stopChars.includes(ch)) break;
    buf.push(ch);
    i++;
  }
  return buf.join('');
}

/**
 * Split a string by commas that are NOT nested inside parentheses or brackets.
 * E.g. `"a, (b, c), d"` → `["a", " (b, c)", " d"]`
 */
export function splitTopLevelTuples(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const literal = stringLiteralLength(text, i);
    if (literal > 0) {
      i += literal - 1;
      continue;
    }
    const ch = text[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    else if (ch === ',' && depth === 0) {
      parts.push(text.substring(start, i));
      start = i + 1;
    }
  }
  parts.push(text.substring(start));
  return parts;
}

/**
 * The contents of the first `{ … }` in `text`; the text itself when it has none.
 *
 * Callers that collect a statement — `context.update({…})`, `return {…}` — hold
 * the whole line, not the dict body `extractDictKeys` documents as its input.
 * They got away with it while that function ran one loose regex over whatever
 * it was handed; reading the dict one entry at a time does not.
 */
export function dictBodyOf(text: string): string {
  const open = text.indexOf('{');
  if (open === -1) return text;
  return extractBracketed(text, open, '{', '}') ?? '';
}

/**
 * Extract simple key names from a Python dict literal body.
 * E.g. `"'name': value, 'email': value"` → `['name', 'email']`
 * Only handles string-keyed, top-level entries.
 */
export function extractDictKeys(body: string): string[] {
  // One entry at a time, and only the name in front of the FIRST colon of
  // each. A single global regex over the whole body reported the keys of
  // nested dicts as keys of this one: `{'filters': {'status': s}}` published
  // `filters` AND `status`, so completion offered a name the template does
  // not have and a real typo went unreported because the name was "known".
  const keys: string[] = [];
  for (const entry of splitTopLevelTuples(body)) {
    const m = /^\s*['"](\w+)['"]\s*:/.exec(entry);
    if (m) keys.push(m[1]!);
  }
  return keys;
}

/**
 * Extract keyword argument names from a function call argument string.
 * E.g. `"name='foo', takes_context=True"` → `['name', 'takes_context']`
 */
export function extractKwargKeys(args: string): string[] {
  const keys: string[] = [];
  const KW_RE = /(\w+)\s*=/g;
  let m: RegExpExecArray | null;
  while ((m = KW_RE.exec(args)) !== null) {
    keys.push(m[1]!);
  }
  return keys;
}

/**
 * The class name at the end of a dotted reference.
 *
 * `core.mixins.TimeStampedModel` -> `TimeStampedModel`. Django code names a
 * base either way — `from core import mixins` then `class Foo(mixins.Base)` is
 * as common as importing the class itself — and five places were stripping the
 * module path in two different spellings. The one that DID NOT, the template
 * side of inheritance, therefore saw no inherited members at all on a model
 * whose base was written with its path: every inherited field, @property and
 * method read as undefined.
 */
export function bareClassName(ref: string): string {
  const trimmed = ref.trim();
  return trimmed.slice(trimmed.lastIndexOf('.') + 1);
}
