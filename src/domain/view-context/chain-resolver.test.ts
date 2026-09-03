/**
 * Ported from legacy __tests__/chain-type-resolver.test.ts — the behavioral
 * spec of the dotted-chain type engine. Model fixtures re-expressed in the
 * new Model shape (scalar fields vs relations split).
 */
import { describe, it, expect } from 'vitest';
import { resolveChain } from './chain-resolver';
import { createModelGraph } from './model-graph';
import type { Model } from '$domain/types/model';
import type { Field } from '$domain/types/field';
import type { Relation } from '$domain/types/relation';
import type { ResolvedType } from './types';

// ── Fixtures (legacy blog/e-commerce graph) ──────────────────────────────────

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

function rel(
  kind: Relation['kind'],
  from: string,
  to: string,
  fieldName: string,
  relatedName?: string,
): Relation {
  return {
    kind,
    fromModel: from,
    toModel: to,
    fieldName,
    ...(relatedName !== undefined && { relatedName }),
  };
}

const PRODUCT = mkModel(
  'Product',
  [
    mkField('id', 'UUIDField'),
    mkField('name'),
    mkField('status'),
    mkField('created', 'DateTimeField'),
  ],
  [rel('fk', 'shop.Product', 'Author', 'category')],
  ['is_active'],
);

const AUTHOR = mkModel(
  'Author',
  [mkField('id', 'UUIDField'), mkField('name'), mkField('email', 'EmailField')],
  [rel('o2o', 'shop.Author', 'Profile', 'profile')],
  ['full_name'],
);

const PROFILE = mkModel('Profile', [
  mkField('id', 'UUIDField'),
  mkField('avatar'),
  mkField('location'),
]);

const ORDER = mkModel(
  'Order',
  [mkField('id', 'UUIDField'), mkField('name')],
  [
    rel('fk', 'shop.Order', 'Author', 'customer', 'orders'),
    rel('fk', 'shop.Order', 'Author', 'distributor', 'distributor_orders'),
  ],
  ['order_type'],
);

const REVIEW = mkModel(
  'Review',
  [mkField('id', 'UUIDField'), mkField('name')],
  [
    rel('fk', 'shop.Review', 'Product', 'product', 'reviews'),
    rel('m2m', 'shop.Review', 'Tag', 'tags', 'reviews'),
  ],
);

const WAREHOUSE = mkModel(
  'Warehouse',
  [mkField('id', 'UUIDField'), mkField('capacity', 'FloatField')],
  [rel('o2o', 'shop.Warehouse', 'Product', 'product', 'warehouse')],
);

const graph = createModelGraph([PRODUCT, AUTHOR, PROFILE, ORDER, REVIEW, WAREHOUSE]);

const instance = (model: string): ResolvedType => ({ kind: 'instance', model });
const manager = (model: string): ResolvedType => ({ kind: 'manager', model });
const queryset = (model: string): ResolvedType => ({ kind: 'queryset', model });

// ── SECTION 1: Instance — forward field access ───────────────────────────────

describe('resolveChain — instance forward access', () => {
  it('plain field resolves to primitive', () => {
    const r = resolveChain(['product', 'name'], instance('Product'), graph);
    expect(r.error).toBeUndefined();
    expect(r.finalType?.kind).toBe('primitive');
  });

  it('FK field resolves to instance of related model', () => {
    const r = resolveChain(['product', 'category'], instance('Product'), graph);
    expect(r.error).toBeUndefined();
    expect(r.finalType).toMatchObject({ kind: 'instance', model: 'Author' });
  });

  it('O2O forward resolves to instance of related model', () => {
    const r = resolveChain(['author', 'profile'], instance('Author'), graph);
    expect(r.finalType).toMatchObject({ kind: 'instance', model: 'Profile' });
  });

  it('M2M forward resolves to manager', () => {
    const r = resolveChain(['review', 'tags'], instance('Review'), graph);
    expect(r.finalType).toMatchObject({ kind: 'manager', model: 'Tag' });
  });

  it('@property resolves to primitive', () => {
    const r = resolveChain(['product', 'is_active'], instance('Product'), graph);
    expect(r.finalType?.kind).toBe('primitive');
  });

  it('invalid field returns error with level and field', () => {
    const r = resolveChain(['product', 'nonexistent'], instance('Product'), graph);
    expect(r.error).toBeDefined();
    expect(r.error?.level).toBe(1);
    expect(r.error?.field).toBe('nonexistent');
  });
});

// ── SECTION 2: Instance — reverse relation access ────────────────────────────

