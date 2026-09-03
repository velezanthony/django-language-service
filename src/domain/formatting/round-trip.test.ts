/**
 * What the formatter promises about text it does not mean to change.
 *
 * `preservingInk` guards the non-whitespace characters, and that guard holds.
 * These are the four ways the formatter changed a document anyway — all of them
 * through whitespace, which is exactly the blind spot:
 *
 *   - a `{% if %}` written among a tag's attributes made the attribute rewriter
 *     drop the tag delimiters, so the ink guard threw the whole rewrite away and
 *     format-on-save silently stopped indenting the file at all;
 *   - a document with CRLF line endings came back with LF, so every line showed
 *     as changed on every save;
 *   - `<pre` inside an attribute VALUE opened a preservation block that never
 *     closed, and the rest of the file came back verbatim;
 *   - the trailing spaces on the first line of a `<pre>` were trimmed, and a
 *     browser does render those.
 */
import { describe, it, expect } from 'vitest';
import { formatDocument, DEFAULT_FORMAT_OPTIONS } from './formatter';
import { expandHtmlAttributes } from './dtl-parser';

const format = (text: string) => formatDocument(text, DEFAULT_FORMAT_OPTIONS);

describe('line endings survive formatting', () => {
  it('keeps CRLF when the document uses CRLF', () => {
    const source = '<div>\r\n<p>hello</p>\r\n</div>\r\n';
    const formatted = format(source);
    expect(formatted).toContain('\r\n');
    expect(formatted.split('\n').every(l => l === '' || l.endsWith('\r'))).toBe(true);
  });

  it('keeps LF when the document uses LF', () => {
    expect(format('<div>\n<p>hello</p>\n</div>\n')).not.toContain('\r');
  });

  it('does not rewrite every line of a CRLF document that is already formatted', () => {
    const source = '<div>\r\n    <p>hello</p>\r\n</div>\r\n';
    expect(format(format(source))).toBe(format(source));
  });
});

describe('a DTL tag among HTML attributes does not disable the formatter', () => {
  // Long enough to cross printWidth, which is what makes the formatter expand
  // a tag's attributes onto their own lines — the path that drops the tag.
  const WITH_CONDITIONAL_ATTR = [
    '<div>',
    '<button class="btn btn-primary btn-large rounded shadow" data-analytics-id="checkout-submit-button" {% if disabled %}disabled{% endif %} id="go" aria-label="Submit the order now">Go</button>',
    '</div>',
  ].join('\n');

  it('still indents the document', () => {
    const formatted = format(WITH_CONDITIONAL_ATTR);
    expect(formatted.split('\n')[1]).toMatch(/^\s+</);
  });

  it('keeps the tag delimiters', () => {
    const formatted = format(WITH_CONDITIONAL_ATTR);
    expect(formatted).toContain('{% if disabled %}');
    expect(formatted).toContain('{% endif %}');
  });

  it.each([
    '<a {% if x %}href="/a"{% else %}href="/b"{% endif %}>link</a>',
    '<input {{ attrs }} name="q">',
    '<div class="{% if a %}on{% endif %}">x</div>',
    '<img src="{% static \'a.png\' %}" alt="a">',
  ])('loses nothing from %s', line => {
    const source = `<section>\n${line}\n</section>`;
    const ink = (t: string) => t.replace(/\s+/g, '');
    expect(ink(format(source))).toBe(ink(source));
  });
});

describe('<pre> preservation starts at a real element', () => {
  it('is not opened by the text inside an attribute value', () => {
    const source = [
      '<div data-hint="use <pre> for code">',
      '<p>hello</p>',
      '</div>',
      '<section>',
      '<p>world</p>',
      '</section>',
    ].join('\n');
    const formatted = format(source);
    // The lines after the attribute are still indented by the formatter.
    expect(formatted.split('\n')[4]).toMatch(/^\s+<p>world<\/p>/);
  });

  it('keeps the trailing spaces on the first line of a real <pre>', () => {
    const source = '<pre>keep these   \nand this line</pre>\n';
    expect(format(source)).toContain('keep these   ');
  });

  it('still preserves a real <pre> block whole', () => {
    const source = '<div>\n<pre>\n    indented\n      more\n</pre>\n</div>\n';
    expect(format(source)).toContain('\n    indented\n      more\n');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Attribute expansion does not dismantle a template tag.
//
// `HTML_ATTRIBUTE_PATTERN` knows about names, `=` and quoted values. It does not
// know about `{%` or `%}`, so expanding a long tag turned
// `{% if disabled %}disabled{% endif %}` into four bare words — `if`,
// `disabled`, `disabled`, `endif` — with the delimiters gone. The ink guard then
// threw the rewrite away, which is the good outcome and still means
// format-on-save silently stopped indenting a file that contains one.
// ─────────────────────────────────────────────────────────────────────────────
describe('expandHtmlAttributes keeps a DTL tag whole', () => {
  const expand = (line: string) => expandHtmlAttributes(line, 1, '    ', 60) ?? [];
  const ink = (t: string) => t.replace(/\s+/g, '');

  it.each([
    '<button class="btn btn-primary rounded" {% if disabled %}disabled{% endif %} id="go">',
    '<a class="link link-primary underline" {% if active %}aria-current="page"{% endif %} href="/x">',
    '<input class="field field-large" {{ widget_attrs }} name="q" placeholder="Search the catalogue">',
    '<div class="card card-large shadow" {% for a in attrs %}{{ a }}{% endfor %} id="wrap">',
  ])('loses nothing from %s', line => {
    expect(ink(expand(line).join(''))).toBe(ink(line));
  });

  it('puts the whole tag on one line', () => {
    const lines = expand(
      '<button class="btn btn-primary rounded" {% if disabled %}disabled{% endif %} id="go">',
    );
    expect(lines.map(l => l.trim())).toContain('{% if disabled %}');
    expect(lines.map(l => l.trim())).toContain('{% endif %}');
  });

  it('still treats DTL inside a quoted value as part of that attribute', () => {
    const lines = expand('<div class="{% if a %}on{% endif %}" id="wrapper" data-role="panel">');
    expect(lines.map(l => l.trim())).toContain('class="{% if a %}on{% endif %}"');
  });

  it('still expands an ordinary tag', () => {
    const lines = expand(
      '<div class="a-very-long-class-name" id="an-identifier" data-role="panel">',
    );
    expect(lines).toHaveLength(4);
  });
});
