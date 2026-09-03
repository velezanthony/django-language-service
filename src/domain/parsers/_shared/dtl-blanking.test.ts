/**
 * The contract: the filler occupies exactly the same characters, on exactly the
 * same lines, as the DTL it replaces. The syntax error that comes back from the
 * JS or CSS parser carries a line and column reported straight onto the user's
 * document, so any drift moves every squiggle below it.
 *
 * Three shapes used to drift:
 *   - `{{}}` in CSS grew to `inherit`, because padEnd cannot shrink
 *   - an empty or one-character line inside a multi-line tag grew to `//`
 *   - a `{{ }}` spanning lines was replaced WITHOUT its newline, so the rest of
 *     the block moved up a line
 */
import { describe, it, expect } from 'vitest';
import { cleanDtlForJs, cleanDtlForCss } from './dtl-blanking';

const SHAPES: Array<[string, string]> = [
  ['a variable', 'var a = "{{ x }}";'],
  ['the shortest variable', 'var a = {{}};'],
  ['a tag', 'if ({% if x %}) {}'],
  ['a comment', 'var a = 1; {# note #}'],
  ['a tag over two lines', 'var a = 1;\n{% if x\n   and y %}\nvar b = 2;'],
  ['an empty line inside a tag', 'var a = 1;\n{%\n\n%}\nvar b = 2;'],
  ['a one-character line inside a tag', 'var a = 1;\n{%\nx\n%}\nvar b = 2;'],
  ['a variable over two lines', 'var a = {{ x\n  |upper }};'],
  ['an emoji inside', 'var a = "{{ "🎉" }}";'],
  ['two back to back', '{{ a }}{{ b }}'],
  ['a comment over three lines', 'a\n{# one\ntwo\nthree #}\nb'],
  ['nothing to clean', 'var a = 1;'],
  ['nothing at all', ''],
];

const assertAligned = (src: string, out: string): void => {
  const before = src.split('\n');
  const after = out.split('\n');
  expect(out).toHaveLength(src.length);
  expect(after).toHaveLength(before.length);
  before.forEach((line, i) => expect(after[i]).toHaveLength(line.length));
};

describe('cleanDtlForJs keeps every offset', () => {
  it.each(SHAPES)('%s', (_label, src) => assertAligned(src, cleanDtlForJs(src)));
});

describe('cleanDtlForCss keeps every offset', () => {
  it.each(SHAPES)('%s', (_label, src) => assertAligned(src, cleanDtlForCss(src)));
});

describe('and leaves something the parser can read', () => {
  it('turns a JS variable into a value', () => {
    expect(cleanDtlForJs('var a = {{ x }};')).toBe('var a = (0)    ;');
  });

  it('turns a JS tag into a comment', () => {
    expect(cleanDtlForJs('{% if x %}')).toBe('//        ');
  });

  it('turns a CSS variable into a value when it fits', () => {
    expect(cleanDtlForCss('color: {{ brand }};')).toBe('color: inherit    ;');
  });

  // `inhe` was what truncation produced, and it is not a CSS value — the
  // parser rejected it and reported an error on a line the author wrote
  // correctly. A slot too narrow for `inherit` gets the shortest valid value
  // that does fit.
  it('uses a shorter valid value when the slot cannot hold one', () => {
    expect(cleanDtlForCss('color: {{}};')).toBe('color: 0   ;');
  });

  it('leaves text with no DTL exactly as it was', () => {
    const src = 'const a = { b: 1 };';
    expect(cleanDtlForJs(src)).toBe(src);
    expect(cleanDtlForCss(src)).toBe(src);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The filler is never itself broken syntax.
//
// The token went on EVERY line of the match, truncated to fit. A `{{ … }}`
// spanning lines therefore produced `(0)` several times, and on any line
// shorter than three characters the truncation left `(0` or `(` — unbalanced.
// The JS parser then reported a syntax error the author never wrote, and the
// squiggle landed on their template: a phantom error, in the very feature built
// to suppress phantom errors.
// ─────────────────────────────────────────────────────────────────────────────
describe('filler for a multi-line expression', () => {
  const balanced = (text: string) =>
    (text.match(/\(/g) ?? []).length === (text.match(/\)/g) ?? []).length;

  const MULTILINE = [
    '{{\nvalue\n}}',
    'let a = {{\n  value\n}};',
    'let a = {{ value|default:"x"\n  }};',
    'let a = {{\n\n}};',
    'let a = {{\nx\n}} + {{\ny\n}};',
    'let a = [{%\nif x\n%}1{%\nendif\n%}];',
  ];

  it.each(MULTILINE)('leaves balanced parentheses: %j', src => {
    expect(balanced(cleanDtlForJs(src)), cleanDtlForJs(src)).toBe(true);
  });

  it.each(MULTILINE)('keeps every offset where it was: %j', src => {
    const cleaned = cleanDtlForJs(src);
    expect(cleaned).toHaveLength(src.length);
    expect(cleaned.split('\n').map(l => l.length)).toEqual(src.split('\n').map(l => l.length));
  });

  it.each(MULTILINE)('does the same for CSS: %j', src => {
    const cleaned = cleanDtlForCss(src);
    expect(cleaned).toHaveLength(src.length);
    expect(balanced(cleaned)).toBe(true);
  });

  it('still fills a single-line expression with a usable value', () => {
    const src = 'let a = {{ value }};';
    const cleaned = cleanDtlForJs(src);
    expect(cleaned).toHaveLength(src.length);
    expect(cleaned.startsWith('let a = (0)')).toBe(true);
    expect(cleaned.endsWith(';')).toBe(true);
  });

  it('never leaves a fragment of the token behind', () => {
    for (const src of MULTILINE) {
      for (const line of cleanDtlForJs(src).split('\n')) {
        expect(line.includes('(0') && !line.includes('(0)'), line).toBe(false);
      }
    }
  });
});
