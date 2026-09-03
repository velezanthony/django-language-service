/**
 * The quoted argument of a `{% … %}` tag, by CURSOR OFFSET against the tokens —
 * a line can carry the same reference twice, and a tag may span lines.
 *
 * FIRST string argument only: in `{% include "a.html" with x="b" %}` the `"b"`
 * is a keyword value, not a reference.
 */

import { liveTokens } from '$domain/parsers/_shared/dtl-lexer';

/** `value` excludes the quotes; `start`/`end` are absolute offsets. */
export interface TagStringArg {
  readonly value: string;
  readonly start: number;
  readonly end: number;
}

/**
 * The first `'…'` or `"…"` in a tag. Two alternatives, not one backreference:
 * `(['"])([^'"]*)\1` forbids the OTHER quote inside, which loses
 * `{% include "user's.html" %}` entirely.
 */
const FIRST_STRING_RE = /'([^']*)'|"([^"]*)"/;

/**
 * The first quoted argument of the `tagNames` tag the cursor is in, or null for
 * every miss alike — wrong tag, no argument, or the cursor outside it.
 */
export function firstStringArgAt(
  source: string,
  offset: number,
  tagNames: ReadonlySet<string>,
): TagStringArg | null {
  for (const token of liveTokens(source)) {
    // In source order and non-overlapping: once one starts past the cursor, stop.
    if (token.start > offset) break;
    if (offset > token.start + token.raw.length) continue;
    if (token.kind !== 'tag' || !tagNames.has(token.name)) continue;

    const match = FIRST_STRING_RE.exec(token.raw);
    // Which group PARTICIPATED, not which is truthy: group 1 may be empty.
    const value = match === null ? undefined : (match[1] ?? match[2]);
    if (match === null || value === undefined) return null;
    // `{% url '' %}` names nothing; a hit would be a zero-width span.
    if (value === '') return null;

    const start = token.start + match.index + 1;
    const end = start + value.length;
    // Inclusive at both ends: resting against a quote still points at the name.
    return offset >= start && offset <= end ? { value, start, end } : null;
  }
  return null;
}