describe('resolveChain — reverse relations', () => {
  it('FK reverse resolves to manager', () => {
    const r = resolveChain(['author', 'orders'], instance('Author'), graph);
    expect(r.error).toBeUndefined();
    expect(r.finalType).toMatchObject({ kind: 'manager', model: 'shop.Order' });
  });

  it('O2O reverse resolves to instance (NOT manager)', () => {
    const r = resolveChain(['product', 'warehouse'], instance('Product'), graph);
    expect(r.error).toBeUndefined();
    expect(r.finalType).toMatchObject({ kind: 'instance', model: 'shop.Warehouse' });
  });

  it('unknown model gracefully skips (M2M reverse onto missing Tag)', () => {
    const r = resolveChain(['tag', 'reviews'], instance('Tag'), graph);
    expect(r.error).toBeUndefined();
  });

  it('multiple reverse rels on same model all valid', () => {
    const r1 = resolveChain(['author', 'orders'], instance('Author'), graph);
    const r2 = resolveChain(['author', 'distributor_orders'], instance('Author'), graph);
    expect(r1.error).toBeUndefined();
    expect(r2.error).toBeUndefined();
  });

  it('self-FK: parent resolves to instance, children to manager', () => {
    const CATEGORY = mkModel(
      'Category',
      [mkField('name')],
      [rel('fk', 'shop.Category', 'self', 'parent', 'children')],
    );
    const g = createModelGraph([CATEGORY]);
    const up = resolveChain(['category', 'parent', 'name'], instance('Category'), g);
    expect(up.error).toBeUndefined();
    expect(up.finalType?.kind).toBe('primitive');
    const down = resolveChain(['category', 'children', 'count'], instance('Category'), g);
    expect(down.error).toBeUndefined();
    expect(down.finalType?.kind).toBe('primitive');
  });
});

// ── SECTION 3: Manager/QuerySet — valid attributes ───────────────────────────

describe('resolveChain — manager/queryset attrs', () => {
  it('.all resolves to queryset', () => {
    const r = resolveChain(['orders', 'all'], manager('Order'), graph);
    expect(r.finalType).toMatchObject({ kind: 'queryset', model: 'Order' });
  });

  it('.count resolves to primitive', () => {
    expect(resolveChain(['orders', 'count'], manager('Order'), graph).finalType?.kind).toBe(
      'primitive',
    );
  });

  it('.exists resolves to primitive', () => {
    expect(resolveChain(['orders', 'exists'], manager('Order'), graph).finalType?.kind).toBe(
      'primitive',
    );
  });

  it('.first resolves to instance', () => {
    const r = resolveChain(['orders', 'first'], manager('Order'), graph);
    expect(r.finalType).toMatchObject({ kind: 'instance', model: 'Order' });
  });

  it('.last resolves to instance', () => {
    expect(resolveChain(['orders', 'last'], manager('Order'), graph).finalType?.kind).toBe(
      'instance',
    );
  });

  it('.none resolves to queryset', () => {
    expect(resolveChain(['orders', 'none'], manager('Order'), graph).finalType?.kind).toBe(
      'queryset',
    );
  });

  it('queryset accepts the same attrs as manager', () => {
    const r = resolveChain(['products', 'first'], queryset('Product'), graph);
    expect(r.finalType?.kind).toBe('instance');
  });
});

// ── SECTION 4: Manager/QuerySet — model field access is ERROR ────────────────

describe('resolveChain — field access on manager/queryset errors', () => {
  it('manager: model field access errors mentioning Manager', () => {
    const r = resolveChain(['orders', 'name'], manager('Order'), graph);
    expect(r.error).toBeDefined();
    expect(r.error?.field).toBe('name');
    expect(r.error?.message).toContain('Manager');
  });

  it('queryset: model field access errors mentioning QuerySet', () => {
    const r = resolveChain(['products', 'name'], queryset('Product'), graph);
    expect(r.error).toBeDefined();
    expect(r.error?.message).toContain('QuerySet');
  });

  it('manager: unknown attr errors', () => {
    expect(resolveChain(['orders', 'nonexistent'], manager('Order'), graph).error).toBeDefined();
  });
});

// ── SECTION 5: Multi-level chains ────────────────────────────────────────────

describe('resolveChain — multi-level chains', () => {
  it('product.category.name — FK→instance→field', () => {
    const r = resolveChain(['product', 'category', 'name'], instance('Product'), graph);
    expect(r.error).toBeUndefined();
    expect(r.finalType?.kind).toBe('primitive');
  });

  it('product.category.full_name — FK→instance→property', () => {
    const r = resolveChain(['product', 'category', 'full_name'], instance('Product'), graph);
    expect(r.error).toBeUndefined();
    expect(r.finalType?.kind).toBe('primitive');
  });

  it('product.category.profile.avatar — FK→O2O→field', () => {
    const r = resolveChain(
      ['product', 'category', 'profile', 'avatar'],
      instance('Product'),
      graph,
    );
    expect(r.error).toBeUndefined();
    expect(r.finalType?.kind).toBe('primitive');
  });

  it('product.warehouse.capacity — O2O reverse→field', () => {
    const r = resolveChain(['product', 'warehouse', 'capacity'], instance('Product'), graph);
    expect(r.error).toBeUndefined();
    expect(r.finalType?.kind).toBe('primitive');
  });

  it('author.orders.first.name — FK reverse→manager→first→field', () => {
    const r = resolveChain(['author', 'orders', 'first', 'name'], instance('Author'), graph);
    expect(r.error).toBeUndefined();
    expect(r.finalType?.kind).toBe('primitive');
  });

  it('author.orders.name — field on manager is ERROR at level 2', () => {
    const r = resolveChain(['author', 'orders', 'name'], instance('Author'), graph);
    expect(r.error).toBeDefined();
    expect(r.error?.level).toBe(2);
    expect(r.error?.field).toBe('name');
  });

  it('product.reviews.all — FK reverse→manager→all is queryset', () => {
    const r = resolveChain(['product', 'reviews', 'all'], instance('Product'), graph);
    expect(r.error).toBeUndefined();
    expect(r.finalType).toMatchObject({ kind: 'queryset', model: 'shop.Review' });
  });

  it('product.reviews.count — FK reverse→manager→count is primitive', () => {
    const r = resolveChain(['product', 'reviews', 'count'], instance('Product'), graph);
    expect(r.error).toBeUndefined();
    expect(r.finalType?.kind).toBe('primitive');
  });
});

