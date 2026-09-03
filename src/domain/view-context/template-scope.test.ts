/**
 * Ported from legacy __tests__/context-diagnostics.test.ts — the sections
 * that specify TEMPLATE SCOPE behavior: {% for %} iterator typing, {% with %}
 * bindings, and cross-file {% include ... with k=v %} kwargs. Re-expressed
 * against the engine builders directly (the diagnostics adapter is Fase-6
 * part 2 and composes these + resolveChain).
 */
import { describe, it, expect } from 'vitest';
import {
  buildIteratorTypes,
  applyIncludeWithKwargs,
  collectTemplateLocalNames,
} from './template-scope';
import { resolveChain } from './chain-resolver';
import { createModelGraph } from './model-graph';
import type { Model } from '$domain/types/model';
import type { Field } from '$domain/types/field';
import type { Relation } from '$domain/types/relation';
import type { ResolvedType } from './types';

// ── Fixtures ─────────────────────────────────────────────────────────────────

function mkField(name: string, fieldType = 'CharField'): Field {
  return { name, fieldType };
}

function mkModel(
  name: string,
  fields: Field[],
  relations: Relation[] = [],
  properties: string[] = [],
): Model {
  return {
    kind: 'model',
    name,
    appLabel: 'shop',
    filePath: 'apps/shop/models.py',
    line: 1,
    fields,
    relations,
    // helpers take plain names; a Model stores {name, source}
    properties: properties.map(name => ({ name, source: '@property' })),
  };
}

const PRODUCT = mkModel(
  'Product',
  [mkField('name'), mkField('status')],
  [{ kind: 'fk', fromModel: 'shop.Product', toModel: 'Author', fieldName: 'category' }],
  ['is_active'],
);
const AUTHOR = mkModel('Author', [mkField('name'), mkField('email')], [], []);
const ORDER = mkModel(
  'Order',
  [mkField('total', 'DecimalField')],
  [
    {
      kind: 'fk',
      fromModel: 'shop.Order',
      toModel: 'Author',
      fieldName: 'customer',
      relatedName: 'orders',
    },
  ],
);
const REVIEW = mkModel(
  'Review',
  [mkField('rating', 'IntegerField')],
  [
    {
      kind: 'fk',
      fromModel: 'shop.Review',
      toModel: 'Product',
      fieldName: 'product',
      relatedName: 'reviews',
    },
  ],
);

const graph = createModelGraph([PRODUCT, AUTHOR, ORDER, REVIEW]);

const ctx = (entries: Record<string, ResolvedType>): Map<string, ResolvedType> =>
  new Map(Object.entries(entries));

// ── {% for %} iterators ──────────────────────────────────────────────────────

