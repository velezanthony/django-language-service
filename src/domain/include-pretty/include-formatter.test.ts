import { describe, it, expect } from 'vitest';
import { prettyFormatInclude, collapseFormatInclude } from './include-formatter';
import { parseIncludeTag, parseIncludeProps } from './include-parser';

describe('prettyFormatInclude', () => {
  it('returns original text for include without HTML props', () => {
    const text = '{% include "card.html" with title="Hello" %}';
    expect(prettyFormatInclude(text, '')).toBe(text);
  });

  it('returns original text for invalid include', () => {
    expect(prettyFormatInclude('{% block content %}', '')).toBe('{% block content %}');
  });

  it('expands include with HTML props to the exact multi-line layout', () => {
    const text = '{% include "card.html" with body="<p>Hello</p>" title="Hi" only %}';
    const result = prettyFormatInclude(text, '');
    expect(result).toBe(
      [
        '{% include "card.html"',
        '    with',
        '        body="',
        '        <p>',
        '          Hello',
        '        </p>',
        '        "',
        '        title="Hi"',
        '        only',
        '%}',
      ].join('\n'),
    );
  });

  it('expands respecting baseIndentation and preserving nested quotes of the other kind', () => {
    const text = `{% include "card.html" with data='<div class="x">hi</div>' %}`;
    const result = prettyFormatInclude(text, '  ');
    expect(result).toBe(
      [
        '  {% include "card.html"',
        '      with',
        "          data='",
        '          <div class="x">',
        '            hi',
        '          </div>',
        "          '",
        '  %}',
      ].join('\n'),
    );
  });

  it('preserves whitespace-control delimiters {%- ... -%}', () => {
    const text = '{%- include "x.html" with c="<i>y</i>" -%}';
    const result = prettyFormatInclude(text, '');
    expect(result.startsWith('{%- include "x.html"')).toBe(true);
    expect(result.endsWith('\n-%}')).toBe(true);
  });
});

describe('collapseFormatInclude', () => {
  it('collapses a multi-line include to the exact single line', () => {
    const text = '{% include "card.html"\n  with title="Hello"\n%}';
    expect(collapseFormatInclude(text)).toBe('{% include "card.html" with title="Hello" %}');
  });

  it('collapse of an include with no props is exact', () => {
    expect(collapseFormatInclude('{% include "base.html" %}')).toBe('{% include "base.html" %}');
  });

  it('keeps a bare "only" (no with) on collapse', () => {
    expect(collapseFormatInclude('{% include "x.html" only %}')).toBe(
      '{% include "x.html" only %}',
    );
  });

  it('preserves the leading whitespace of the original text', () => {
    const text = '    {% include "card.html"\n        with title="Hello"\n    %}';
    expect(collapseFormatInclude(text)).toBe('    {% include "card.html" with title="Hello" %}');
  });
});

// KNOWN LIMITATION, stated rather than enshrined. formatHtmlContent TRIMS each
// text node, so `<b> hi </b>` and `<b>hi</b>` expand to the identical thing and
// no collapse can tell them apart afterwards. Being byte-lossless needs a real
// HTML model, not a line-based pretty printer.
//
// So the round trip normalises whitespace around HTML text nodes to NONE, which
// preserves the form people actually type in an attribute. These expectations
// used to carry the padded form and called it "canonical" — that was the
// previous collapse's output written down as a rule, and it meant every toggle
// silently inserted spaces into the author's markup.
describe('expand → collapse round-trip', () => {
  it('is byte-exact when the HTML text nodes carry no padding', () => {
    // CONTRACT: collapse normalizes whitespace inside HTML prop values —
    // text nodes end up space-separated from their tags ("<p> Hello </p>").
    // An input already in that canonical form round-trips byte-exactly.
    const canonical = '{% include "card.html" with body="<p>Hello</p>" title="Hi" only %}';
    expect(collapseFormatInclude(prettyFormatInclude(canonical, ''))).toBe(canonical);
  });

  it('normalizes only intra-HTML whitespace, never drops props/with/only', () => {
    const original = '{% include "card.html" with body="<p>Hello</p>" title="Hi" only %}';
    const collapsed = collapseFormatInclude(prettyFormatInclude(original, ''));
    // Exact output: HTML value whitespace-normalized, everything else intact.
    expect(collapsed).toBe('{% include "card.html" with body="<p>Hello</p>" title="Hi" only %}');
  });

  it('preserves every prop (name, quote style, value) across the round-trip', () => {
    const original = '{% include "x.html" with a="1" b=\'two\' c="<i>y</i>" only %}';
    const collapsed = collapseFormatInclude(prettyFormatInclude(original, ''));
    expect(collapsed).toBe('{% include "x.html" with a="1" b=\'two\' c="<i>y</i>" only %}');

    const reparsed = parseIncludeTag(collapsed);
    expect(reparsed?.props.map(p => p.name)).toEqual(['a', 'b', 'c']);
    expect(reparsed?.props.map(p => p.quote)).toEqual(['"', "'", '"']);
    // Non-HTML values survive byte-exact
    expect(reparsed?.props[0]?.value).toBe('1');
    expect(reparsed?.props[1]?.value).toBe('two');
    expect(reparsed?.hasWith).toBe(true);
    expect(reparsed?.hasOnly).toBe(true);
  });

  it('preserves template paths containing spaces', () => {
    const original = '{% include "my partials/some file.html" with body="<b>x</b>" %}';
    expect(collapseFormatInclude(prettyFormatInclude(original, ''))).toBe(original);
  });

  it('preserves escaped quotes inside prop values', () => {
    const original = '{% include "x.html" with t="a \\" b<span>s</span>" %}';
    expect(collapseFormatInclude(prettyFormatInclude(original, ''))).toBe(original);
  });

  it('preserves whitespace-control delimiters across the round-trip', () => {
    const original = '{%- include "x.html" with c="<i>y</i>" -%}';
    expect(collapseFormatInclude(prettyFormatInclude(original, ''))).toBe(original);
  });
});