// ── SECTION 6: Edge cases ────────────────────────────────────────────────────

describe('resolveChain — edge cases', () => {
  it('single part returns the root type unchanged', () => {
    const r = resolveChain(['product'], instance('Product'), graph);
    expect(r.finalType?.kind).toBe('instance');
  });

  it('unknown model in root — graceful skip, finalType null', () => {
    const r = resolveChain(['thing', 'name'], instance('Unknown'), graph);
    expect(r.error).toBeUndefined();
    expect(r.finalType).toBeNull();
  });

  it('primitive intermediate stops chain — no further validation', () => {
    const r = resolveChain(['product', 'name', 'something'], instance('Product'), graph);
    expect(r.error).toBeUndefined();
    expect(r.finalType?.kind).toBe('primitive');
  });

  it('typo on instance field suggests the near name', () => {
    const r = resolveChain(['product', 'nme'], instance('Product'), graph);
    expect(r.error?.suggestion).toBe('name');
  });

  it('typo on manager attr suggests the near attr', () => {
    const r = resolveChain(['orders', 'firs'], manager('Order'), graph);
    expect(r.error?.suggestion).toBe('first');
  });

  it('typo suggestion includes reverse relation names', () => {
    const r = resolveChain(['author', 'order'], instance('Author'), graph);
    expect(r.error).toBeDefined();
    expect(r.error?.suggestion).toBe('orders');
  });
});

// ── SECTION 7: annotations / values / dict semantics ─────────────────────────

describe('resolveChain — annotations, values projection, dicts', () => {
  it('annotated field on instance resolves to primitive', () => {
    const root: ResolvedType = {
      kind: 'instance',
      model: 'Product',
      annotations: [{ name: 'review_count', func: 'Count' }],
    };
    const r = resolveChain(['p', 'review_count'], root, graph);
    expect(r.error).toBeUndefined();
    expect(r.finalType?.kind).toBe('primitive');
  });

  it('annotations propagate through .first on the same model', () => {
    const root: ResolvedType = {
      kind: 'queryset',
      model: 'Product',
      annotations: [{ name: 'review_count', func: 'Count' }],
    };
    const r = resolveChain(['products', 'first', 'review_count'], root, graph);
    expect(r.error).toBeUndefined();
    expect(r.finalType?.kind).toBe('primitive');
  });

  it('annotations propagate through .all (same-model queryset)', () => {
    const root: ResolvedType = {
      kind: 'queryset',
      model: 'Product',
      annotations: [{ name: 'total', func: 'Sum' }],
    };
    const r = resolveChain(['products', 'all'], root, graph);
    expect(r.finalType?.annotations?.[0]?.name).toBe('total');
  });

  it('values() projection restricts instance access to projected keys', () => {
    const root: ResolvedType = { kind: 'instance', model: 'Product', valuesFields: ['id', 'name'] };
    expect(resolveChain(['p', 'name'], root, graph).error).toBeUndefined();
    const bad = resolveChain(['p', 'status'], root, graph);
    expect(bad.error).toBeDefined();
    expect(bad.error?.message).toContain('values()');
  });

  it('values() projection propagates through .first', () => {
    const root: ResolvedType = { kind: 'queryset', model: 'Product', valuesFields: ['id', 'name'] };
    const ok = resolveChain(['products', 'first', 'name'], root, graph);
    expect(ok.error).toBeUndefined();
    const bad = resolveChain(['products', 'first', 'status'], root, graph);
    expect(bad.error).toBeDefined();
  });

  it('dict access — known key resolves, unknown errors with suggestion', () => {
    const root: ResolvedType = { kind: 'dict', dictKeys: ['total', 'avg'] };
    expect(resolveChain(['totals', 'total'], root, graph).error).toBeUndefined();
    const bad = resolveChain(['totals', 'totl'], root, graph);
    expect(bad.error).toBeDefined();
    expect(bad.error?.suggestion).toBe('total');
  });
});
