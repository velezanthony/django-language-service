/**
 * The formatter's indent arithmetic and attribute expansion.
 *
 * `formatter.test.ts` and `round-trip.test.ts` exercise these through
 * `formatDocument`, where a wrong answer and a compensating second wrong answer
 * look the same. These are the rules each function owes on its own:
 *
 *   - increase and decrease are INVERSES on a line that opens and closes the
 *     same block, so a one-line `{% if %}…{% endif %}` moves nothing;
 *   - expansion is LOSSLESS, because the formatter prints one piece per line
 *     and anything the reader cannot name is text deleted from the user's file;
 *   - a brace inside a string is a character, not a bracket.
 */
import { describe, it, expect } from 'vitest';
import {
  discoverBlockOpeners,
  extractDjangoTemplateTags,
  computeIndentationIncrease,
  computeIndentationDecrease,
  expandHtmlAttributes,
  computeBraceIndent,
} from './dtl-parser';

const openers = (text: string): string[] => [...discoverBlockOpeners(text)].sort();

// ── Discovery ─────────────────────────────────────────────────────────────────

describe('discoverBlockOpeners learns a block from its closer', () => {
  // Django has no fixed list of block tags: a custom library can register one.
  // The document itself is the authority, and the `{% end___ %}` is the proof.
  it.each([
    ['{% if a %}{% endif %}', ['if']],
    ['{% for a in b %}{% endfor %}', ['for']],
    ['{% block c %}{% endblock %}', ['block']],
    ['{% cache 1 k %}{% endcache %}', ['cache']],
    ['{% mywidget %}{% endmywidget %}', ['mywidget']],
    ['{%- if a -%}{%- endif -%}', ['if']],
    ['{% endblock content %}', ['block']],
  ])('%s', (source, expected) => {
    expect(openers(source)).toEqual(expected);
  });

  it('learns nothing from a document with no closers', () => {
    expect(openers('<p>{{ x }}</p>{% include "a.html" %}')).toEqual([]);
  });

  it('names each block once however many times it closes', () => {
    expect(openers('{% if a %}{% endif %}{% if b %}{% endif %}')).toEqual(['if']);
  });

  it('gives the same answer when asked twice', () => {
    // The pattern it reads is a shared /g regex; a leaked `lastIndex` would
    // make the second document in a session see fewer blocks than the first.
    const source = '{% if a %}{% endif %}{% for x in y %}{% endfor %}';
    expect(openers(source)).toEqual(openers(source));
  });
});

describe('extractDjangoTemplateTags names every tag on a line, in order', () => {
  it.each([
    ['{% if a %}', ['if']],
    ['{% if a %}{% else %}{% endif %}', ['if', 'else', 'endif']],
    ['<p>{{ x }}</p>', []],
    ['{% if x|default:"50%" %}', ['if']],
    ['{%- with a=1 -%}', ['with']],
  ])('%s', (line, expected) => {
    expect(extractDjangoTemplateTags(line)).toEqual(expected);
  });

  it('gives the same answer when asked twice', () => {
    const line = '{% if a %}{% endif %}';
    expect(extractDjangoTemplateTags(line)).toEqual(extractDjangoTemplateTags(line));
  });
});

// ── The indent arithmetic ─────────────────────────────────────────────────────

describe('increase and decrease are inverses on a self-contained line', () => {
  const blocks = new Set(['if', 'for', 'block', 'with']);
  const net = (line: string): number =>
    computeIndentationIncrease(line, blocks) - computeIndentationDecrease(line);

  // A line that opens what it closes leaves the next line exactly where it was.
  // Getting this wrong does not show up as a mistake on THAT line — it shows up
  // as every line after it being wrong.
  it.each([
    '{% if a %}{% endif %}',
    '{% for x in y %}{% endfor %}',
    '{% block c %}{% endblock %}',
    '{% if a %}{% endif %}{% if b %}{% endif %}',
    '<div></div>',
    '<p>text</p>',
    '<br>',
    '<input type="text" />',
    '<hr/>',
    '<p>plain text with no tags at all</p>',
  ])('%s moves nothing', line => {
    expect(net(line)).toBe(0);
  });

  it.each([
    ['{% if a %}', 1],
    ['{% for x in y %}', 1],
    ['<div>', 1],
    ['<div class="a">', 1],
    ['{% endif %}', -1],
    ['</div>', -1],
    ['{% if a %}{% if b %}', 2],
    ['{% endif %}{% endif %}', -2],
  ])('%s moves by %s', (line, expected) => {
    expect(net(line)).toBe(expected);
  });

  it('a mid-level tag dedents itself and re-indents what follows', () => {
    // `{% else %}` sits at the opener's level and its body is indented again,
    // so it costs one of each and nets to zero.
    expect(computeIndentationDecrease('{% else %}')).toBe(1);
    expect(computeIndentationIncrease('{% else %}', blocks)).toBe(1);
    expect(net('{% else %}')).toBe(0);
  });

  it('a void element never opens a block, whatever its case', () => {
    for (const line of ['<br>', '<BR>', '<img src="x">', '<IMG SRC="x">', '<input name="a">']) {
      expect(computeIndentationIncrease(line, blocks)).toBe(0);
    }
  });

  it('a tag the document never closes is not a block', () => {
    // `blockOpeners` comes from the document's own `{% end___ %}` tags.
    expect(computeIndentationIncrease('{% include "a.html" %}', blocks)).toBe(0);
    expect(computeIndentationIncrease('{% custom %}', blocks)).toBe(0);
    expect(computeIndentationIncrease('{% custom %}', new Set(['custom']))).toBe(1);
  });

  it('an opener carrying a percent in its arguments still opens', () => {
    // `{% if x|default:"50%" %}` is ordinary Django. Missing the opener while
    // still seeing its closer flattened the whole block against the margin.
    expect(computeIndentationIncrease('{% if x|default:"50%" %}', blocks)).toBe(1);
    expect(computeIndentationIncrease('{% trans "100% free" %}', blocks)).toBe(0);
  });

  it('an HTML tag closed on the same line does not open', () => {
    expect(computeIndentationIncrease('<div class="a">text</div>', blocks)).toBe(0);
    expect(computeIndentationIncrease('<DIV>text</div>', blocks)).toBe(0);
  });
});

