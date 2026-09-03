/**
 * One reader for Django template syntax.
 *
 * There were fifteen. Each grew its own regex for `{% … %}`, each understood a
 * slightly different grammar, and the difference between them is where the bugs
 * lived: a `{% for %}` reader that accepted only a bare dotted name as the
 * iterable, a variable reader that scanned one line at a time and so never saw
 * a wrapped tag, a keyword splitter that found the `=` inside
 * `Count("x", distinct=True)`. Every one was a false error on ordinary Django,
 * and none was findable by reading the regex — only by running templates
 * through it.
 *
 * The shape mirrors Django's own lexer, `django/template/base.py`:
 *
 *     tag_re = re.compile(r"({%.*?%}|{{.*?}}|{#.*?#})", re.DOTALL)
 *
 * DOTALL is why a token may span lines. That is Django's grammar, not leniency.
 *
 * Pure domain: no vscode / fs / path imports.
 */

import { ink } from './ink';
import { PY_IDENT } from './python-tokens';

export type DtlTokenKind = 'var' | 'tag' | 'comment';

export interface DtlToken {
  readonly kind: DtlTokenKind;
  /** The token as written, delimiters included. */
  readonly raw: string;
  /** Between the delimiters, `{%-`/`-%}` markers removed, trimmed. */
  readonly inner: string;
  /** Absolute offset of `raw`. */
  readonly start: number;
  /** Absolute offset of `inner`, for pointing at what the user wrote. */
  readonly innerStart: number;
  /** First word of a tag — `for`, `endblock`, `load`. Empty for var/comment. */
  readonly name: string;
  /**
   * Django will not evaluate this token: `{% comment %}`, `{% verbatim %}`, or
   * after an opener that was never closed.
   */
  readonly inert: boolean;
  /**
   * It sits in a `<script>` body. Django DOES evaluate those — its lexer has no
   * HTML awareness at all, so `{{ x|intcomma }}` in a script tag really is
   * rendered. This is a separate fact from `inert` precisely because it pulls
   * the other way: JavaScript and JSX carry braces of their own, so a reader
   * that reports UNDEFINED THINGS wants to skip these, while a reader that
   * asks WHAT IS USED must count them.
   *
   * They were one boolean, and the conflation reported `{% load humanize %}` as
   * never used when the only `|intcomma` was inside a script.
   */
  readonly inScript: boolean;
}

/** Django's tag_re, with DOTALL written as [\s\S]. */
const TOKEN_RE = /\{%[\s\S]*?%\}|\{\{[\s\S]*?\}\}|\{#[\s\S]*?#\}/g;

/** Openers whose body Django hands back untouched, and their closers. */
const INERT_BLOCKS: Readonly<Record<string, string>> = {
  comment: 'endcomment',
  verbatim: 'endverbatim',
};

// A <script> body is JavaScript, which has braces of its own. A region rather
// than a token rule, because it is not DTL syntax at all.
const SCRIPT_RE = /<script[\s>][\s\S]*?<\/script>/gi;
const SCRIPT_OPEN_RE = /<script[\s>]/gi;

type Span = readonly [number, number];

/**
 * Is `at` inside any span? Binary search over the output of `disjointSpans`.
 *
 * A linear scan here is called once per token, and every `{# … #}` adds a span,
 * so the product was quadratic: 4000 comments took 236ms.
 *
 * PRECONDITION: `sorted` is disjoint. Only `disjointSpans` may produce it —
 * see the note there for what happens when it is not.
 */
function covers(sorted: readonly Span[], at: number): boolean {
  let lo = 0;
  let hi = sorted.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const [a, b] = sorted[mid]!;
    if (at < a) hi = mid - 1;
    else if (at >= b) lo = mid + 1;
    else return true;
  }
  return false;
}

/**
 * Sorted by start, and merged so no span overlaps the next.
 *
 * Sorting alone is not enough for `covers`: a binary search needs a total
 * order, and the spans arrive NESTED. A `{# … #}` inside a `{% comment %}`
 * pushes its own span, and the block pushes the span that encloses it — so a
 * probe between two nested comments would step over the enclosing block and
 * report the body live. Merging is what makes the order total.
 */
