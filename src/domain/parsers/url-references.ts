/**
 * Pure scanner for `{% url 'name' %}` references. Quoted names only:
 * `{% url some_var %}` is a runtime lookup nothing here can validate.
 */

import { liveTokens } from './_shared/dtl-lexer';
import { offsetMapper } from './_shared/offsets';

export interface UrlReference {
  /** The name as written in the template (`'home'`, `'shop:product_detail'`). */
  readonly name: string;
  /** 0-based line index. */
  readonly line: number;
  /** 0-based column where the name STRING starts (excluding the quote). */
  readonly startCol: number;
  /** Character length of the name. */
  readonly length: number;
}

// The quoted name inside a `{% url %}` tag body. Delimiters are the lexer's
// job; this reads only the interior.
//
// The old version scanned raw lines and its comment claimed multi-line support.
// It had none — the line split saw to that — and it DID pick up `{% url %}`
// written inside `{% comment %}`, which the checker then called an unknown name.
const URL_NAME_RE = /^url\s+(['"])([^'"]+)\1/;

/** Every `{% url 'name' %}` in the template, with its position. */
export function findUrlReferences(source: string): UrlReference[] {
  // Cheap bail when the source obviously has no tags at all.
  if (!source.includes('{%')) return [];

  const at = offsetMapper(source);
  const refs: UrlReference[] = [];

  for (const token of liveTokens(source)) {
    if (token.kind !== 'tag' || token.name !== 'url') continue;
    const m = URL_NAME_RE.exec(token.inner);
    if (!m) continue;

    const name = m[2]!;
    // The OPEN quote: searching from the body's start avoids landing on the
    // closing one, which would shift the range by the name's length.
    const nameAt = token.innerStart + token.inner.indexOf(m[1]!) + 1;
    const pos = at(nameAt);
    refs.push({ name, line: pos.line - 1, startCol: pos.col - 1, length: name.length });
  }
  return refs;
}

/**
 * The references whose name is NOT in `knownNames` — namespaced `app:name`
 * where `urls.py` declares one. Exact matching, mirroring the completion, so
 * this never flags a name the completion offers.
 *
 * Bails (returns []) when the index is empty: an empty index usually means the
 * scan hasn't run or found no urls.py, and flagging every reference then would
 * be a wall of false positives.
 */
export function findUnknownUrlReferences(
  source: string,
  knownNames: ReadonlySet<string>,
): UrlReference[] {
  if (knownNames.size === 0) return [];
  return findUrlReferences(source).filter(ref => !knownNames.has(ref.name));
}
