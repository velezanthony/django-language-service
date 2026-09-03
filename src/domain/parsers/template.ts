/**
 * parseTemplate — pure function: extracts structural references from a Django
 * HTML template source.
 *
 * Extracts:
 *   - {% extends '...' %} → Template.extends
 *   - {% include '...' [with kwargs] %} → Template.includes (IncludeRef[])
 *   - {% block name %} → Template.blocks (string[])
 *   - {% url 'name' ... %} → IncludeRef with target '__url__:<name>'
 *   - {% static 'path' %} → IncludeRef with target '__static__:<path>'
 *
 * {% load %} is NOT read here — loaded libraries come from
 * dtl-tag-registry/extractLoadedLibraries.
 *
 * Per design §7: URL refs and static refs are encoded as sentinel IncludeRef entries.
 * Template.filePath and relativePath are BOTH opts.filePath, verbatim — nothing
 * rewrites relativePath later, so for scanned templates it stays absolute.
 *
 * No vscode / fs / path imports.
 */
import type { ParseResult, ParserOpts } from '$domain/contracts/parser';
import type { Template, IncludeRef } from '$domain/types';
import { offsetMapper } from './_shared/offsets';
import {
  EXTENDS_RE,
  BLOCK_NAME_RE,
  INCLUDE_RE,
  URL_TAG_RE,
  STATIC_TAG_RE,
} from './_shared/html-tokens';
import { blankDtlInertRegions } from './_shared/dtl-lexer';
import { freshRegex } from '$domain/contracts/fresh-regex';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * 1-based line for an offset, via the shared `offsetMapper`.
 *
 * This was `source.substring(0, matchIndex).split('\n').length` — a copy and a
 * split of the whole prefix, per match — so a template dense with `{% url %}`
 * and `{% static %}` refs cost time quadratic in its length. `offsetMapper`
 * builds the line table once and binary-searches it, and three sibling parsers
 * were already using it.
 */
const lineFinder = (source: string): ((offset: number) => number) => {
  const at = offsetMapper(source);
  return offset => at(offset).line;
};

/**
 * Parse `with key=val key2=val2` kwargs from the "with section" of an include tag.
 * Input is the raw string after the template path in the {% include %} tag.
 */
function parseWithKwargs(withSection: string): Array<{ name: string; expr: string }> {
  const kwargs: Array<{ name: string; expr: string }> = [];
  if (!withSection.trim()) return kwargs;

  // Strip leading 'with '
  const body = withSection.replace(/^\s*with\s+/, '');

  // Match key=value pairs; value can be a quoted string or an unquoted
  // expression. The quoted branch captures its own delimiter (group 2) so that
  // the OTHER quote counts as content: `title="Bob's shop"` used to read as
  // `Bob`, and a truncated label is one that reaches the hover looking right.
  const KW_RE = /(\w+)\s*=\s*(?:(['"])((?:(?!\2)[^\\]|\\.)*)\2|(\S+))/g;
  let m: RegExpExecArray | null;
  while ((m = KW_RE.exec(body)) !== null) {
    const name = m[1]!;
    const expr = m[3] !== undefined ? m[3]! : (m[4] ?? '');
    kwargs.push({ name, expr });
  }
  return kwargs;
}

// ── Parser ────────────────────────────────────────────────────────────────────

export function parseTemplate(source: string, opts?: ParserOpts): ParseResult<Template[]> {
  if (!source.trim()) {
    return { ok: true, value: [] };
  }

  const filePath = opts?.filePath ?? '';
  const relativePath = filePath; // verbatim copy — nothing downstream rewrites it
  const lineAt = lineFinder(source);

  // Every pattern below reads the LIVE source: the same text with
  // `{% comment %}`, `{% verbatim %}` and `{# … #}` replaced by spaces.
  // Script elements are NOT blanked here: `<script src="{% static … %}">` is
  // a real reference. Running these over the raw source meant a commented-out
  // `{% include %}` still put an edge in the template graph and a
  // `{% url %}` inside `{% verbatim %}` counted as a real reference — so
  // commenting a block out did not stop either. `url-references.ts` and
  // `template-variables.ts` already worked this way; this file was the one
  // still reading raw text.
  //
  // The blanking is length-preserving, so `lineAt`, built on the original,
  // stays correct for every offset found here.
  const live = blankDtlInertRegions(source);

  // ── extends ────────────────────────────────────────────────────────────────
  const extendsMatch = live.match(EXTENDS_RE);
  const extendsPath = extendsMatch ? extendsMatch[2] : undefined;

  // ── blocks ─────────────────────────────────────────────────────────────────
  const blocks: string[] = [];
  const blockRe = freshRegex(BLOCK_NAME_RE);
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(live)) !== null) {
    const bName = m[1]!;
    if (!blocks.includes(bName)) blocks.push(bName);
  }

  // ── includes ───────────────────────────────────────────────────────────────
  const includes: IncludeRef[] = [];

  const includeRe = freshRegex(INCLUDE_RE);
  while ((m = includeRe.exec(live)) !== null) {
    // Group 1 is the delimiter the author opened with; 2 is the path.
    const target = m[2]!;
    // The capture runs to the closing delimiter, so it also holds any
    // whitespace-control modifier written just before it.
    const withSection = (m[3] ?? '').replace(/\s*[-+]$/, '');
    const kwargs = parseWithKwargs(withSection);
    includes.push({
      target,
      line: lineAt(m.index),
      kwargs,
    });
  }

  // ── url refs — encoded as sentinel IncludeRef ──────────────────────────────
  const urlRe = freshRegex(URL_TAG_RE);
  while ((m = urlRe.exec(live)) !== null) {
    includes.push({
      target: `__url__:${m[2]!}`,
      line: lineAt(m.index),
      kwargs: [],
    });
  }

  // ── static refs — encoded as sentinel IncludeRef ───────────────────────────
  const staticRe = freshRegex(STATIC_TAG_RE);
  while ((m = staticRe.exec(live)) !== null) {
    includes.push({
      target: `__static__:${m[2]!}`,
      line: lineAt(m.index),
      kwargs: [],
    });
  }

  const template: Template = {
    kind: 'template',
    filePath,
    relativePath,
    ...(extendsPath !== undefined ? { extends: extendsPath } : {}),
    includes,
    blocks,
  };

  return { ok: true, value: [template] };
}
