import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { formatDocument, collapseMultilineIncludes, DEFAULT_FORMAT_OPTIONS } from './formatter';

describe('DEFAULT_FORMAT_OPTIONS — contract with package.json manifest', () => {
  // contributes.configuration in package.json is the PUBLIC contract: when the
  // user has no explicit settings, the adapter receives the manifest defaults.
  // The in-code defaults MUST match them or direct calls (tests, tooling)
  // silently format differently than the extension does.
  const manifest = JSON.parse(readFileSync(join(__dirname, '../../../package.json'), 'utf8'));
  const props = manifest.contributes.configuration.properties;

  it.each([
    ['tabWidth', 'djangoLanguageService.format.tabWidth'],
    ['useTabs', 'djangoLanguageService.format.useTabs'],
    ['printWidth', 'djangoLanguageService.format.printWidth'],
    ['singleAttributePerLine', 'djangoLanguageService.format.singleAttributePerLine'],
  ] as const)('%s matches the manifest default', (optionKey, settingKey) => {
    expect(DEFAULT_FORMAT_OPTIONS[optionKey]).toBe(props[settingKey].default);
  });
});

describe('formatDocument', () => {
  it('indents inside a {% block %} tag using the default tabWidth (2, per manifest)', () => {
    const input = '{% block content %}\n<p>hello</p>\n{% endblock %}';
    const result = formatDocument(input);
    expect(result).toContain('\n  <p>hello</p>');
  });

  it('honours an explicit tabWidth override', () => {
    const input = '{% block content %}\n<p>hello</p>\n{% endblock %}';
    const result = formatDocument(input, { tabWidth: 4 });
    expect(result).toContain('\n    <p>hello</p>');
  });

  it('dedents at {% endif %} back to opener level', () => {
    const input = '{% if x %}\n<p>yes</p>\n{% endif %}';
    const result = formatDocument(input);
    const lines = result.split('\n');
    const ifLine = lines.find(l => l.includes('{% if'));
    const endifLine = lines.find(l => l.includes('{% endif %}'));
    expect(ifLine?.startsWith('{% if')).toBe(true);
    expect(endifLine?.trim()).toBe('{% endif %}');
  });

  it('collapses consecutive blank lines to one', () => {
    const input = '<p>a</p>\n\n\n<p>b</p>';
    const result = formatDocument(input);
    expect(result).not.toContain('\n\n\n');
  });

  it('handles {% extends %} at column zero regardless of surrounding indent', () => {
    const input = '    {% extends "base.html" %}\n{% block content %}{% endblock %}';
    const result = formatDocument(input);
    const firstLine = result.split('\n')[0];
    expect(firstLine).toBe('{% extends "base.html" %}');
  });

  it('roundtrip: formatting an already-formatted document is idempotent', () => {
    const input = '{% block content %}\n    <p>hello</p>\n{% endblock %}\n';
    const once = formatDocument(input);
    const twice = formatDocument(once);
    expect(twice).toBe(once);
  });
});

describe('collapseMultilineIncludes', () => {
  it('collapses a multi-line include to a single line', () => {
    const input = '{% include "partial.html"\n  with foo="bar" %}';
    const result = collapseMultilineIncludes(input);
    expect(result).not.toContain('\n');
    expect(result).toContain('{% include');
  });

  it('leaves single-line includes unchanged', () => {
    const input = '{% include "partial.html" with foo="bar" %}';
    const result = collapseMultilineIncludes(input);
    expect(result).toBe(input);
  });
});

