import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { parseHelpers } from './helpers';

const f = (rel: string) => readFileSync(join(__dirname, '__fixtures__', rel), 'utf8');

describe('parseHelpers', () => {
  it('happy path — extracts filters (spec PARSEHELPERS)', () => {
    const source = f('helpers/tag-and-filter.py');
    const result = parseHelpers(source, { filePath: 'shop/templatetags/shop_tags.py' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const helpers = result.value;

    // All entries have kind: 'helper'
    expect(helpers.every(h => h.kind === 'helper')).toBe(true);

    // library derived from filename
    expect(helpers.every(h => h.library === 'shop_tags')).toBe(true);

    // @register.filter → helperKind: 'filter'
    const currency = helpers.find(h => h.name === 'currency');
    expect(currency).toBeDefined();
    expect(currency?.helperKind).toBe('filter');

    // @register.filter(name='truncate_middle') → explicit name used
    const truncate = helpers.find(h => h.name === 'truncate_middle');
    expect(truncate).toBeDefined();
    expect(truncate?.helperKind).toBe('filter');
  });

  it('extracts simple_tag entries (spec PARSEHELPERS)', () => {
    const source = f('helpers/tag-and-filter.py');
    const result = parseHelpers(source, { filePath: 'shop/templatetags/shop_tags.py' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const helpers = result.value;

    // @register.simple_tag
    const featured = helpers.find(h => h.name === 'featured_products');
    expect(featured).toBeDefined();
    expect(featured?.helperKind).toBe('tag');

    // @register.simple_tag(takes_context=True)
    const basketCount = helpers.find(h => h.name === 'basket_item_count');
    expect(basketCount).toBeDefined();
    expect(basketCount?.helperKind).toBe('tag');

    // @register.inclusion_tag(...)
    const priceBox = helpers.find(h => h.name === 'price_box');
    expect(priceBox).toBeDefined();
    expect(priceBox?.helperKind).toBe('tag');
  });

  it('non-templatetag file (no template.Library()) → empty array', () => {
    const source = `
from django.db import models

class Product(models.Model):
    name = models.CharField(max_length=200)
`;
    const result = parseHelpers(source, { filePath: 'shop/models.py' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([]);
  });

  it('empty input → empty array', () => {
    const result = parseHelpers('');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([]);
  });

  it('file with Library() but no decorators → empty array', () => {
    const source = `
from django import template
register = template.Library()

def helper_util(x):
    return x * 2
`;
    const result = parseHelpers(source, { filePath: 'shop/templatetags/utils.py' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(0);
  });

  describe('multi-line decorators (Black-formatted)', () => {
    it('inclusion_tag with args split across lines still registers the helper', () => {
      const source = `from django import template
register = template.Library()

@register.inclusion_tag(
    "components/card.html"
)
def card(product):
    return {"product": product}
`;
      const result = parseHelpers(source, { filePath: 'shop/templatetags/cards.py' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const card = result.value.find(h => h.name === 'card');
      expect(card).toBeDefined();
      expect(card?.helperKind).toBe('tag');
      expect(card?.line).toBe(7); // def line, 1-based
    });

    it('multi-line decorator with explicit name= kwarg on its own line', () => {
      const source = `from django import template
register = template.Library()

@register.filter(
    name="fancy"
)
def fancy_impl(value):
    return value
`;
      const result = parseHelpers(source, { filePath: 'shop/templatetags/fmt.py' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const fancy = result.value.find(h => h.name === 'fancy');
      expect(fancy).toBeDefined();
      expect(fancy?.helperKind).toBe('filter');
    });

    it('blank line between decorator and def keeps the helper', () => {
      const source = `from django import template
register = template.Library()

@register.simple_tag

def spaced_tag():
    return 42
`;
      const result = parseHelpers(source, { filePath: 'shop/templatetags/misc.py' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const spaced = result.value.find(h => h.name === 'spaced_tag');
      expect(spaced).toBeDefined();
      expect(spaced?.helperKind).toBe('tag');
    });

    it('comment line between decorator and def keeps the helper', () => {
      const source = `from django import template
register = template.Library()

@register.filter
# formats a number
def humanize(value):
    return value
`;
      const result = parseHelpers(source, { filePath: 'shop/templatetags/misc.py' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.find(h => h.name === 'humanize')).toBeDefined();
    });

    it('regression — single-line decorator with args still works', () => {
      const source = `from django import template
register = template.Library()

@register.inclusion_tag('shop/partials/box.html', takes_context=True)
def box(context):
    return {}
`;
      const result = parseHelpers(source, { filePath: 'shop/templatetags/box.py' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const box = result.value.find(h => h.name === 'box');
      expect(box).toBeDefined();
      expect(box?.helperKind).toBe('tag');
      expect(box?.line).toBe(5);
    });
  });

  it('line numbers are 1-based and point to the def line', () => {
    const source = `from django import template\nregister = template.Library()\n\n@register.simple_tag\ndef my_tag():\n    pass\n`;
    const result = parseHelpers(source, { filePath: 'app/templatetags/tags.py' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const tag = result.value.find(h => h.name === 'my_tag');
    expect(tag).toBeDefined();
    expect(tag?.line).toBe(5); // 'def my_tag():' is line 5
  });
});

// A parenthesis that is not code does not open anything. The multi-line
// decorator reader counted every '(' and ')' in the raw line, so one written
// inside a comment or a string literal left the reader convinced the argument
// list was still open: it swallowed the `def` and every following line, and the
// whole library lost that helper — and any helper after it. The same class of
// bug was fixed in `_shared/python-tokens` (stringLiteralLength), whose reader
// this now uses.
describe('parseHelpers — parens that are not code do not open an argument list', () => {
  const PREAMBLE = 'from django import template\nregister = template.Library()\n\n';
  const names = (source: string): string[] => {
    const result = parseHelpers(PREAMBLE + source, {
      filePath: 'shop/templatetags/shop_tags.py',
    });
    if (!result.ok) throw new Error('not ok');
    return result.value.map(h => h.name);
  };

  it('an unbalanced ( in a trailing comment', () => {
    expect(names('@register.simple_tag  # returns (a, b\ndef price_tag():\n    pass\n')).toEqual([
      'price_tag',
    ]);
  });

  it('an unbalanced ( inside a decorator string argument', () => {
    expect(names(`@register.filter(name='money(')\ndef money(v):\n    return v\n`)).toEqual([
      'money(',
    ]);
  });

  it('an unbalanced ) inside a decorator string argument', () => {
    expect(names(`@register.filter(name='money)')\ndef money(v):\n    return v\n`)).toEqual([
      'money)',
    ]);
  });

  it('an unbalanced ( in a comment AFTER a real argument list', () => {
    expect(
      names(`@register.filter(name='money')  # money( is a typo\ndef m(v):\n    return v\n`),
    ).toEqual(['money']);
  });

  it('and the helpers that follow the offending one are not lost either', () => {
    expect(
      names(
        '@register.simple_tag  # see (docs\ndef first():\n    pass\n\n@register.filter\ndef second(v):\n    return v\n',
      ),
    ).toEqual(['first', 'second']);
  });

  it('while a genuinely multi-line argument list still spans its lines', () => {
    expect(
      names(
        "@register.inclusion_tag(\n    'shop/box.html',\n    name='box',\n)\ndef b():\n    pass\n",
      ),
    ).toEqual(['box']);
  });
});
