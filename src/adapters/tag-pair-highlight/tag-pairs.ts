/**
 * Which `{% … %}` tags belong to the one under the cursor.
 *
 * Pure: no vscode import, so the pairing can be tested on its own. The adapter
 * that owns this folder had no test file at all, and the behaviour its header
 * describes was not the behaviour it had — from an opener it returned only the
 * closer, never the `{% else %}` between them.
 */
import { liveTokens, type DtlToken } from '$domain/parsers/_shared/dtl-lexer';

// ── Tag occurrence type ──

/**
 * A tag worth highlighting.
 *
 * Offsets only. This carried a `line` and a `col` as well, stamped on EVERY tag
 * in the file by an `offsetMapper` built over the whole source — and no caller
 * has ever read either one: the provider turns `start`/`end` into a Range with
 * `document.positionAt`, which is the editor's own arithmetic and the only
 * form VS Code accepts. On a 2 MB template that dead pair of numbers was some
 * nine tenths of the cost of a highlight, paid again on every cursor move.
 */
export interface TagOccurrence {
  name: string;
  start: number; // byte offset in source
  end: number;
}

/**
 * The `{% … %}` tags that take part in pairing, as LEXER TOKENS.
 *
 * Live tokens only. A `{% endif %}` written inside `{% comment %}` used to sit
 * in the same list as the real ones, so it could be highlighted as the partner
 * of a live `{% if %}` — a wrong pair is worse than none, because it points at
 * the wrong line with full confidence.
 *
 * The tokens are handed on as they come rather than copied into a result type.
 * Every search below is an index walk over this array, and a `TagOccurrence` is
 * built only for the two or three tags actually returned. Materialising all
 * 64 784 of them first — which is what this did — is work proportional to the
 * document for an answer proportional to one block.
 */
function tagTokens(source: string): DtlToken[] {
  return liveTokens(source).filter(t => t.kind === 'tag' && t.name !== '');
}

const occurrence = (token: DtlToken): TagOccurrence => ({
  name: token.name,
  start: token.start,
  end: token.start + token.raw.length,
});

const MID_TAGS = new Set(['else', 'elif', 'empty']);

/** Index of the tag containing `offset`, or -1. */
function tagAt(tags: readonly DtlToken[], offset: number): number {
  // Tokens are in source order and never overlap, so this is a binary search.
  let lo = 0;
  let hi = tags.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const token = tags[mid]!;
    if (offset < token.start) hi = mid - 1;
    else if (offset >= token.start + token.raw.length) lo = mid + 1;
    else return mid;
  }
  return -1;
}

export function findMatchingTags(
  source: string,
  offset: number,
  blockOpeners: ReadonlySet<string>,
): TagOccurrence[] {
  const tags = tagTokens(source);

  const currentIdx = tagAt(tags, offset);
  if (currentIdx === -1) return [];

  const tagName = tags[currentIdx]!.name;

  // Closer (endXXX) → the opener, plus the mid-level tags between them.
  if (tagName.startsWith('end')) {
    const baseName = tagName.substring(3);
    const openerIdx = findOpener(tags, currentIdx, baseName);
    if (openerIdx === -1) return [];
    return [
      occurrence(tags[openerIdx]!),
      ...midTagsBetween(tags, openerIdx, currentIdx, blockOpeners),
    ];
  }

  // Mid-level (else/elif/empty) → both ends, plus its sibling mids.
  if (MID_TAGS.has(tagName)) {
    const [openerIdx, closerIdx] = findOpenerAndCloser(tags, currentIdx, blockOpeners);
    const ends = [openerIdx, closerIdx].filter(i => i !== -1).map(i => occurrence(tags[i]!));
    if (openerIdx === -1 || closerIdx === -1) return ends;
    const siblings = midTagsBetween(tags, openerIdx, closerIdx, blockOpeners).filter(
      t => t.start !== tags[currentIdx]!.start,
    );
    return [...ends, ...siblings];
  }

  // Opener → the closer, plus the mid-level tags between them.
  if (blockOpeners.has(tagName)) {
    const closerIdx = findCloser(tags, currentIdx, tagName);
    if (closerIdx === -1) return [];
    return [
      occurrence(tags[closerIdx]!),
      ...midTagsBetween(tags, currentIdx, closerIdx, blockOpeners),
    ];
  }

  return [];
}

function findCloser(tags: readonly DtlToken[], openerIdx: number, baseName: string): number {
  let depth = 0;
  for (let i = openerIdx; i < tags.length; i++) {
    const name = tags[i]!.name;
    if (name === baseName) depth++;
    else if (name === `end${baseName}`) depth--;
    if (depth === 0) return i;
  }
  return -1;
}

function findOpener(tags: readonly DtlToken[], closerIdx: number, baseName: string): number {
  let depth = 0;
  for (let i = closerIdx; i >= 0; i--) {
    const name = tags[i]!.name;
    if (name === `end${baseName}`) depth++;
    else if (name === baseName) depth--;
    if (depth === 0) return i;
  }
  return -1;
}

/** `[openerIdx, closerIdx]`, either of which may be -1. */
function findOpenerAndCloser(
  tags: readonly DtlToken[],
  midIdx: number,
  blockOpeners: ReadonlySet<string>,
): [number, number] {
  let openerIdx = -1;
  let closerIdx = -1;

  // Search backward for opener
  let depth = 1;
  for (let i = midIdx - 1; i >= 0; i--) {
    const name = tags[i]!.name;
    if (name.startsWith('end') && blockOpeners.has(name.substring(3))) depth++;
    else if (blockOpeners.has(name)) depth--;
    if (depth === 0) {
      openerIdx = i;
      break;
    }
  }

  // Search forward for closer
  depth = 1;
  for (let i = midIdx + 1; i < tags.length; i++) {
    const name = tags[i]!.name;
    if (blockOpeners.has(name)) depth++;
    else if (name.startsWith('end') && blockOpeners.has(name.substring(3))) depth--;
    if (depth === 0) {
      closerIdx = i;
      break;
    }
  }

  return [openerIdx, closerIdx];
}

/**
 * The `{% else %}` / `{% elif %}` / `{% empty %}` tags belonging to THIS block.
 *
 * Depth-counted, so the `{% else %}` of a nested `{% if %}` is not claimed by
 * the outer one — a wrong highlight points at the wrong line with complete
 * confidence, which is worse than no highlight at all.
 */
function midTagsBetween(
  tags: readonly DtlToken[],
  from: number,
  to: number,
  blockOpeners: ReadonlySet<string>,
): TagOccurrence[] {
  if (to <= from) return [];

  const out: TagOccurrence[] = [];
  let depth = 0;
  for (let i = from + 1; i < to; i++) {
    const token = tags[i]!;
    if (blockOpeners.has(token.name)) {
      depth++;
      continue;
    }
    if (token.name.startsWith('end') && blockOpeners.has(token.name.substring(3))) {
      depth--;
      continue;
    }
    if (depth === 0 && MID_TAGS.has(token.name)) out.push(occurrence(token));
  }
  return out;
}
