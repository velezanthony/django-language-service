/**
 * The load linter reads raw lines. Anything that merely LOOKS like a tag —
 * inside a comment, inside {% verbatim %}, inside a string — was treated as a
 * real use, and a missing {% load %} was reported for it.
 *
 * The mirror image is worse: filters used inside a tag expression were never
 * checked at all, so a genuinely missing load went unreported.
 */
import { describe, it, expect } from 'vitest';
import { measureScaling } from '../../test-support/scaling';
import { diagnoseLoads } from './diagnose-loads';
import type { TagLibrary } from './tag-registry';

const LIBS = new Map<string, TagLibrary>([
  ['shop_tags', { tags: ['price_tag'], filters: ['money'] }],
]);

const missing = (src: string): string[] =>
  diagnoseLoads(src, LIBS)
    .filter(d => d.type === 'missing-load')
    .map(d => d.tagOrFilter);
const unused = (src: string): string[] =>
  diagnoseLoads(src, LIBS)
    .filter(d => d.type === 'unused-load')
    .map(d => d.requiredLibrary);

describe('a use that is not a use', () => {
  it('ignores a tag inside {% comment %}', () => {
    expect(missing(`{% comment %}{% price_tag %}{% endcomment %}`)).toEqual([]);
  });

  it('ignores a tag inside {% verbatim %}', () => {
    expect(missing(`{% verbatim %}{% price_tag %}{% endverbatim %}`)).toEqual([]);
  });

  it('ignores a tag inside an inline comment', () => {
    expect(missing(`{# {% price_tag %} #}`)).toEqual([]);
  });

  it('ignores a filter inside a comment', () => {
    expect(missing(`{% comment %}{{ x|money }}{% endcomment %}`)).toEqual([]);
  });

  // A filter name after a pipe inside a string is text, not a filter.
  it('ignores a pipe inside a string literal', () => {
    expect(missing(`{{ x|default:"a|money" }}`)).toEqual([]);
  });
});

describe('a use the linter did not look for', () => {
  // Django allows filters in any tag expression, not just in {{ }}.
  it('sees a filter used inside an {% if %}', () => {
    expect(missing(`{% if x|money %}y{% endif %}`)).toEqual(['money']);
  });

  it('sees a filter used inside a {% for %}', () => {
    expect(missing(`{% for a in b|money %}{% endfor %}`)).toEqual(['money']);
  });

  it('sees a filter in a multi-line variable block', () => {
    expect(missing(`{{ x\n  |money }}`)).toEqual(['money']);
  });
});

describe('what it already got right must stay right', () => {
  it('reports a custom tag used without its load', () => {
    expect(missing(`{% price_tag %}`)).toEqual(['price_tag']);
  });

  it('reports a custom filter used without its load', () => {
    expect(missing(`{{ x|money }}`)).toEqual(['money']);
  });

  it('says nothing once the library is loaded', () => {
    expect(missing(`{% load shop_tags %}{% price_tag %}`)).toEqual([]);
  });

  it('never complains about a builtin', () => {
    expect(missing(`{% if x %}{{ y|upper }}{% endif %}`)).toEqual([]);
  });

  it('reports a library loaded and never used', () => {
    expect(unused(`{% load shop_tags %}<p>x</p>`)).toEqual(['shop_tags']);
  });

  it('does not call a library unused when a tag inside a comment is the only use', () => {
    // The load really IS unused — the only mention is commented out.
    expect(unused(`{% load shop_tags %}{% comment %}{% price_tag %}{% endcomment %}`)).toEqual([
      'shop_tags',
    ]);
  });

  it('counts a filter used in a tag expression as using its library', () => {
    expect(unused(`{% load shop_tags %}{% if x|money %}y{% endif %}`)).toEqual([]);
  });
});

// A tag written inside a region Django never runs is not a use, and not a load
// either. The readers used to scan raw source, so a commented-out
// `{% load humanize %}` silenced the warning for every `|intcomma` below it —
// Django raises `Invalid filter` on that page and we said nothing.
describe('loads and uses inside regions Django skips', () => {
  const humanize = new Map([['humanize', { tags: [], filters: ['intcomma'] }]]);

  it('a commented-out load does not count as loaded', () => {
    const msgs = diagnoseLoads(
      `{% comment %}{% load humanize %}{% endcomment %}\n{{ x|intcomma }}`,
      humanize,
    ).map(d => d.message);
    expect(msgs).toEqual(["Filter 'intcomma' requires {% load humanize %}"]);
  });

  it('a load inside {% verbatim %} does not count either', () => {
    const msgs = diagnoseLoads(
      `{% verbatim %}{% load humanize %}{% endverbatim %}\n{{ x|intcomma }}`,
      humanize,
    ).map(d => d.message);
    expect(msgs).toEqual(["Filter 'intcomma' requires {% load humanize %}"]);
  });

  it('a real load still silences it', () => {
    expect(diagnoseLoads(`{% load humanize %}\n{{ x|intcomma }}`, humanize)).toEqual([]);
  });

  it('a commented-out USE does not keep a load alive', () => {
    const msgs = diagnoseLoads(
      `{% load humanize %}\n{% comment %}{{ x|intcomma }}{% endcomment %}`,
      humanize,
    ).map(d => d.message);
    expect(msgs).toEqual(["Library 'humanize' is loaded but never used"]);
  });
});

