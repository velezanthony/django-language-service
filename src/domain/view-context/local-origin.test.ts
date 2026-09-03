/**
 * A name can be perfectly well known and still carry no model type — the value
 * came off a local (`context['tags'] = product.tags.all()`), which the
 * inference does not shape. Consumers that only handle typed roots then show
 * nothing at all, which reads as "unknown variable". This is what they fall
 * back to.
 */
import { describe, it, expect } from 'vitest';
import { findLocalOrigin } from './template-scope';

describe('findLocalOrigin', () => {
  it('names what a loop variable iterates', () => {
    expect(findLocalOrigin(`{% for tag in tags %}{{ tag.name }}{% endfor %}`, 'tag')).toEqual({
      kind: 'loop',
      source: 'tags',
    });
  });

  it('handles a dotted iterable', () => {
    expect(findLocalOrigin(`{% for r in product.reviews %}{% endfor %}`, 'r')).toEqual({
      kind: 'loop',
      source: 'product.reviews',
    });
  });

  it('handles tuple unpacking', () => {
    expect(findLocalOrigin(`{% for k, v in rows %}{% endfor %}`, 'v')).toEqual({
      kind: 'loop',
      source: 'rows',
    });
  });

  it('names what a {% with %} binding was set to', () => {
    expect(findLocalOrigin(`{% with total=order.total %}{% endwith %}`, 'total')).toEqual({
      kind: 'with',
      source: 'order.total',
    });
  });

  it('returns null for a name that is not a local', () => {
    expect(findLocalOrigin(`{% for tag in tags %}{% endfor %}`, 'product')).toBeNull();
  });

  it('returns null on a template with no bindings', () => {
    expect(findLocalOrigin(`<p>{{ product.name }}</p>`, 'product')).toBeNull();
  });

  it('picks the loop the name actually belongs to', () => {
    const src = `{% for a in xs %}{% endfor %}{% for b in ys %}{% endfor %}`;
    expect(findLocalOrigin(src, 'b')).toEqual({ kind: 'loop', source: 'ys' });
  });
});
