import { describe, it, expect } from 'vitest';
import { findAllIncludeTagBoundsInLines, findMultiLineIncludes } from './include-finder';

describe('findAllIncludeTagBoundsInLines', () => {
  it('finds a single-line include', () => {
    const lines = ['<p>hello</p>', '{% include "card.html" %}', '<p>world</p>'];
    const bounds = findAllIncludeTagBoundsInLines(lines);
    expect(bounds).toHaveLength(1);
    expect(bounds[0]?.startLine).toBe(1);
    expect(bounds[0]?.endLine).toBe(1);
  });

  it('finds a multi-line include', () => {
    const lines = ['{% include "card.html"', '  with foo="bar"', '%}'];
    const bounds = findAllIncludeTagBoundsInLines(lines);
    expect(bounds).toHaveLength(1);
    expect(bounds[0]?.startLine).toBe(0);
    expect(bounds[0]?.endLine).toBe(2);
  });

  it('finds multiple includes', () => {
    const lines = ['{% include "a.html" %}', '<p>separator</p>', '{% include "b.html" %}'];
    const bounds = findAllIncludeTagBoundsInLines(lines);
    expect(bounds).toHaveLength(2);
  });

  it('returns empty array when no includes are present', () => {
    const lines = ['<p>hello</p>', '{% block content %}', '{% endblock %}'];
    expect(findAllIncludeTagBoundsInLines(lines)).toHaveLength(0);
  });
});

// ── Multi-line includes, as one rule ──────────────────────────────────────────

describe('findMultiLineIncludes', () => {
  // This lived inline in the diagnostics adapter, written against a
  // TextDocument. That is why counting includes across the workspace meant
  // opening up to 5000 TextDocuments at activation — every one of them
  // resident for the session and firing onDidOpenTextDocument into four
  // other adapters. As a function over text, the badge pass can just read
  // bytes, and the two callers can no longer disagree about what counts.
  it('finds nothing in an empty document', () => {
    expect(findMultiLineIncludes('')).toEqual([]);
  });

  it('ignores a single-line include', () => {
    expect(findMultiLineIncludes('{% include "a.html" %}')).toEqual([]);
  });

  it('finds one that wraps', () => {
    const text = '{% include "a.html"\n   with x=1 %}';
    expect(findMultiLineIncludes(text)).toEqual([
      { startLine: 0, endLine: 1, openingStart: 0, openingEnd: 19 },
    ]);
  });

  it('reports the opening range past the indentation', () => {
    const text = '  {% include "a.html"\n   with x=1 %}';
    expect(findMultiLineIncludes(text)[0]).toMatchObject({ openingStart: 2, openingEnd: 21 });
  });

  it('finds several', () => {
    const text = [
      '{% include "a.html"',
      '   with x=1 %}',
      '<p>text</p>',
      '{% include "b.html"',
      '   with y=2 %}',
    ].join('\n');
    expect(findMultiLineIncludes(text).map(r => [r.startLine, r.endLine])).toEqual([
      [0, 1],
      [3, 4],
    ]);
  });

  it('drops an include whose %} never arrives', () => {
    expect(findMultiLineIncludes('{% include "a.html"\n   with x=1')).toEqual([]);
  });

  it('handles CRLF line endings', () => {
    expect(findMultiLineIncludes('{% include "a.html"\r\n   with x=1 %}')).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A bound that never met `%}` is not an include tag.
//
// The scan walks forward from `{% include` until it finds the closer or runs out
// of document. On a tag the author has not finished typing — an ordinary state
// while editing — there is no closer, so the bound swallowed the rest of the
// file. "Collapse All Includes" then flattened all of it onto one line, and the
// ink guard allowed it because only whitespace had changed.
//
// The rule: a bound the finder reports is a tag, and a tag is closed.
// ─────────────────────────────────────────────────────────────────────────────
describe('every reported bound is a closed tag', () => {
  it('reports nothing for an include the author has not closed yet', () => {
    const lines = ['<div>', '  {% include "card.html"', '  <p>hello</p>', '  <span>world</span>'];
    expect(findAllIncludeTagBoundsInLines(lines)).toHaveLength(0);
  });

  it('still finds the closed tag that follows an unclosed one', () => {
    const lines = ['{% include "a.html"', '<p>x</p>', '{% include "b.html" %}'];
    const bounds = findAllIncludeTagBoundsInLines(lines);
    expect(bounds).toHaveLength(1);
    expect(bounds[0]?.startLine).toBe(2);
  });

  it('holds over a hostile corpus: no bound is ever missing its closer', () => {
    const corpus: string[][] = [
      ['{% include "a.html"'],
      ['{% include', '  "a.html"', '  %}'],
      ['{% include "a.html"', '{% include "b.html" %}'],
      ['{% include "a.html" %}', '{% include "b.html"'],
      ['  {% include "a.html" with x="1"', '  y="2"'],
      ['{% include "a.html" with note="50%"', '%}'],
      ['<p>{% include "a.html" %}</p>', '{% include'],
    ];
    for (const lines of corpus) {
      for (const bound of findAllIncludeTagBoundsInLines(lines)) {
        expect(bound.tagText, `unclosed bound from ${JSON.stringify(lines)}`).toContain('%}');
      }
    }
  });
});