// <pre> and <textarea> are the two elements whose text content preserves
// whitespace. Re-indenting them changes what the page renders — ASCII art
// shifts, code samples lose their structure, a textarea's value gains leading
// spaces. <script>/<style> are the opposite case and stay reindented.
describe('whitespace-significant elements', () => {
  /** Content between the first <tag …> and its </tag>, verbatim. */
  const inner = (s: string, tag: string): string => {
    const open = s.indexOf(`<${tag}`);
    const gt = s.indexOf('>', open);
    const close = s.indexOf(`</${tag}`, gt);
    return s.slice(gt + 1, close);
  };

  it('leaves differing indentation inside <pre> alone', () => {
    const src = `<div>\n<pre>\n  a\n      b\n</pre>\n</div>`;
    expect(inner(formatDocument(src), 'pre')).toBe('\n  a\n      b\n');
  });

  it('keeps ASCII art aligned', () => {
    const src = `<pre>\n +---+\n |   |\n +---+\n</pre>`;
    expect(inner(formatDocument(src), 'pre')).toBe('\n +---+\n |   |\n +---+\n');
  });

  it('keeps a blank line inside <pre>', () => {
    const src = `<pre>\na\n\n    b\n</pre>`;
    expect(inner(formatDocument(src), 'pre')).toBe('\na\n\n    b\n');
  });

  it('leaves a textarea value alone', () => {
    const src = `<form>\n<textarea>\nhola\n    mundo\n</textarea>\n</form>`;
    expect(inner(formatDocument(src), 'textarea')).toBe('\nhola\n    mundo\n');
  });

  it('still indents the opening tag — that whitespace is outside the element', () => {
    const out = formatDocument(`<div>\n<pre>\nx\n</pre>\n</div>`);
    expect(out).toContain('  <pre>');
  });

  it('resumes formatting after the block closes', () => {
    const out = formatDocument(`<div>\n<pre>\nx\n</pre>\n<p>y</p>\n</div>`);
    expect(out).toContain('  <p>y</p>');
  });

  it('does not enter preserve mode for a one-line <pre>', () => {
    const out = formatDocument(`<div>\n<pre>x</pre>\n<p>y</p>\n</div>`);
    expect(out).toContain('  <p>y</p>');
  });

  it('still reindents <script>, where whitespace does not matter', () => {
    const out = formatDocument(`<div>\n<script>\nvar a = 1;\n</script>\n</div>`);
    expect(out).toContain('    var a = 1;');
  });

  it('is idempotent around a preserved block', () => {
    const src = `<div>\n<pre>\n  a\n      b\n</pre>\n</div>`;
    const once = formatDocument(src);
    expect(formatDocument(once)).toBe(once);
  });
});

// A formatter may move text around. It must never change it.
describe('the formatter never alters content', () => {
  const ink = (s: string): string => s.replace(/\s+/g, '');
  const SAMPLES = [
    `<div class="{% if x %}on{% endif %}">y</div>`,
    `{% extends "base.html" %}\n{% block c %}\n<p>x</p>\n{% endblock %}`,
    `{% for a in b %}{% for c in d %}<li>{{ c }}</li>{% endfor %}{% endfor %}`,
    `<!-- <div> {% if x %} -->\n<p>y</p>`,
    `<a title="a > b">x</a>`,
    `<br><hr><img src="a.png">`,
    `<p>ñáéíóú 中文 🎉</p>`,
    `<div>x</div></div>`,
    `<div><p>x`,
    `{# {% endif %} #}\n<div>x</div>`,
    `<script>const o = {{a: 1}};</script>`,
    `<pre>\n  a\n      b\n</pre>`,
    '<div>'.repeat(30) + 'x' + '</div>'.repeat(30),
  ];

  it('preserves every non-whitespace character', () => {
    for (const src of SAMPLES) {
      expect(ink(formatDocument(src)), src.slice(0, 40)).toBe(ink(src));
    }
  });

  it('is idempotent on all of them', () => {
    for (const src of SAMPLES) {
      const once = formatDocument(src);
      expect(formatDocument(once), src.slice(0, 40)).toBe(once);
    }
  });

  it('does not throw on degenerate input', () => {
    for (const src of ['', '   \n\n   ', '<', '{%', '{{', '</div>']) {
      expect(() => formatDocument(src), JSON.stringify(src)).not.toThrow();
    }
  });
});