const disjointSpans = (spans: readonly Span[]): Span[] => {
  const sorted = [...spans].sort((x, y) => x[0] - y[0]);
  const merged: Span[] = [];
  for (const [a, b] of sorted) {
    const last = merged[merged.length - 1];
    if (last && a <= last[1]) {
      if (b > last[1]) merged[merged.length - 1] = [last[0], b];
      continue;
    }
    merged.push([a, b]);
  }
  return merged;
};

// Built once: this runs over the whole document on every keystroke.
// `\w` answered `categor` for `{% categoría_lista %}` and `''` for
// `{% κατάλογος %}` — a tag with no name at all, everywhere downstream.
const TAG_NAME_RE = new RegExp(String.raw`^(${PY_IDENT})`, 'u');
const tagNameOf = (inner: string): string => TAG_NAME_RE.exec(inner)?.[1] ?? '';

/** Split one `{{ … }}` / `{% … %}` / `{# … #}` match into its parts. */
function readToken(raw: string, start: number): Omit<DtlToken, 'inert' | 'inScript'> {
  const kind: DtlTokenKind = raw.startsWith('{{')
    ? 'var'
    : raw.startsWith('{#')
      ? 'comment'
      : 'tag';

  const body = raw.slice(2, -2);
  const afterOpen = body.replace(/^[-+]/, '');
  const stripped = afterOpen.replace(/[-+]$/, '');
  const inner = stripped.trim();
  // How far `inner` sits from the start of `raw`: the two delimiter chars, an
  // optional whitespace-control marker, then leading whitespace.
  const innerStart =
    start +
    2 +
    (body.length - afterOpen.length) +
    (afterOpen.length - afterOpen.trimStart().length);

  return { kind, raw, inner, start, innerStart, name: kind === 'tag' ? tagNameOf(inner) : '' };
}

/**
 * `<script>` body spans, including everything after an opener that was never
 * closed. Comment and verbatim blocks are `inertSpans`' job, not this one's.
 */
function scriptSpans(source: string): Span[] {
  const spans: Span[] = [];
  for (const m of source.matchAll(SCRIPT_RE)) {
    spans.push([m.index ?? 0, (m.index ?? 0) + m[0].length]);
  }
  // An unterminated <script> swallows the rest, exactly as a browser would.
  const sorted = disjointSpans(spans);
  for (const m of source.matchAll(SCRIPT_OPEN_RE)) {
    const at = m.index ?? 0;
    if (!covers(sorted, at)) spans.push([at, source.length]);
  }
  return disjointSpans(spans);
}

function inertSpans(source: string, bare: readonly Omit<DtlToken, 'inert' | 'inScript'>[]): Span[] {
  const spans: Span[] = [];

  let openAt: number | null = null;
  let closer: string | null = null;
  for (const t of bare) {
    if (t.kind === 'comment') {
      spans.push([t.start, t.start + t.raw.length]);
      continue;
    }
    if (t.kind !== 'tag') continue;

    if (closer !== null) {
      if (t.name === closer) {
        spans.push([openAt!, t.start + t.raw.length]);
        openAt = null;
        closer = null;
      }
      continue;
    }
    if (INERT_BLOCKS[t.name]) {
      openAt = t.start;
      closer = INERT_BLOCKS[t.name]!;
    }
  }
  // A half-written `{% comment %}` is a normal editing state. Until its closer
  // arrives, lighting up the rest of the file with warnings about text the
  // author already crossed out helps nobody.
  if (openAt !== null) spans.push([openAt, source.length]);

  return spans;
}

/**
 * Every `{{ }}`, `{% %}` and `{# #}` in a template, in source order.
 *
 * Plain text between tokens is not emitted: no reader has wanted it, and
 * leaving it out keeps the offsets the only thing callers must respect.
 */
/**
 * The last source read, and what it produced.
 *
 * Seventeen call sites reach the tokenizer and none of them cached, so
 * diagnosing one 68 KB template scanned the SAME string nine times — while the
 * author was typing. One entry is enough: the callers that pile up are all
 * asking about the document currently open, one after another, and a memo any
 * larger would hold whole documents alive for no gain.
 *
 * The entry is never handed out. `tokenizeDtl` copies before returning, so a
 * caller cannot reach into another caller's answer.
 */
let memoSource: string | undefined;
let memoTokens: DtlToken[] | undefined;

