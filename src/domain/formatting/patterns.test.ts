/**
 * The formatter's regex vocabulary. Nothing here has behaviour of its own, so
 * the temptation is to leave it untested — which is exactly how
 * HTML_ATTRIBUTE_PATTERN came to drop the `{%` and `%}` off a conditional
 * attribute. Losing them turned `{% if a %}disabled{% endif %}` into four bare
 * words, the formatter's ink guard threw the whole rewrite away, and
 * format-on-save silently stopped indenting every file containing one. An
 * audit found it; no test did.
 *
 * So these are the PROPERTIES each pattern owes its callers, not a list of
 * strings that happen to match today.
 */
import { describe, it, expect } from 'vitest';
import {
  HTML_VOID_ELEMENTS,
  DTL_MID_LEVEL_TAGS,
  END_TAG_PATTERN,
  TEMPLATE_TAG_PATTERN,
  EXTENDS_TAG_PATTERN,
  HTML_OPENING_TAG_PATTERN,
  HTML_CLOSING_TAG_PATTERN,
  HTML_TAG_WITH_ATTRIBUTES_PATTERN,
  HTML_ATTRIBUTE_PATTERN,
} from './patterns';

/** Fresh instance per call — a shared /g regex carries `lastIndex` across
 *  calls, and every caller in the codebase clones for that reason. */
const all = (pattern: RegExp, text: string): RegExpMatchArray[] => [
  ...text.matchAll(new RegExp(pattern.source, 'g')),
];
const captured = (pattern: RegExp, text: string): string[] =>
  all(pattern, text).map(m => m[1] ?? '');
const matched = (pattern: RegExp, text: string): string[] => all(pattern, text).map(m => m[0]);

// ── The pattern that broke ────────────────────────────────────────────────────

describe('HTML_ATTRIBUTE_PATTERN loses nothing', () => {
  // The rule, and the only one that matters: the pieces put back together are
  // the input again. The formatter prints one piece per line, so anything the
  // pattern cannot name is text that vanishes from the user's file.
  const survives = (attributes: string): boolean => {
    const strip = (s: string): string => s.replace(/\s+/g, '');
    return strip(matched(HTML_ATTRIBUTE_PATTERN, attributes).join('')) === strip(attributes);
  };

  it.each([
    ['plain attributes', `class="a" id='b'`],
    ['a valueless attribute', `data-x=1 hidden`],
    ['a whole DTL tag standing as an attribute', `{% if disabled %}disabled{% endif %}`],
    ['a DTL variable standing as an attribute', `{{ extra_attrs }}`],
    ['DTL inside a quoted value', `class="{% if a %}on{% endif %}"`],
    ['a DTL variable inside a quoted value', `class="btn {{ variant }}"`],
    ['Alpine and Vue style names', `@click="go()" :bound="v" x-data="{}"`],
    ['JSON in a single-quoted value', `hx-vals='{"a": 1}'`],
    ['a > inside a quoted value', `x="a>b"`],
    ['a bare unquoted value', `width=100 height=50`],
  ])('reassembles %s', (_what, attributes) => {
    expect(survives(attributes)).toBe(true);
  });

  it('keeps a DTL tag whole rather than splitting it into words', () => {
    expect(matched(HTML_ATTRIBUTE_PATTERN, `{% if disabled %}disabled{% endif %}`)).toEqual([
      '{% if disabled %}',
      'disabled',
      '{% endif %}',
    ]);
  });

  it('treats DTL inside a quoted value as part of that attribute', () => {
    expect(matched(HTML_ATTRIBUTE_PATTERN, `class="{% if a %}on{% endif %}" id="x"`)).toEqual([
      `class="{% if a %}on{% endif %}"`,
      `id="x"`,
    ]);
  });
});

// ── Tag recognition ───────────────────────────────────────────────────────────

describe('TEMPLATE_TAG_PATTERN names the tag in a {% … %}', () => {
  it.each([
    ['a plain tag', `{% if x %}`, ['if']],
    ['whitespace control', `{%- if x -%}`, ['if']],
    ['both tags of a one-line block', `{% if a %}{% endif %}`, ['if', 'endif']],
    [
      'a tag with a variable between it and its closer',
      `{% if a %}{{ b }}{% endif %}`,
      ['if', 'endif'],
    ],
    ['a tag broken over lines', `{% if\n  x %}`, ['if']],
    ['arguments containing quotes', `{% include "a/b.html" with x=1 %}`, ['include']],
    // A percent sign inside a tag's arguments is a character, not the start of
    // the closing delimiter. Missing the OPENER while still seeing its
    // `{% endif %}` pushes the indent level one step negative and every line
    // after it in the file is indented wrong.
    ['a percent inside a string argument', `{% if x|default:"50%" %}`, ['if']],
    ['a percent in a translated literal', `{% trans "100% free" %}`, ['trans']],
  ])('reads %s', (_what, source, expected) => {
    expect(captured(TEMPLATE_TAG_PATTERN, source)).toEqual(expected);
  });

  it('never runs past the end of one tag into the next', () => {
    expect(matched(TEMPLATE_TAG_PATTERN, `{% if a %}text{% endif %}`)).toEqual([
      '{% if a %}',
      '{% endif %}',
    ]);
  });

  it('says nothing about an unterminated tag', () => {
    expect(captured(TEMPLATE_TAG_PATTERN, `{% if a`)).toEqual([]);
  });
});

