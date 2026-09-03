/**
 * The lexer's contract. Fifteen readers used to answer these questions
 * differently; from here there is one answer.
 */
import { describe, it, expect } from 'vitest';
import { measureScaling } from '../../../test-support/scaling';
import {
  tokenizeDtl,
  liveTokens,
  blankInertRegions,
  isInsideTemplateExpr,
  joinWrappedTag,
  joinWrappedTags,
} from './dtl-lexer';

const kinds = (s: string) => tokenizeDtl(s).map(t => `${t.kind}:${t.inner}`);
const live = (s: string) => liveTokens(s).map(t => t.inner);

describe('token shapes', () => {
  it('reads the three delimiters', () => {
    expect(kinds('{{ a }}{% if b %}{# c #}')).toEqual(['var:a', 'tag:if b', 'comment:c']);
  });

  it('names a tag by its first word', () => {
    expect(tokenizeDtl('{% endblock %}')[0]!.name).toBe('endblock');
    expect(tokenizeDtl('{{ a }}')[0]!.name).toBe('');
  });

  // Django's own lexer is DOTALL. A wrapped tag is grammar, not leniency.
  it('a token may span lines', () => {
    expect(kinds('{% if a\n   and b %}')).toEqual(['tag:if a\n   and b']);
  });

  it('strips whitespace-control markers', () => {
    expect(kinds('{%- for x in y -%}')).toEqual(['tag:for x in y']);
  });

  it('is non-greedy, so two tokens on a line stay two', () => {
    expect(kinds('{{ a }} {{ b }}')).toEqual(['var:a', 'var:b']);
  });
});

describe('offsets', () => {
  const src = '<p>{{  product.name }}</p>';

  it('start points at the delimiter', () => {
    expect(src.slice(tokenizeDtl(src)[0]!.start, 5)).toBe('{{');
  });

  it('innerStart points at the expression, past the padding', () => {
    const t = tokenizeDtl(src)[0]!;
    expect(src.slice(t.innerStart, t.innerStart + t.inner.length)).toBe('product.name');
  });

  it('and past a whitespace-control marker too', () => {
    const s = '{%-  if x %}';
    const t = tokenizeDtl(s)[0]!;
    expect(s.slice(t.innerStart, t.innerStart + t.inner.length)).toBe('if x');
  });

  it('survives a multi-line token', () => {
    const s = 'x\n{{ product.name\n   |upper }}';
    const t = tokenizeDtl(s)[0]!;
    expect(s.slice(t.innerStart).startsWith('product.name')).toBe(true);
  });
});

describe('what Django will not evaluate', () => {
  it('a {% comment %} body', () => {
    expect(live('{% comment %}{{ ghost }}{% endcomment %}{{ real }}')).toEqual(['real']);
  });

  it('a comment with the optional note argument', () => {
    expect(live('{% comment "why" %}{{ ghost }}{% endcomment %}{{ real }}')).toEqual(['real']);
  });

  it('a {% verbatim %} body, where Vue braces live', () => {
    expect(live('{% verbatim %}{{ vue }}{% endverbatim %}{{ real }}')).toEqual(['real']);
  });

  it('a {# #} comment', () => {
    expect(live('{# note #}{{ real }}')).toEqual(['real']);
  });

  // Half-written comments are a normal editing state.
  it('everything after an unterminated {% comment %}', () => {
    expect(live('{{ before }}{% comment %}{{ after }}')).toEqual(['before']);
  });

  it('but the token before the opener is still live', () => {
    expect(live('{{ a }}{% comment %}{{ b }}{% endcomment %}{{ c }}')).toEqual(['a', 'c']);
  });

  // A {# #} inside a {% comment %} pushes its own span, and the block pushes
  // the span that encloses it. Nested spans are not a total order, so a search
  // that assumes one steps over the enclosing block and calls its body live.
  // One nested comment happened to work; two did not.
  it('a body holding two {# #} comments of its own', () => {
    expect(
      live('{% comment %}{# a #}{{ b }}{# c #}{% url "x" %}{% endcomment %}{{ real }}'),
    ).toEqual(['real']);
  });

  it('a body holding three of them', () => {
    expect(
      live('{% comment %}{# a #}{{ x }}{# b #}{{ y }}{# c #}{% endcomment %}{{ real }}'),
    ).toEqual(['real']);
  });

  it('the same, in {% verbatim %}', () => {
    expect(live('{% verbatim %}{# a #}{{ x }}{# b #}{{ y }}{% endverbatim %}{{ real }}')).toEqual([
      'real',
    ]);
  });

  it('an unterminated {% comment %} whose body holds two of them', () => {
    expect(live('{{ before }}{% comment %}{# a #}{{ x }}{# b #}{{ y }}')).toEqual(['before']);
  });
});