function tokenize(source: string): DtlToken[] {
  if (source === memoSource && memoTokens !== undefined) return memoTokens;

  const bare = [...source.matchAll(TOKEN_RE)].map(m => readToken(m[0], m.index ?? 0));
  const inert = disjointSpans(inertSpans(source, bare));
  const scripts = scriptSpans(source);
  const tokens = bare.map(t => ({
    ...t,
    inert: covers(inert, t.start),
    inScript: covers(scripts, t.start),
  }));

  memoSource = source;
  memoTokens = tokens;
  return tokens;
}

export function tokenizeDtl(source: string): DtlToken[] {
  return [...tokenize(source)];
}

/**
 * The tokens Django will actually evaluate.
 *
 * Script bodies are INCLUDED: Django's lexer has no HTML awareness, so a filter
 * or a `{% url %}` written inside a script tag is rendered like any other. A
 * caller that must not trip over JavaScript's own braces filters `inScript`
 * itself, and says why where it does it.
 */
export function liveTokens(source: string): DtlToken[] {
  return tokenize(source).filter(t => !t.inert && t.kind !== 'comment');
}

/**
 * Blank every inert region with spaces, keeping newlines so callers can still
 * report real line and column numbers.
 *
 * For readers that scan raw text rather than tokens. Derived from the same
 * tokenizer, so the two can no longer disagree about what counts — they did,
 * and the same commented-out block was quiet in one feature and noisy in
 * another.
 */
export function blankInertRegions(source: string): string {
  const bare = [...source.matchAll(TOKEN_RE)].map(m => readToken(m[0], m.index ?? 0));
  // Script bodies too: this exists for readers that scan RAW TEXT, and
  // JavaScript's braces are exactly what trips those up.
  return blankSpans(source, disjointSpans([...inertSpans(source, bare), ...scriptSpans(source)]));
}

/**
 * Blank only what Django itself does not execute: `{% comment %}`,
 * `{% verbatim %}` and `{# … #}`.
 *
 * The difference from `blankInertRegions` is `<script>`, and it matters for
 * readers looking for template REFERENCES rather than for JavaScript. A script
 * element is blanked whole, attributes included, so
 * `<script src="{% static 'js/app.js' %}">` lost a static reference that Django
 * really does resolve. Braces in a script body are a problem for a JS parser,
 * not for a reader counting `{% include %}` and `{% url %}`.
 */
export function blankDtlInertRegions(source: string): string {
  const bare = [...source.matchAll(TOKEN_RE)].map(m => readToken(m[0], m.index ?? 0));
  return blankSpans(source, disjointSpans(inertSpans(source, bare)));
}

/**
 * Replace every span with spaces, keeping newlines so callers can still report
 * real line and column numbers.
 *
 * Slice arithmetic on the string itself. Building `[...source]` splits by CODE
 * POINT while every offset here is a UTF-16 index, so a single emoji earlier in
 * the file shifted every blanked window — and `join('')` even changed the
 * length, which desynchronised offsets for the rest of the file.
 */
function blankSpans(source: string, spans: readonly Span[]): string {
  if (spans.length === 0) return source;

  let out = '';
  let cursor = 0;
  for (const [a, b] of spans) {
    if (b <= cursor) continue;
    const from = Math.max(a, cursor);
    out += source.slice(cursor, from) + source.slice(from, b).replace(/[^\n]/g, ' ');
    cursor = b;
  }
  return out + source.slice(cursor);
}

/**
 * Is `offset` inside a `{{ … }}` or `{% … %}` — including one still being typed?
 *
 * Deliberately NOT built on the token stream. Tokens require a closing
 * delimiter, and the whole point of this question is completion: at
 * `{{ produ|` there is no `}}` yet, so there is no token to find. What the
 * tokenizer does contribute is the blanking, which keeps a stray `{{` inside a
 * comment or a script string from making the rest of the file look like one
 * long expression.
 *
 * Three adapters carried their own copy of this, each scanning only the CURRENT
 * LINE — so none of them fired inside a tag that wrapped, which is exactly
 * where a long `{% if %}` condition needs help.
 */