// ── Attribute expansion ───────────────────────────────────────────────────────

describe('expandHtmlAttributes', () => {
  const expand = (line: string, width = 40): string[] | null =>
    expandHtmlAttributes(line, 1, '  ', width);
  const ink = (s: string): string => s.replace(/\s+/g, '');

  it('leaves a line that already fits alone', () => {
    expect(expand('<a href="/x" class="b">', 200)).toBeNull();
  });

  it('counts the INDENT against the width, not just the text', () => {
    // The line is printed indented; measuring the bare text let a line that
    // will not fit slip through untouched.
    const line = '<a href="/x" class="b">';
    expect(expandHtmlAttributes(line, 0, '  ', line.length)).toBeNull();
    expect(expandHtmlAttributes(line, 4, '  ', line.length)).not.toBeNull();
  });

  it('leaves a single-attribute tag alone — there is nothing to spread', () => {
    expect(expand('<a href="/a/very/long/url/that/goes/on/and/on">')).toBeNull();
  });

  it.each([
    ['plain attributes', '<div class="a-long-class-name" id="an-identifier" data-role="panel">'],
    [
      'a DTL block as an attribute',
      '<button class="btn btn-primary" {% if d %}disabled{% endif %} id="go">',
    ],
    [
      'a DTL variable as an attribute',
      '<input class="field field-large" {{ widget_attrs }} name="q">',
    ],
    [
      'DTL inside a quoted value',
      '<div class="{% if a %}on{% endif %}" id="wrapper" data-role="p">',
    ],
    ['a self-closing tag', '<img src="/a/long/path/image.png" alt="a description" class="x" />'],
  ])('loses nothing when expanding %s', (_what, line) => {
    const out = expand(line);
    expect(out).not.toBeNull();
    expect(ink(out!.join(''))).toBe(ink(line));
  });

  it('puts exactly one attribute on each line', () => {
    const out = expand('<div class="a-long-class-name" id="an-identifier" data-role="panel">');
    expect(out?.map(l => l.trim())).toEqual([
      '<div',
      'class="a-long-class-name"',
      'id="an-identifier"',
      'data-role="panel">',
    ]);
  });

  it('indents the attributes one level deeper than the tag', () => {
    const out = expand('<div class="a-long-class-name" id="an-identifier" data-role="panel">')!;
    expect(out[0]).toBe('  <div');
    expect(out[1]).toBe('    class="a-long-class-name"');
  });

  it('refuses a line that is more than the tag, rather than mangling it', () => {
    // `<a …>text</a>` read as one tag makes the link TEXT into attributes: the
    // words are printed one per line and the `>` is lost. Declining is the only
    // safe answer — the caller then prints the line as it stands.
    expect(
      expand('<a href="/some/quite/long/url" class="btn btn-primary">Click here</a>'),
    ).toBeNull();
    expect(expand('<li class="a-long-class-name here"><span>content</span></li>')).toBeNull();
  });
});

// ── Brace arithmetic for embedded JS / CSS ────────────────────────────────────

describe('computeBraceIndent', () => {
  it.each([
    ['function f() {', 0, 1],
    ['}', 1, 0],
    ['} else {', 1, 1],
    ['const a = { b: 1 };', 0, 0],
    ['];', 1, 0],
    ['},', 1, 0],
    ['  }', 1, 0],
    ['const a = [', 0, 1],
    ['a: { b: [ 1 ] },', 0, 0],
  ])('%s → %s leading closers, %s net openers', (line, leadingClosers, netOpeners) => {
    expect(computeBraceIndent(line)).toEqual({ leadingClosers, netOpeners });
  });

  it('a brace inside a string is a character, not a bracket', () => {
    expect(computeBraceIndent(`const t = "{";`).netOpeners).toBe(0);
    expect(computeBraceIndent(`const t = '}';`).netOpeners).toBe(0);
    expect(computeBraceIndent('const t = `{`;').netOpeners).toBe(0);
    expect(computeBraceIndent(`const t = "{{ x }}";`).netOpeners).toBe(0);
  });

  it('never reports a negative number of openers', () => {
    // The caller adds this to a level that is already clamped at zero; a
    // negative would silently pull the rest of the block left.
    for (const line of ['}}}', '}', ']]', '} } }']) {
      expect(computeBraceIndent(line).netOpeners).toBeGreaterThanOrEqual(0);
    }
  });

  it('only counts closers that LEAD the line', () => {
    expect(computeBraceIndent('const a = 1; }').leadingClosers).toBe(0);
    expect(computeBraceIndent('} const a = 1;').leadingClosers).toBe(1);
  });
});