// These two used to sit under "what Django will not evaluate", asserting that a
// script body is skipped. That was wrong about Django and the assertion carried
// the mistake: its lexer has no HTML awareness, so a script body is template
// code like any other. The flag says where the token is; it does not excuse it.
describe('a <script> body is evaluated, and marked', () => {
  it('is still a live token', () => {
    expect(live('<script>{{ js }}</script>{{ real }}')).toEqual(['js', 'real']);
  });

  it('carries inScript so a reader can choose', () => {
    expect(tokenizeDtl('<script>{{ js }}</script>{{ real }}').map(t => t.inScript)).toEqual([
      true,
      false,
    ]);
  });

  it('an unterminated <script> marks the rest, without silencing it', () => {
    const t = tokenizeDtl('{{ before }}<script>{{ after }}');
    expect(t.map(x => `${x.inner}:${x.inScript}`)).toEqual(['before:false', 'after:true']);
  });

  // blankInertRegions serves readers that scan RAW TEXT, and JavaScript's
  // braces are exactly what trips those up — so it does blank scripts.
  it('is blanked for the raw-text readers', () => {
    expect(blankInertRegions('<script>{{ js }}</script>')).not.toContain('{{');
  });
});

describe('blankInertRegions', () => {
  it('keeps the source length and every newline', () => {
    const s = 'a\n{% comment %}\nx\n{% endcomment %}\nb';
    const out = blankInertRegions(s);
    expect(out).toHaveLength(s.length);
    expect(out.split('\n')).toHaveLength(s.split('\n').length);
  });

  it('erases the block, delimiters included', () => {
    expect(blankInertRegions('{% comment %}xx{% endcomment %}').trim()).toBe('');
  });

  it('leaves live template code alone', () => {
    expect(blankInertRegions('{{ a }}')).toBe('{{ a }}');
  });

  it('leaves plain markup alone', () => {
    expect(blankInertRegions('<p>hi</p>')).toBe('<p>hi</p>');
  });
});

// Three adapters carried a copy of this, each looking only at the CURRENT line.
describe('isInsideTemplateExpr', () => {
  const at = (src: string) => isInsideTemplateExpr(src, src.indexOf('|CURSOR|'));

  // Blanking the WHOLE document to answer a question about one offset is work
  // paid on every keystroke, in four separate completion providers. Blanking
  // only the prefix gives the same answers — these pin the cases where "the
  // same" is not obvious, because an inert region can straddle the cursor.
  it('is not fooled by a comment block that closes after the cursor', () => {
    expect(at('{% comment %}{{ x }}|CURSOR|more{% endcomment %}')).toBe(false);
  });

  it('is not fooled by a script that closes after the cursor', () => {
    expect(at('<script>const a = {|CURSOR|};</script>')).toBe(false);
  });

  it('says no inside a {# #} whose closer is after the cursor', () => {
    expect(at('{# note {% if |CURSOR| #}')).toBe(false);
  });

  it('says no inside a {# #} that was never closed', () => {
    expect(at('<p>{# note {% if |CURSOR|')).toBe(false);
  });

  it('still says yes right after the comment closes', () => {
    expect(at('{# note #}{{ produ|CURSOR|')).toBe(true);
  });

  it('inside a {{ }} being typed', () => {
    expect(at('<p>{{ produ|CURSOR|')).toBe(true);
  });

  it('inside a {% %} being typed', () => {
    expect(at('{% if produ|CURSOR|')).toBe(true);
  });

  it('after a closed expression', () => {
    expect(at('{{ a }} |CURSOR|')).toBe(false);
  });

  it('in plain markup', () => {
    expect(at('<p>hello |CURSOR|</p>')).toBe(false);
  });

  // The reason for the change: a long condition wraps, and the line-based
  // check saw no `{%` on the continuation line, so nothing fired there.
  it('inside a tag that wrapped onto another line', () => {
    expect(at('{% if a\n   and produ|CURSOR|')).toBe(true);
  });

  it('inside a {{ }} that wrapped', () => {
    expect(at('{{ product.name\n   |lo|CURSOR|')).toBe(true);
  });

  // A stray delimiter in a region Django never reads must not make the rest of
  // the file look like one long expression.
  it('is not fooled by a {{ inside a comment', () => {
    expect(at('{% comment %}{{ oops{% endcomment %}\n<p>|CURSOR|</p>')).toBe(false);
  });

  it('is not fooled by a {{ inside a script string', () => {
    expect(at('<script>var s = "{{";</script>\n<p>|CURSOR|</p>')).toBe(false);
  });
});

