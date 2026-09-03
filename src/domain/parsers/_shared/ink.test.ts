/**
 * The contract that makes silent deletion impossible.
 *
 * One rewrite in this project did lose text — "Collapse All Includes" deleted
 * every unquoted prop from the document and said nothing. The parser bug is
 * fixed; this is the part that has to hold for the shapes nobody has thought of
 * yet.
 */
import { describe, it, expect } from 'vitest';
import { ink, preservingInk } from './ink';
import {
  collapseFormatInclude,
  prettyFormatInclude,
} from '$domain/include-pretty/include-formatter';
import { formatDocument } from '$domain/formatting/formatter';
import { joinWrappedTag } from './dtl-lexer';

describe('preservingInk', () => {
  it('lets a whitespace-only rewrite through', () => {
    expect(preservingInk('a  b', t => t.replace(/\s+/g, ' '))).toBe('a b');
  });

  it('rejects a rewrite that drops a character', () => {
    expect(preservingInk('a b', () => 'a')).toBe('a b');
  });

  it('rejects a rewrite that adds one', () => {
    expect(preservingInk('a b', t => `${t}!`)).toBe('a b');
  });

  it('treats a throw as declining', () => {
    expect(
      preservingInk('a b', () => {
        throw new Error('nope');
      }),
    ).toBe('a b');
  });

  it('counts an emoji as ink', () => {
    expect(ink(' 🎉 \n x ')).toBe('🎉x');
  });
});

// Whatever the author typed — braces, quotes, a `%}` inside a string, an
// unclosed one — comes back exactly as typed.
const HOSTILE_INCLUDES = [
  ['JSON in a value', `{% include "c.html" with data='{"a": 1, "b": [2,3]}' %}`],
  ['escaped double quotes', `{% include "c.html" with t="he said \\"hi\\"" %}`],
  ['escaped apostrophe', `{% include "c.html" with t='it\\'s' %}`],
  ['DTL inside a value', `{% include "c.html" with css="{{ x }}" %}`],
  ['a %} inside a value', `{% include "c.html" with t="100%} careful" %}`],
  ['loose braces', `{% include "c.html" with s="{ } {{ }}" %}`],
  ['emoji and a run of spaces', `{% include "c.html" with t="🎉  🎉" %}`],
  ['a literal pipe', `{% include "c.html" with t="a|b" %}`],
  ['a real filter', `{% include "c.html" with n=x|upper %}`],
  ['a repeated prop', `{% include "c.html" with a=1 a=2 %}`],
  ['an UNCLOSED quote', `{% include "c.html" with t="abc %}`],
  ['an empty value', `{% include "c.html" with t="" %}`],
  ['an = inside a value', `{% include "c.html" with q="a=b" %}`],
  ['a path with a space', `{% include "my file.html" with a=1 %}`],
  ['whitespace control', `{%- include "c.html" with a=1 -%}`],
  ['the commonest form', `{% include "c.html" with product=product only %}`],
] as const;

describe('an include survives collapsing, whatever is in it', () => {
  it.each(HOSTILE_INCLUDES)('%s', (_label, src) => {
    expect(collapseFormatInclude(src).trim()).toBe(src);
  });
});

describe('and survives the expand/collapse toggle', () => {
  it.each(HOSTILE_INCLUDES)('%s', (_label, src) => {
    expect(collapseFormatInclude(prettyFormatInclude(src, '')).trim()).toBe(src);
  });
});

describe('formatting never changes anything but whitespace', () => {
  it.each([
    ['a <pre> block', '<pre>\n  a   b\n</pre>'],
    ['a verbatim block', '{% verbatim %}\n{{ vue }}\n{% endverbatim %}'],
    ['DTL inside a script', '<script>var s = "{% if x %}";</script>'],
    ['an unterminated comment', '{# never closed'],
    ['an emoji in an expression', '{{ 🎉 }}'],
    ['a wrapped tag', '{% if a\n  and b %}\nx\n{% endif %}'],
    ['JSON in an attribute', `<div data-json='{"a":1}'>x</div>`],
    ['an include with an unclosed quote', '{% include "c.html" with t="abc %}'],
    ['nothing at all', ''],
    ['only whitespace', '   \n\n  '],
  ])('%s', (_label, src) => {
    expect(ink(formatDocument(src))).toBe(ink(src));
  });
});

describe('the join action declines what it cannot rewrite faithfully', () => {
  it('leaves JSX braces in a script alone', () => {
    const src = '<script>const E = () => <div style={{ a: 1,\n b: 2 }} />;</script>';
    expect(joinWrappedTag(src, src.indexOf('{{'))).toBeNull();
  });

  it('keeps every character when it does act', () => {
    const src = '{% if a\n   and b %}';
    const joined = joinWrappedTag(src, 0);
    expect(ink(joined!.text)).toBe(ink(src));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The gap in the guard, pinned so nobody has to rediscover it.
//
// A rewrite that only moves whitespace is invisible to `preservingInk` — by
// design, since the rewrites it guards are whitespace rewrites. The cost is that
// it cannot distinguish reindenting a region from flattening it, and a real
// collapser did flatten a file through this hole. Callers whose output must keep
// its line structure need their own check; this test exists so the limitation is
// a documented property rather than a surprise.
// ─────────────────────────────────────────────────────────────────────────────
describe('preservingInk and whitespace', () => {
  it('allows a rewrite that destroys the line structure', () => {
    const original = '{% include "card.html"\n<p>hello</p>\n<span>world</span>';
    const flattened = preservingInk(original, t => t.replace(/\n\s*/g, ' '));
    expect(flattened).not.toBe(original);
    expect(flattened.split('\n')).toHaveLength(1);
  });

  it('and still refuses one that drops a single character of ink', () => {
    const original = '{% include "card.html" with product=product %}';
    expect(preservingInk(original, t => t.replace('product=product ', ''))).toBe(original);
  });
});