// The worst bug of the sweep: parseIncludeProps read only QUOTED values, and
// `continue`d without advancing, so the value was then re-read as the next prop
// name and dropped too. Every unquoted prop was invisible — and "Collapse All
// Includes" therefore DELETED it from the document.
describe('props whose value is not quoted', () => {
  const roundTrip = (src: string) => collapseFormatInclude(src).trim();

  it('keeps the commonest include there is', () => {
    const src = '{% include "card.html" with product=product %}';
    expect(roundTrip(src)).toBe(src);
  });

  it.each([
    ['a number', '{% include "c.html" with n=3 %}'],
    ['a boolean', '{% include "c.html" with flag=True %}'],
    ['a dotted path', '{% include "c.html" with x=a.b %}'],
    ['a filtered value', '{% include "c.html" with n=x|upper %}'],
  ])('keeps %s', (_label, src) => {
    expect(roundTrip(src)).toBe(src);
  });

  it('keeps quoted and unquoted props side by side, in order', () => {
    const src = '{% include "c.html" with a=1 t="q" b=x.y only %}';
    expect(roundTrip(src)).toBe(src);
  });

  it('reads them as props, not as stray names', () => {
    expect(parseIncludeProps('product=product n=3 t="q"').map(p => `${p.name}=${p.value}`)).toEqual(
      ['product=product', 'n=3', 't=q'],
    );
  });
});

// A value with no markup in it went through the HTML collapser anyway, which
// squeezes runs of spaces — so a title of "Hola  mundo" came back with one.
describe('ordinary text values', () => {
  it('keeps a doubled space', () => {
    const src = '{% include "c.html" with t="Hola  mundo" %}';
    expect(collapseFormatInclude(src).trim()).toBe(src);
  });

  it('keeps it even next to a value that DOES hold markup', () => {
    const src = '{% include "c.html" with body="<b>hi</b>" t="a  b" %}';
    expect(collapseFormatInclude(prettyFormatInclude(src, '')).trim()).toBe(src);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Text the parser cannot read comes back exactly as it went in.
//
// The collapse fallback was `text.replace(/\n\s*/g, ' ')` — a blind flattener
// that ran whenever `parseIncludeTag` returned null. Because it only moves
// whitespace, `preservingInk` waved it through, and a region of markup came back
// as one line. Refusing to act is always available; unflattening a file the
// author did not notice had changed is not.
// ─────────────────────────────────────────────────────────────────────────────
describe('collapseFormatInclude declines what it cannot parse', () => {
  const UNPARSEABLE = [
    '{% include "card.html"\n<p>hello</p>\n<span>world</span>',
    '{% include\n  "card.html"',
    '{% include "card.html" with title=\n',
    'not an include at all\n  indented line',
    '{% include "card.html" with title="unclosed\n  more text',
  ];

  it('returns the original text, byte for byte', () => {
    for (const text of UNPARSEABLE) {
      expect(parseIncludeTag(text), `fixture is parseable: ${text}`).toBeNull();
      expect(collapseFormatInclude(text)).toBe(text);
    }
  });

  it('never changes the line count of text it declines', () => {
    for (const text of UNPARSEABLE) {
      expect(collapseFormatInclude(text).split('\n')).toHaveLength(text.split('\n').length);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Expand then collapse gives back what was there.
//
// "Pretty" and "Collapse" are inverse commands on the same menu, and the author
// runs them a dozen times a day. Inside an HTML prop VALUE a space is content —
// `hi <b>there</b> friend` renders with two spaces — and the collapse deleted
// the newline the expansion had introduced together with everything around it,
// so the pair came back as `hi<b>there</b>friend`. Only whitespace changed, so
// the ink guard allowed it: two clicks, a different rendered page.
// ─────────────────────────────────────────────────────────────────────────────
describe('pretty and collapse are inverses', () => {
  const ROUND_TRIP_CORPUS = [
    '{% include "card.html" with body="hi <b>there</b> friend" %}',
    '{% include "card.html" with body="<p>one</p><p>two</p>" %}',
    '{% include "card.html" with body="a <span>b</span> c <em>d</em> e" %}',
    '{% include "card.html" with title="Hola  mundo" %}',
    '{% include "card.html" with body="<ul><li>x</li> <li>y</li></ul>" %}',
    '{% include "card.html" with body="text with trailing " %}',
    '{% include "card.html" with a="1" b="<b>2</b>" c="three words here" %}',
    '{% include "card.html" only %}',
    '{% include "card.html" %}',
  ];

  it.each(ROUND_TRIP_CORPUS)('collapse(pretty(x)) === x for %s', source => {
    expect(collapseFormatInclude(prettyFormatInclude(source, ''))).toBe(source);
  });

  it('survives being run twice', () => {
    for (const source of ROUND_TRIP_CORPUS) {
      const once = collapseFormatInclude(prettyFormatInclude(source, ''));
      expect(collapseFormatInclude(prettyFormatInclude(once, ''))).toBe(source);
    }
  });
});