// A wrapped tag is valid Django, so nothing reports it. This is the offer.
describe('joinWrappedTag', () => {
  const join = (src: string, at = src.indexOf('{')) => joinWrappedTag(src, at)?.text ?? null;

  it('joins a wrapped {% if %}', () => {
    expect(join('{% if a\n   and b %}')).toBe('{% if a and b %}');
  });

  it('joins a wrapped {{ }}', () => {
    expect(join('{{ product.name\n   |upper }}')).toBe('{{ product.name |upper }}');
  });

  it('keeps whitespace-control markers', () => {
    expect(join('{%- if a\n   and b -%}')).toBe('{%- if a and b -%}');
  });

  it('joins a tag wrapped over three lines', () => {
    expect(join('{% if a\n   and b\n   and c %}')).toBe('{% if a and b and c %}');
  });

  // The include-specific collapser this generalises squeezes every run of
  // spaces, which corrupts a filename. Only the wrap is touched here.
  it('does not squeeze spaces inside a quoted string', () => {
    expect(join('{% include "my  file.html"\n   only %}')).toBe(
      '{% include "my  file.html" only %}',
    );
  });

  it('leaves a newline inside a quoted string alone', () => {
    expect(join('{% include "a\nb"\n   only %}')).toBe('{% include "a\nb" only %}');
  });

  it('offers nothing for a tag already on one line', () => {
    expect(join('{% if a and b %}')).toBeNull();
  });

  it('offers nothing outside a tag', () => {
    expect(join('<p>hello</p>', 3)).toBeNull();
  });

  it('reports the range it would replace', () => {
    const src = '<p>x</p>\n{% if a\n   and b %}';
    const r = joinWrappedTag(src, src.indexOf('{%'));
    expect(src.slice(r!.start, r!.end)).toBe('{% if a\n   and b %}');
  });

  it('picks the tag the cursor is in, not the first in the file', () => {
    const src = '{% if a\n  and b %}{% for x in y\n  %}';
    expect(join(src, src.indexOf('{% for'))).toBe('{% for x in y %}');
  });
});

