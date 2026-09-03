import { describe, it, expect } from 'vitest';
import { parseIncludeTag, parseIncludeProps, collapseHtmlContent } from './include-parser';

describe('parseIncludeTag', () => {
  it('parses a simple include without props', () => {
    const result = parseIncludeTag('{% include "base.html" %}');
    expect(result).not.toBeNull();
    expect(result?.templatePath).toBe('"base.html"');
    expect(result?.props).toHaveLength(0);
    expect(result?.hasWith).toBe(false);
    expect(result?.hasOnly).toBe(false);
  });

  it('parses an include with with+only', () => {
    const result = parseIncludeTag('{% include "card.html" with title="Hello" only %}');
    expect(result?.hasWith).toBe(true);
    expect(result?.hasOnly).toBe(true);
    expect(result?.props[0]?.name).toBe('title');
    expect(result?.props[0]?.value).toBe('Hello');
  });

  it('returns null for non-include text', () => {
    expect(parseIncludeTag('{% block content %}')).toBeNull();
  });

  it('handles multi-line include', () => {
    const text = '{% include "part.html"\n  with foo="bar"\n%}';
    const result = parseIncludeTag(text);
    expect(result).not.toBeNull();
    expect(result?.props[0]?.name).toBe('foo');
  });

  it('parses a bare "only" without with', () => {
    const result = parseIncludeTag('{% include "x.html" only %}');
    expect(result?.hasWith).toBe(false);
    expect(result?.hasOnly).toBe(true);
    expect(result?.props).toEqual([]);
  });

  it('preserves template paths containing spaces', () => {
    const result = parseIncludeTag('{% include "my partials/some file.html" %}');
    expect(result?.templatePath).toBe('"my partials/some file.html"');
  });

  it('captures quotes of the other kind inside a prop value byte-exact', () => {
    const result = parseIncludeTag(`{% include "c.html" with data='<div class="x">hi</div>' %}`);
    expect(result?.props).toEqual([
      { name: 'data', quote: "'", value: '<div class="x">hi</div>', hasHTML: true },
    ]);
  });

  it('captures escaped quotes inside a prop value byte-exact', () => {
    const result = parseIncludeTag('{% include "x.html" with t="a \\" b" %}');
    expect(result?.props).toEqual([{ name: 't', quote: '"', value: 'a \\" b', hasHTML: false }]);
  });
});

describe('parseIncludeProps', () => {
  it('returns empty array for empty string', () => {
    expect(parseIncludeProps('')).toHaveLength(0);
  });

  it('parses multiple props', () => {
    const result = parseIncludeProps('foo="bar" baz=\'qux\'');
    expect(result).toHaveLength(2);
    expect(result[0]?.name).toBe('foo');
    expect(result[1]?.name).toBe('baz');
  });

  it('detects hasHTML for props containing HTML', () => {
    const result = parseIncludeProps('content="<p>hello</p>"');
    expect(result[0]?.hasHTML).toBe(true);
  });
});

describe('collapseHtmlContent', () => {
  it('collapses multi-line HTML to a single line', () => {
    const html = '<p>\n  <span>hi</span>\n</p>';
    const result = collapseHtmlContent(html);
    expect(result).not.toContain('\n');
    expect(result).toContain('<p>');
  });
});