describe('buildIteratorTypes — {% for %}', () => {
  it('iterator over a context queryset becomes an instance', () => {
    const iters = buildIteratorTypes(
      '{% for product in products %}{{ product.name }}{% endfor %}',
      ctx({ products: { kind: 'queryset', model: 'Product' } }),
      graph,
    );
    expect(iters.get('product')).toMatchObject({ kind: 'instance', model: 'Product' });
  });

  it('iterator inherits annotations from the queryset', () => {
    const iters = buildIteratorTypes(
      '{% for p in products %}{{ p.review_count }}{% endfor %}',
      ctx({
        products: {
          kind: 'queryset',
          model: 'Product',
          annotations: [{ name: 'review_count', func: 'Count' }],
        },
      }),
      graph,
    );
    const p = iters.get('p')!;
    expect(p.annotations?.[0]?.name).toBe('review_count');
    // And the chain validates through resolveChain:
    expect(resolveChain(['p', 'review_count'], p, graph).error).toBeUndefined();
    expect(resolveChain(['p', 'bogus'], p, graph).error).toBeDefined();
  });

  it('iterator inherits values() projection', () => {
    const iters = buildIteratorTypes(
      '{% for row in rows %}{% endfor %}',
      ctx({ rows: { kind: 'queryset', model: 'Product', valuesFields: ['name'] } }),
      graph,
    );
    const row = iters.get('row')!;
    expect(resolveChain(['row', 'name'], row, graph).error).toBeUndefined();
    expect(resolveChain(['row', 'status'], row, graph).error).toBeDefined();
  });

  it('dotted iterable resolves through the chain (reverse FK manager)', () => {
    const iters = buildIteratorTypes(
      '{% for order in author.orders %}{% endfor %}',
      ctx({ author: { kind: 'instance', model: 'Author' } }),
      graph,
    );
    expect(iters.get('order')).toMatchObject({ kind: 'instance', model: 'shop.Order' });
  });

  it('dotted iterable through .all keeps working', () => {
    const iters = buildIteratorTypes(
      '{% for r in product.reviews.all %}{% endfor %}',
      ctx({ product: { kind: 'instance', model: 'Product' } }),
      graph,
    );
    expect(iters.get('r')).toMatchObject({ kind: 'instance', model: 'shop.Review' });
  });

  it('dotted for-loop over another model DROPS parent annotations', () => {
    const iters = buildIteratorTypes(
      '{% for r in product.reviews %}{% endfor %}',
      ctx({
        product: {
          kind: 'instance',
          model: 'Product',
          annotations: [{ name: 'review_count', func: 'Count' }],
        },
      }),
      graph,
    );
    expect(iters.get('r')?.model).toBe('shop.Review');
    expect(iters.get('r')?.annotations).toBeUndefined();
  });

  it('unknown iterable root produces no iterator entry', () => {
    const iters = buildIteratorTypes('{% for x in missing %}{% endfor %}', ctx({}), graph);
    expect(iters.has('x')).toBe(false);
  });

  it('iterating an instance (not iterable) produces no entry', () => {
    const iters = buildIteratorTypes(
      '{% for x in product %}{% endfor %}',
      ctx({ product: { kind: 'instance', model: 'Product' } }),
      graph,
    );
    expect(iters.has('x')).toBe(false);
  });

  it('nested for — inner iterable resolved against outer iterator', () => {
    const iters = buildIteratorTypes(
      '{% for p in products %}{% for r in p.reviews %}{% endfor %}{% endfor %}',
      ctx({ products: { kind: 'queryset', model: 'Product' } }),
      graph,
    );
    expect(iters.get('p')).toMatchObject({ kind: 'instance', model: 'Product' });
    expect(iters.get('r')).toMatchObject({ kind: 'instance', model: 'shop.Review' });
  });
});

// ── {% with %} bindings ──────────────────────────────────────────────────────

describe('buildIteratorTypes — {% with %}', () => {
  it('simple binding propagates the instance type', () => {
    const iters = buildIteratorTypes(
      '{% with p=product %}{{ p.name }}{% endwith %}',
      ctx({ product: { kind: 'instance', model: 'Product' } }),
      graph,
    );
    expect(iters.get('p')).toMatchObject({ kind: 'instance', model: 'Product' });
  });

  it('dotted chain binding propagates the resolved type', () => {
    const iters = buildIteratorTypes(
      '{% with cat=product.category %}{% endwith %}',
      ctx({ product: { kind: 'instance', model: 'Product' } }),
      graph,
    );
    expect(iters.get('cat')).toMatchObject({ kind: 'instance', model: 'Author' });
  });

  it('chain resolving to a manager is coerced to queryset', () => {
    const iters = buildIteratorTypes(
      '{% with revs=product.reviews %}{% endwith %}',
      ctx({ product: { kind: 'instance', model: 'Product' } }),
      graph,
    );
    expect(iters.get('revs')).toMatchObject({ kind: 'queryset', model: 'shop.Review' });
  });

  it('multiple bindings on the same tag', () => {
    const iters = buildIteratorTypes(
      '{% with p=product cat=product.category %}{% endwith %}',
      ctx({ product: { kind: 'instance', model: 'Product' } }),
      graph,
    );
    expect(iters.get('p')?.model).toBe('Product');
    expect(iters.get('cat')?.model).toBe('Author');
  });

  it('literal bindings are skipped (strings and numbers)', () => {
    const iters = buildIteratorTypes(
      `{% with title='hello' n=5 %}{% endwith %}`,
      ctx({ product: { kind: 'instance', model: 'Product' } }),
      graph,
    );
    expect(iters.has('title')).toBe(false);
    expect(iters.has('n')).toBe(false);
  });

  it('missing root binding is skipped silently', () => {
    const iters = buildIteratorTypes('{% with x=missing.name %}{% endwith %}', ctx({}), graph);
    expect(iters.has('x')).toBe(false);
  });
});

// ── collectTemplateLocalNames — names bound by the template itself ───────────