// A Django tag may wrap — long {% if %} conditions and {% include … with … %}
// do it constantly. The formatter read one line at a time, so `{% if a` was not
// recognised as an opener and its whole body stayed at the wrong indent.
describe('tags that wrap across lines', () => {
  it('indents the body of a wrapped {% if %}', () => {
    expect(formatDocument('{% if a\n   and b %}\nx\n{% endif %}')).toBe(
      '{% if a\n  and b %}\n  x\n{% endif %}\n',
    );
  });

  it('indents the body of a wrapped {% for %}', () => {
    expect(formatDocument('{% for p in products\n     %}\n<li>x</li>\n{% endfor %}')).toBe(
      '{% for p in products\n  %}\n  <li>x</li>\n{% endfor %}\n',
    );
  });

  it('is idempotent on a wrapped tag', () => {
    const once = formatDocument('{% if a\n   and b %}\nx\n{% endif %}');
    expect(formatDocument(once)).toBe(once);
  });

  it('leaves a single-line tag exactly as it was', () => {
    expect(formatDocument('{% if a %}\n<p>x</p>\n{% endif %}')).toBe(
      '{% if a %}\n  <p>x</p>\n{% endif %}\n',
    );
  });
});

// Django emits everything between {% verbatim %} and {% endverbatim %} exactly
// as written. Re-indenting it changes the rendered page — the same reason <pre>
// and <textarea> are already left alone, and this tag says so explicitly.
describe('{% verbatim %} content', () => {
  it("keeps the author's whitespace, byte for byte", () => {
    const src = '{% verbatim %}\n{{ vue }}\n    <b>x</b>\n{% endverbatim %}';
    expect(formatDocument(src)).toBe(src + '\n');
  });

  it('does not indent a Vue expression to match the block', () => {
    expect(formatDocument('{% verbatim %}\n{{ vue }}\n{% endverbatim %}')).not.toContain(
      '  {{ vue }}',
    );
  });

  it('resumes formatting after the block', () => {
    expect(
      formatDocument('{% verbatim %}\n{{ v }}\n{% endverbatim %}\n{% if a %}\nx\n{% endif %}'),
    ).toBe('{% verbatim %}\n{{ v }}\n{% endverbatim %}\n{% if a %}\n  x\n{% endif %}\n');
  });
});

// The include collapser was a second implementation of the join rule, running
// as a pre-pass BEFORE everything else — so it reached past the protection the
// same file gives <pre> and {% verbatim %}, and squeezed runs of spaces.
describe('collapsing a wrapped {% include %}', () => {
  it('still joins an ordinary one', () => {
    expect(formatDocument('{% include "c.html"\n   with t="x" %}')).toBe(
      '{% include "c.html" with t="x" %}\n',
    );
  });

  it('keeps a doubled space inside a quoted string', () => {
    expect(formatDocument('{% include "c.html"\n   with t="Hello  world" %}')).toContain(
      't="Hello  world"',
    );
  });

  it('keeps a doubled space inside a filename', () => {
    expect(formatDocument('{% include "my  file.html"\n   only %}')).toContain('"my  file.html"');
  });

  // In {% verbatim %} the tag is literal TEXT, so joining it changes the page.
  it('leaves one inside {% verbatim %} exactly as written', () => {
    const src = '{% verbatim %}\n{% include "a.html"\n   with y=2 %}\n{% endverbatim %}';
    expect(formatDocument(src)).toBe(src + '\n');
  });

  // In <pre> the tag is still a tag, so joining would not change the rendered
  // page — but this formatter's rule for <pre> is "do not touch", and a pre-pass
  // reaching past that rule is what broke it.
  it('leaves one inside <pre> alone', () => {
    const src = '<pre>\n{% include "s.html"\n     with x=1 %}\n</pre>';
    expect(formatDocument(src)).toBe(src + '\n');
  });
});