// Found by an adversarial review of the refactor itself. All five were
// introduced by it, and none was reachable by reading the code.
describe('what the review of this lexer found', () => {
  // Django's lexer has NO HTML awareness — tag_re runs over the whole file, so
  // `{{ x|intcomma }}` in a script tag really is rendered. `inert` used to say
  // otherwise, and `inScript` exists because the two facts pull opposite ways.
  it('a token in a <script> body is evaluated by Django', () => {
    const [t] = tokenizeDtl('<script>var n = "{{ count }}";</script>');
    expect(t?.inert).toBe(false);
    expect(t?.inScript).toBe(true);
  });

  it('a token in a comment is inert and not in a script', () => {
    const t = tokenizeDtl('{% comment %}{{ x }}{% endcomment %}')[1];
    expect(t?.inert).toBe(true);
    expect(t?.inScript).toBe(false);
  });

  it('liveTokens keeps script tokens, because Django renders them', () => {
    expect(liveTokens('<script>{{ a }}</script>{{ b }}').map(t => t.inner)).toEqual(['a', 'b']);
  });

  // [...source] splits by CODE POINT; every offset here is a UTF-16 index. One
  // emoji shifted every blanked window and join('') even changed the length,
  // desynchronising the rest of the file.
  it('blanks the right bytes when an astral character comes first', () => {
    const src = '<h1>🎉🎉</h1>\n{% comment %}\n{{ ghost }}\n{% endcomment %}\n<p>x</p>';
    const out = blankInertRegions(src);
    expect(out).toHaveLength(src.length);
    expect(out).not.toMatch(/\{%|\{\{/);
    expect(out.startsWith('<h1>🎉🎉</h1>')).toBe(true);
  });

  it('keeps offsets aligned after an emoji', () => {
    const src = '🎉{% comment %}x{% endcomment %}{{ real }}';
    const out = blankInertRegions(src);
    expect(out.indexOf('{{')).toBe(src.indexOf('{{ real'));
  });

  it('does not offer to join JSX braces inside a script', () => {
    const jsx = "<script>const El = () => <div style={{ color: 'red',\n  margin: 0 }} />;</script>";
    expect(joinWrappedTag(jsx, jsx.indexOf('{{'))).toBeNull();
  });

  it('does not offer to join the literal text inside {% verbatim %}', () => {
    const src = '{% verbatim %}{{ literal\n   text }}{% endverbatim %}';
    expect(joinWrappedTag(src, src.indexOf('{{ literal'))).toBeNull();
  });

  // One span per {# #} plus a linear scan per token was quadratic: 4000
  // comments took 236ms.
  it('stays linear when the file is full of comments', () => {
    const { ratio } = measureScaling({
      prepare: n => Array.from({ length: n }, (_, i) => `{# n${i} #}{{ v${i} }}\n`).join(''),
      run: src => {
        tokenizeDtl(src);
      },
      size: 400,
    });
    // The tokenizer memoizes its last source, so each timed loop pays exactly
    // one tokenization whatever `factor` is — the ratio is now the SIZE ratio
    // for linear behaviour (4), not 1. Quadratic would still be ~16.
    expect(ratio).toBeLessThan(8);
  });
});

describe('joinWrappedTags — scaling', () => {
  // It tokenized the document, then called the offset-based entry point per
  // target, which tokenized the document again: N+1 passes over the whole
  // file, on the format-on-save path.
  it('stays linear in the number of wrapped tags', () => {
    const wrapped = '{% include "a.html"\n   with x=1 %}\n<p>text</p>\n';
    const { ratio } = measureScaling({
      prepare: size => wrapped.repeat(size),
      run: src => {
        joinWrappedTags(src, () => true);
      },
      size: 120,
    });
    expect(ratio).toBeLessThan(2.5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The same source is not tokenized twice.
//
// There are seventeen call sites of `liveTokens` / `blankInertRegions` and none
// of them cached: diagnosing one 68 KB template tokenized the SAME string nine
// times, 26 ms of which about three were `collectTemplateLocalNames` alone.
// Every one of those passes runs while the author is typing.
// ─────────────────────────────────────────────────────────────────────────────
describe('repeated reads of one source', () => {
  const big = Array.from(
    { length: 4000 },
    (_, i) => `<div>{% if x${i} %}{{ value${i}|default:"—" }}{% endif %}</div>`,
  ).join('\n');

  it('costs far less than reading twenty different sources of the same size', () => {
    const others = Array.from({ length: 20 }, (_, i) => `${big}\n<span>${i}</span>`);
    liveTokens(big);
    for (const other of others) liveTokens(other); // warm

    const timeSame = () => {
      const started = performance.now();
      for (let i = 0; i < 20; i++) liveTokens(big);
      return performance.now() - started;
    };
    const timeDistinct = () => {
      const started = performance.now();
      for (const other of others) liveTokens(other);
      return performance.now() - started;
    };

    // Interleaved, not one side then the other: measured in sequence, GC
    // pressure from the first three windows lands on the last three.
    const sames: number[] = [];
    const distincts: number[] = [];
    for (let i = 0; i < 3; i++) {
      sames.push(timeSame());
      distincts.push(timeDistinct());
    }
    expect(Math.min(...sames)).toBeLessThan(Math.min(...distincts) / 3);
  });

  it('still answers correctly after a different source in between', () => {
    const first = liveTokens(big).length;
    expect(liveTokens('{% if y %}{{ z }}{% endif %}')).toHaveLength(3);
    expect(liveTokens(big)).toHaveLength(first);
  });

  it('gives every caller its own array', () => {
    const a = liveTokens(big);
    const b = liveTokens(big);
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });

  it('reflects a source that changed by one character', () => {
    const before = blankInertRegions('{% comment %}x{% endcomment %}');
    const after = blankInertRegions('{% comment %}y{% endcomment %}');
    expect(before).toBe(after.replace('y', 'y'));
    expect(blankInertRegions('{{ a }}')).toBe('{{ a }}');
  });
});