describe('collectTemplateLocalNames', () => {
  it('collects for-loop iterators even when the iterable is unknown', () => {
    const names = collectTemplateLocalNames('{% for item in missing %}{{ item }}{% endfor %}');
    expect(names.has('item')).toBe(true);
    expect(names.has('missing')).toBe(false);
  });

  it('collects multi-iterator for-loops (key, value)', () => {
    const names = collectTemplateLocalNames('{% for k, v in pairs %}{% endfor %}');
    expect(names.has('k')).toBe(true);
    expect(names.has('v')).toBe(true);
  });

  it('collects with-binding names regardless of RHS resolvability', () => {
    const names = collectTemplateLocalNames(`{% with total=items.count title='x' %}{% endwith %}`);
    expect(names.has('total')).toBe(true);
    expect(names.has('title')).toBe(true);
  });

  it('empty template yields empty set', () => {
    expect(collectTemplateLocalNames('').size).toBe(0);
  });
});

// ── {% include 'x.html' with k=v %} incoming kwargs ──────────────────────────

describe('applyIncludeWithKwargs', () => {
  it('kwarg resolves to FK type in the active partial', () => {
    const contextTypes = ctx({ product: { kind: 'instance', model: 'Product' } });
    const iters = new Map<string, ResolvedType>();
    applyIncludeWithKwargs(
      [{ name: 'item', expr: 'product.category' }],
      contextTypes,
      iters,
      graph,
    );
    expect(iters.get('item')).toMatchObject({ kind: 'instance', model: 'Author' });
  });

  it('queryset (reverse FK) kwarg lands as queryset', () => {
    const contextTypes = ctx({ author: { kind: 'instance', model: 'Author' } });
    const iters = new Map<string, ResolvedType>();
    applyIncludeWithKwargs([{ name: 'items', expr: 'author.orders' }], contextTypes, iters, graph);
    expect(iters.get('items')).toMatchObject({ kind: 'queryset', model: 'shop.Order' });
  });

  it('literal kwargs are skipped (no useful type info)', () => {
    const iters = new Map<string, ResolvedType>();
    applyIncludeWithKwargs(
      [
        { name: 'title', expr: "'hello'" },
        { name: 'n', expr: '3' },
      ],
      ctx({}),
      iters,
      graph,
    );
    expect(iters.size).toBe(0);
  });

  it('missing root binding skips the kwarg silently', () => {
    const iters = new Map<string, ResolvedType>();
    applyIncludeWithKwargs([{ name: 'x', expr: 'missing.name' }], ctx({}), iters, graph);
    expect(iters.has('x')).toBe(false);
  });

  it('kwarg expr can reference an existing iterator binding', () => {
    const contextTypes = ctx({ products: { kind: 'queryset', model: 'Product' } });
    const iters = new Map<string, ResolvedType>([['p', { kind: 'instance', model: 'Product' }]]);
    applyIncludeWithKwargs([{ name: 'cat', expr: 'p.category' }], contextTypes, iters, graph);
    expect(iters.get('cat')).toMatchObject({ kind: 'instance', model: 'Author' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// `{% with %}` and `{% for %}` bind in whichever order the author wrote them.
//
// The with-bindings were applied AFTER every for-loop, so a loop over a
// with-binding found no root and left its variable untyped. Nothing was
// reported — a typo inside that loop simply went unchecked, which is worse than
// a false warning because there is nothing to notice.
// ─────────────────────────────────────────────────────────────────────────────
describe('with and for bind in either order', () => {
  it('types a loop over a {% with %} binding', () => {
    const types = buildIteratorTypes(
      '{% with prod=review.product %}{% for r in prod.reviews.all %}{{ r.rating }}{% endfor %}{% endwith %}',
      ctx({ review: { kind: 'instance', model: 'Review' } }),
      graph,
    );
    expect(types.get('prod')).toMatchObject({ model: 'Product' });
    expect(types.get('r')?.model).toMatch(/Review$/);
  });

  it('still types a {% with %} that names a loop variable', () => {
    const types = buildIteratorTypes(
      '{% for p in products %}{% with cat=p.category %}{{ cat.name }}{% endwith %}{% endfor %}',
      ctx({ products: { kind: 'queryset', model: 'Product' } }),
      graph,
    );
    expect(types.get('cat')).toMatchObject({ model: 'Author' });
  });

  it('binds both when they cross', () => {
    const types = buildIteratorTypes(
      [
        '{% with prod=review.product %}',
        '{% for r in prod.reviews.all %}',
        '{% with who=r.product %}{{ who.name }}{% endwith %}',
        '{% endfor %}',
        '{% endwith %}',
      ].join('\n'),
      ctx({ review: { kind: 'instance', model: 'Review' } }),
      graph,
    );
    expect(types.get('prod')).toMatchObject({ model: 'Product' });
    expect(types.get('r')?.model).toMatch(/Review$/);
    expect(types.get('who')).toMatchObject({ model: 'Product' });
  });
});
