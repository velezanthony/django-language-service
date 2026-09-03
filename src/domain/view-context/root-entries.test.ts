/**
 * Root-level scope for completion.
 *
 * Three features answer "is this name in scope?" — completion, diagnostics and
 * hover — and they used to disagree. The adapter listed only locals that had
 * been given a TYPE, so `{% for tag in tags %}` over an untyped iterable
 * offered no `tag`, while diagnostics accepted it and hover explained it.
 */
import { describe, it, expect } from 'vitest';
import { buildRootEntries } from './completion-entries';
import type { ContextVar } from '$domain/types/context-var';
import type { ResolvedType } from './types';

const VARS: ContextVar[] = [
  { name: 'products', kind: 'queryset', typeRef: 'Product' },
  { name: 'title', kind: 'scalar' },
  { name: 'order_count', kind: 'scalar', conditional: true },
];
const TYPED = new Map<string, ResolvedType>([['p', { kind: 'instance', model: 'Product' }]]);

const labels = (tpl: string, typed = TYPED) => buildRootEntries(VARS, tpl, typed).map(e => e.label);

describe('buildRootEntries', () => {
  it('offers every context key', () => {
    expect(labels('', new Map())).toEqual(['products', 'title', 'order_count']);
  });

  it('describes a typed key and flags a conditional one', () => {
    const byName = new Map(buildRootEntries(VARS, '', new Map()).map(e => [e.label, e]));
    expect(byName.get('products')!.detail).toBe('queryset: Product');
    expect(byName.get('order_count')!.detail).toContain('not always available');
    expect(byName.get('order_count')!.sortLast).toBe(true);
    expect(byName.get('title')!.sortLast).toBeUndefined();
  });

  it('offers a typed loop variable', () => {
    expect(labels('{% for p in products %}{% endfor %}')).toContain('p');
  });

  // The bug: an unresolved iterable does not make the loop variable less real.
  it('offers a loop variable whose iterable has no type', () => {
    expect(labels('{% for tag in tags %}{% endfor %}', new Map())).toContain('tag');
  });

  it('offers a {% with %} binding', () => {
    expect(labels('{% with subtotal=whatever %}{% endwith %}', new Map())).toContain('subtotal');
  });

  it('offers an {% ... as name %} alias', () => {
    expect(labels("{% cycle 'a' 'b' as rowcolor %}", new Map())).toContain('rowcolor');
  });

  it('offers a loop variable over a filtered iterable', () => {
    expect(labels('{% for p in products|slice:":3" %}{% endfor %}', new Map())).toContain('p');
  });

  it('does not duplicate a local that shadows a context key', () => {
    const out = labels('{% for products in products %}{% endfor %}', new Map());
    expect(out.filter(l => l === 'products')).toHaveLength(1);
  });

  it('does not invent names from a template that binds nothing', () => {
    expect(labels('<p>{{ title }}</p>', new Map())).toEqual(['products', 'title', 'order_count']);
  });
});