export function isInsideTemplateExpr(source: string, offset: number): boolean {
  // Only the text BEFORE the cursor can answer this, so only that is blanked.
  // The old form blanked the whole document and then threw away everything
  // past `offset` — paid once per keystroke, in each of the four completion
  // providers that ask. An inert region straddling the cursor gives the same
  // answer either way: to a prefix its opener is simply unterminated, and an
  // unterminated opener already blanks to the end.
  let before = blankInertRegions(source.slice(0, offset));

  // A `{#` still standing after blanking is one whose `#}` has not arrived
  // yet. Django is inside a comment there, so nothing is being typed that
  // wants completing — and this was answering `true` on
  // `{# note {% if <cursor>`, offering tag completions inside a comment.
  const hash = before.lastIndexOf('{#');
  if (hash > before.lastIndexOf('#}')) before = before.slice(0, hash);

  if (before.lastIndexOf('{{') > before.lastIndexOf('}}')) return true;
  return before.lastIndexOf('{%') > before.lastIndexOf('%}');
}

export interface JoinedTag {
  /** Absolute offsets of the token being replaced. */
  readonly start: number;
  readonly end: number;
  /** The same tag on one line. */
  readonly text: string;
}

/**
 * The tag at `offset`, rewritten onto a single line — or null when there is no
 * tag there or it already is one.
 *
 * A wrapped tag is valid Django (`tag_re` carries re.DOTALL), so nothing here
 * reports a problem. It is offered, never demanded.
 *
 * Only the line break and the indentation that follows it collapse. Runs of
 * spaces are left alone, because a filename or a translated string may contain
 * them — `{% include "my  file.html" %}` survives, which the include-specific
 * collapser this generalises does not manage. A newline INSIDE a quoted string
 * is left alone too, for the same reason.
 */
export function joinWrappedTag(source: string, offset: number): JoinedTag | null {
  // Only what Django reads. Offering to rewrite `style={{ color: 'red' }}` in a
  // JSX block, or the literal text inside {% verbatim %}, is offering to break
  // something that was never a template tag.
  const tokens = tokenize(source).filter(t => !t.inert && !t.inScript);
  // Strictly inside wins over sitting on a boundary: with `%}{% for` the two
  // offsets coincide, and the cursor there belongs to the tag it opens. The
  // boundary fallback keeps a cursor parked just after a lone `%}` working.
  const token =
    tokens.find(t => offset >= t.start && offset < t.start + t.raw.length) ??
    tokens.find(t => offset === t.start + t.raw.length);
  if (!token) return null;
  return joinToken(token);
}

/**
 * The rewrite itself, given a token already found.
 *
 * Split out so `joinWrappedTags` can reuse the token stream it already has:
 * it tokenized the document, then called back into the offset-based entry
 * point per target, which tokenized the whole document again — N+1 passes,
 * on the format-on-save path.
 */
function joinToken(token: DtlToken): JoinedTag | null {
  if (!token.raw.includes('\n')) return null;

  let out = '';
  let quote: string | null = null;
  for (let i = 0; i < token.raw.length; i++) {
    const ch = token.raw[i]!;
    if (quote) {
      out += ch;
      if (ch === quote && token.raw[i - 1] !== '\\') quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      out += ch;
      continue;
    }
    if (ch === '\n') {
      // Swallow the indentation that follows, and any space already before it.
      while (/\s/.test(token.raw[i + 1] ?? '')) i++;
      out = out.replace(/[^\S\n]+$/, '') + ' ';
      continue;
    }
    out += ch;
  }

  const text = out.trim();
  if (text === token.raw) return null;
  // Same contract as every other rewrite here: whitespace only. A tag shape
  // this collapser does not understand is left exactly as the author typed it.
  if (ink(text) !== ink(token.raw)) return null;
  return { start: token.start, end: token.start + token.raw.length, text };
}

/**
 * Every wrapped tag the predicate accepts, rewritten onto one line.
 *
 * The document variant of {@link joinWrappedTag}, and the reason it exists: the
 * formatter carried its own include-specific collapser that ran BEFORE anything
 * else, so it joined includes sitting inside `<pre>` and `{% verbatim %}` —
 * the two constructs whose entire purpose is "do not touch this" — and squeezed
 * runs of spaces, which rewrites `{% include "my  file.html" %}`.
 */
export function joinWrappedTags(source: string, accept: (token: DtlToken) => boolean): string {
  const targets = tokenize(source).filter(
    t => !t.inert && !t.inScript && t.raw.includes('\n') && accept(t),
  );
  if (targets.length === 0) return source;

  let out = '';
  let cursor = 0;
  for (const t of targets) {
    const joined = joinToken(t);
    if (!joined) continue;
    out += source.slice(cursor, joined.start) + joined.text;
    cursor = joined.end;
  }
  return out + source.slice(cursor);
}