describe('END_TAG_PATTERN names what a closer closes', () => {
  it.each([
    ['{% endif %}', ['if']],
    ['{% endblock %}', ['block']],
    ['{%- endfor -%}', ['for']],
    ['{% endblock content %}', ['block']],
    ['{% endif %}{% endfor %}', ['if', 'for']],
  ])('%s', (source, expected) => {
    expect(captured(END_TAG_PATTERN, source)).toEqual(expected);
  });

  it('does not mistake a tag merely beginning with "end" for a closer', () => {
    // `endswith` is not a block closer; the capture must be the base name of a
    // real `end___`, and `discoverBlockOpeners` would otherwise invent a
    // `{% swith %}` block that no template has.
    expect(captured(END_TAG_PATTERN, '{% endblock %}')).toEqual(['block']);
  });
});

describe('EXTENDS_TAG_PATTERN finds the tag that must sit at column zero', () => {
  it.each([`{% extends "base.html" %}`, `{%- extends 'base.html' -%}`, `  {% extends var %}`])(
    'matches %s',
    source => {
      expect(EXTENDS_TAG_PATTERN.test(source)).toBe(true);
    },
  );

  it.each([`{% extendsomething %}`, `{% block extends %}`, `<p>extends</p>`])(
    'does not match %s',
    source => {
      expect(EXTENDS_TAG_PATTERN.test(source)).toBe(false);
    },
  );

  it('is not global, so repeated .test() calls agree', () => {
    // A /g regex keeps lastIndex between calls; formatter.ts calls .test()
    // directly on this one, so a stray flag would make every second line lie.
    expect(EXTENDS_TAG_PATTERN.global).toBe(false);
    const line = `{% extends "base.html" %}`;
    expect([1, 2, 3].map(() => EXTENDS_TAG_PATTERN.test(line))).toEqual([true, true, true]);
  });
});

// ── HTML shapes ───────────────────────────────────────────────────────────────

describe('HTML tag patterns anchor at the start of the line', () => {
  it.each([
    ['<div class="x">', 'div'],
    ['<my-element>', 'my-element'],
    ['<ns:tag>', 'ns:tag'],
    ['<Component.Sub>', 'Component.Sub'],
  ])('%s opens %s', (line, name) => {
    expect(HTML_OPENING_TAG_PATTERN.exec(line)?.[1]).toBe(name);
  });

  it.each(['</div>', '</my-element>', '</ns:tag>'])('%s reads as a closer', line => {
    expect(HTML_CLOSING_TAG_PATTERN.test(line)).toBe(true);
  });

  it.each(['<div>', '<!-- c -->', 'text </div>'])('%s does not read as a closer', line => {
    expect(HTML_CLOSING_TAG_PATTERN.test(line)).toBe(false);
  });

  it('an opener found mid-line is not an opener', () => {
    expect(HTML_OPENING_TAG_PATTERN.test('text <div>')).toBe(false);
  });
});

describe('HTML_TAG_WITH_ATTRIBUTES_PATTERN splits a tag into name, attributes and closer', () => {
  it('separates the three parts of a normal tag', () => {
    const m = HTML_TAG_WITH_ATTRIBUTES_PATTERN.exec('<a href="/x" class="b">');
    expect([m?.[1], m?.[2], m?.[3]]).toEqual(['<a', 'href="/x" class="b"', '>']);
  });

  it('keeps the self-closing slash with the closer, not with the attributes', () => {
    const m = HTML_TAG_WITH_ATTRIBUTES_PATTERN.exec('<img src="/x" alt="y" />');
    expect(m?.[3]).toBe('/>');
    expect(m?.[2]).toBe('src="/x" alt="y" ');
  });

  it('does not match a tag with no attributes at all', () => {
    expect(HTML_TAG_WITH_ATTRIBUTES_PATTERN.test('<div>')).toBe(false);
  });

  it('keeps a quoted > inside the attribute it belongs to', () => {
    const m = HTML_TAG_WITH_ATTRIBUTES_PATTERN.exec('<div data-cmp="a>b" id="x">');
    expect(m?.[2]).toBe('data-cmp="a>b" id="x"');
  });

  it('keeps a DTL block standing in for an attribute', () => {
    const m = HTML_TAG_WITH_ATTRIBUTES_PATTERN.exec(
      '<button {% if d %}disabled{% endif %} id="g">',
    );
    expect(m?.[2]).toBe('{% if d %}disabled{% endif %} id="g"');
  });

  // The tag must BE the line. Reading `<a href="/x">text</a>` as one tag whose
  // attributes are `href="/x">text</a` makes expansion print the link's words
  // one per line and lose the `>`; the ink guard then rejects the rewrite and
  // `singleAttributePerLine` silently stops formatting the whole file.
  it.each([
    ['content after the tag', '<a href="/x">text</a>'],
    ['a nested tag after it', '<li class="row"><span>x</span></li>'],
    ['a closing tag after it', '<div id="a"></div>'],
  ])('refuses a line with %s', (_what, line) => {
    expect(HTML_TAG_WITH_ATTRIBUTES_PATTERN.test(line)).toBe(false);
  });
});

// ── The two sets ──────────────────────────────────────────────────────────────

describe('the tag-name sets', () => {
  it('every void element is lowercase, because callers lowercase before asking', () => {
    for (const el of HTML_VOID_ELEMENTS) expect(el).toBe(el.toLowerCase());
  });

  it('holds no element that takes children', () => {
    for (const el of ['div', 'span', 'p', 'script', 'a', 'li']) {
      expect(HTML_VOID_ELEMENTS.has(el)).toBe(false);
    }
  });

  it('a mid-level tag is neither an opener nor an `end___`', () => {
    // These dedent and re-indent on the same line; naming one `end___` would
    // double-count it against `computeIndentationDecrease`.
    for (const tag of DTL_MID_LEVEL_TAGS) expect(tag.startsWith('end')).toBe(false);
  });
});