// Django's lexer has no HTML awareness: a filter used inside a <script> body is
// rendered like any other, so the load it needs IS used. Treating script tokens
// as unevaluated reported the library as dead.
describe('uses inside a <script> body', () => {
  const humanize = new Map([['humanize', { tags: [], filters: ['intcomma'] }]]);

  it('a filter used only in a script keeps its load alive', () => {
    expect(
      diagnoseLoads(
        '{% load humanize %}\n<script>var n = "{{ count|intcomma }}";</script>',
        humanize,
      ),
    ).toEqual([]);
  });

  it('a genuinely unused load is still reported', () => {
    expect(diagnoseLoads('{% load humanize %}\n<p>nothing</p>', humanize).map(d => d.type)).toEqual(
      ['unused-load'],
    );
  });

  it('stays linear as the template grows', () => {
    const { ratio } = measureScaling({
      prepare: n =>
        Array.from(
          { length: n },
          (_, i) => `{% if a${i} %}{{ v${i} }}{% url 'r${i}' %}{% endif %}\n`,
        ).join(''),
      run: src => {
        diagnoseLoads(src, new Map());
      },
      size: 250,
    });
    expect(ratio).toBeLessThan(2.5);
  });
});

// A tag or filter name is not owned by one library. Django resolves a name
// against the libraries the template LOADED; two libraries may declare the same
// name, and a loaded one deliberately shadows a Django library or a builtin.
// The reader asked "which library declares this name" and took the FIRST
// answer, so the load that actually provides the name was reported unused —
// a false accusation on code Django runs exactly as written.
describe('a loaded library is used when IT declares the name used', () => {
  const two = new Map<string, TagLibrary>([
    ['other_tags', { tags: ['price_tag'], filters: ['money'] }],
    ['shop_tags', { tags: ['price_tag'], filters: ['money'] }],
  ]);
  const dead = (src: string, libs: Map<string, TagLibrary>): string[] =>
    diagnoseLoads(src, libs)
      .filter(d => d.type === 'unused-load')
      .map(d => d.requiredLibrary);

  it('when another custom library declares the same TAG', () => {
    expect(dead(`{% load shop_tags %}{% price_tag %}`, two)).toEqual([]);
  });

  it('when another custom library declares the same FILTER', () => {
    expect(dead(`{% load shop_tags %}{{ x|money }}`, two)).toEqual([]);
  });

  it('when a Django library declares the same TAG', () => {
    // `static` is the tag of Django's own `static` library.
    const libs = new Map<string, TagLibrary>([['shop_tags', { tags: ['static'], filters: [] }]]);
    expect(dead(`{% load shop_tags %}{% static 'x.css' %}`, libs)).toEqual([]);
  });

  it('when a Django library declares the same FILTER', () => {
    // `localize` is the filter of Django's own `l10n` library.
    const libs = new Map<string, TagLibrary>([['shop_tags', { tags: [], filters: ['localize'] }]]);
    expect(dead(`{% load shop_tags %}{{ x|localize }}`, libs)).toEqual([]);
  });

  it('when the name shadows a builtin, which a loaded library overrides', () => {
    const libs = new Map<string, TagLibrary>([['shop_tags', { tags: [], filters: ['upper'] }]]);
    expect(dead(`{% load shop_tags %}{{ x|upper }}`, libs)).toEqual([]);
  });

  it('and every loaded library declaring the name is kept alive at once', () => {
    expect(dead(`{% load other_tags shop_tags %}{% price_tag %}`, two)).toEqual([]);
  });

  it('but a library declaring none of the names used is still reported', () => {
    const libs = new Map<string, TagLibrary>([
      ['shop_tags', { tags: ['price_tag'], filters: [] }],
      ['blog_tags', { tags: ['post_tag'], filters: [] }],
    ]);
    expect(dead(`{% load shop_tags blog_tags %}{% price_tag %}`, libs)).toEqual(['blog_tags']);
  });
});
