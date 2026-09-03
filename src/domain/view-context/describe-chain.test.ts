/**
 * describeChainSegment — spec for hover/definition resolution of the
 * segment under the cursor inside `{{ a.b.c }}`.
 */
import { describe, it, expect } from 'vitest';
import { describeChainSegment } from './describe-chain';
import { resolveChain } from './chain-resolver';
import { createModelGraph } from './model-graph';
import type { Model } from '$domain/types/model';
import type { Field } from '$domain/types/field';
import type { Relation } from '$domain/types/relation';
import type { ResolvedType } from './types';

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
    filePath: `apps/shop/models_${name.toLowerCase()}.py`,
    line: 7,
    fields,
    relations,
    // helpers take plain names; a Model stores {name, source}
    properties: properties.map(name => ({ name, source: '@property' })),
  };
}

const PRODUCT = mkModel(
  'Product',
  [mkField('name'), mkField('price', 'DecimalField')],
  [{ kind: 'fk', fromModel: 'shop.Product', toModel: 'Author', fieldName: 'category' }],
  ['is_active'],
);
const AUTHOR = mkModel('Author', [mkField('email', 'EmailField')]);
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

const graph = createModelGraph([PRODUCT, AUTHOR, REVIEW]);
const productRoot: ResolvedType = { kind: 'instance', model: 'Product' };

describe('describeChainSegment', () => {
  it('segment 0 → root info with resolved model', () => {
    const info = describeChainSegment(['product', 'name'], 0, productRoot, graph);
    expect(info).toMatchObject({ kind: 'root', name: 'product' });
    expect(info?.kind === 'root' && info.model?.name).toBe('Product');
  });

  it('scalar field segment → field info with owner model', () => {
    const info = describeChainSegment(['product', 'name'], 1, productRoot, graph);
    expect(info?.kind).toBe('field');
    if (info?.kind !== 'field') throw new Error('expected field');
    expect(info.field.fieldType).toBe('CharField');
    expect(info.owner.name).toBe('Product');
  });

  it('deep field through FK → owner is the RELATED model', () => {
    const info = describeChainSegment(['product', 'category', 'email'], 2, productRoot, graph);
    if (info?.kind !== 'field') throw new Error('expected field');
    expect(info.owner.name).toBe('Author');
    expect(info.field.fieldType).toBe('EmailField');
  });

  it('forward relation segment → relation info with target model', () => {
    const info = describeChainSegment(['product', 'category'], 1, productRoot, graph);
    if (info?.kind !== 'relation') throw new Error('expected relation');
    expect(info.owner.name).toBe('Product');
    expect(info.target?.name).toBe('Author');
    expect(info.relation.kind).toBe('fk');
  });

  it('@property segment → property info', () => {
    const info = describeChainSegment(['product', 'is_active'], 1, productRoot, graph);
    expect(info).toMatchObject({ kind: 'property', name: 'is_active' });
  });

  it('annotation segment → annotation info with func', () => {
    const annotated: ResolvedType = {
      ...productRoot,
      annotations: [{ name: 'review_count', func: 'Count' }],
    };
    const info = describeChainSegment(['p', 'review_count'], 1, annotated, graph);
    expect(info).toMatchObject({ kind: 'annotation', name: 'review_count', func: 'Count' });
  });

  it('reverse relation segment → reverse info with source model', () => {
    const info = describeChainSegment(['product', 'reviews'], 1, productRoot, graph);
    if (info?.kind !== 'reverse') throw new Error('expected reverse');
    expect(info.source?.name).toBe('Review');
  });

  it('manager attr segment → manager-attr info', () => {
    const info = describeChainSegment(['product', 'reviews', 'count'], 2, productRoot, graph);
    expect(info).toMatchObject({ kind: 'manager-attr', name: 'count' });
  });

  it('dict key segment → dict-key info', () => {
    const totals: ResolvedType = { kind: 'dict', dictKeys: ['total'] };
    const info = describeChainSegment(['totals', 'total'], 1, totals, graph);
    expect(info).toMatchObject({ kind: 'dict-key', name: 'total' });
  });

  it('invalid segment → null', () => {
    expect(describeChainSegment(['product', 'bogus'], 1, productRoot, graph)).toBeNull();
  });

  it('segment past a broken chain → null', () => {
    expect(describeChainSegment(['product', 'bogus', 'name'], 2, productRoot, graph)).toBeNull();
  });
});

// The rule this module's header states: everything resolveChain ACCEPTS must
// also be describable. A `Prefetch(to_attr=…)` attribute resolved fine — no
// squiggle from diagnostics — and then fell through to `return null`, so hover
// and go-to-definition came back empty on code the same reader called valid.
// Two readers of one model disagreeing is the drift the header forbids.
describe('every attribute resolveChain accepts is describable', () => {
  const withPrefetch = (name: string, path: string): ResolvedType => ({
    kind: 'instance',
    model: 'Product',
    prefetchAttrs: [{ name, path }],
  });

  const cases: ReadonlyArray<{ what: string; attr: string; path: string }> = [
    { what: 'a reverse relation', attr: 'top_reviews', path: 'reviews' },
    { what: 'a forward relation', attr: 'cat', path: 'category' },
    { what: 'a multi-hop path', attr: 'reviewed', path: 'reviews__product' },
  ];

  for (const { what, attr, path } of cases) {
    it(`describes a Prefetch(to_attr=…) naming ${what}`, () => {
      const root = withPrefetch(attr, path);
      // The premise: the chain resolver accepts it, so hover must too.
      expect(resolveChain(['p', attr], root, graph).finalType).not.toBeNull();
      expect(describeChainSegment(['p', attr], 1, root, graph)).not.toBeNull();
    });
  }

  it('points at the model the prefetched rows come from', () => {
    const info = describeChainSegment(
      ['p', 'top_reviews'],
      1,
      withPrefetch('top_reviews', 'reviews'),
      graph,
    );
    if (info?.kind !== 'reverse') throw new Error('expected reverse');
    expect(info.name).toBe('top_reviews');
    expect(info.source?.name).toBe('Review');
  });

  it('points at the target of a forward relation it mirrors', () => {
    const info = describeChainSegment(['p', 'cat'], 1, withPrefetch('cat', 'category'), graph);
    if (info?.kind !== 'relation') throw new Error('expected relation');
    expect(info.name).toBe('cat');
    expect(info.owner.name).toBe('Product');
    expect(info.target?.name).toBe('Author');
  });

  it('still says nothing about a to_attr whose path leads nowhere', () => {
    const root = withPrefetch('ghosts', 'nonexistent');
    expect(describeChainSegment(['p', 'ghosts'], 1, root, graph)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The two readers `resolveChain` accepts and this one could not name.
//
// `{{ order.customer_id }}` is the FK's attname — reading it instead of
// `order.customer.pk` is how a template avoids a query, so it is common. And
// `{{ post.get_next_by_published }}` is what Django adds for every non-null
// DateField. `resolveChain` types both; `describeChainSegment` returned null
// for both, so hover and go-to-definition came back empty on something the
// diagnostics consider perfectly valid.
//
// Same shape as the `Prefetch(to_attr=)` gap that was closed one round ago, and
// the module header promises this drift will not happen. Two readers of the
// same model must not disagree about what exists.
// ─────────────────────────────────────────────────────────────────────────────
describe('the readers Django adds, and this module has to name', () => {
  const DATED = mkModel('Dated', [
    mkField('id', 'AutoField'),
    mkField('published', 'DateField'),
    mkField('archived_at', 'DateTimeField'),
    { name: 'maybe', fieldType: 'DateField', isNull: true } as Field,
  ]);
  const ORDER_FK = mkModel(
    'OrderFk',
    [mkField('id', 'AutoField')],
    [{ kind: 'fk', fromModel: 'shop.OrderFk', toModel: 'Product', fieldName: 'product' }],
  );
  const graph2 = createModelGraph([DATED, ORDER_FK, PRODUCT]);
  const rootOf = (model: string): ResolvedType => ({ kind: 'instance', model });

  it('names the attname of a foreign key', () => {
    const info = describeChainSegment(['o', 'product_id'], 1, rootOf('OrderFk'), graph2);
    expect(info).not.toBeNull();
    expect(info?.kind).toBe('fk-id');
  });

  it.each(['get_next_by_published', 'get_previous_by_published', 'get_next_by_archived_at'])(
    'names %s',
    reader => {
      const info = describeChainSegment(['d', reader], 1, rootOf('Dated'), graph2);
      expect(info).not.toBeNull();
      expect(info?.kind).toBe('date-nav');
    },
  );

  // The premise: if resolveChain stopped accepting these, the tests above would
  // be asserting against nothing.
  it.each([
    ['product_id', 'OrderFk'],
    ['get_next_by_published', 'Dated'],
  ])('resolveChain accepts %s, which is why this has to', (reader, model) => {
    expect(resolveChain(['x', reader], rootOf(model), graph2).finalType).not.toBeNull();
  });

  it('does not invent a reader Django did not add', () => {
    // `maybe` is null=True, so Django adds no navigation for it.
    expect(describeChainSegment(['d', 'get_next_by_maybe'], 1, rootOf('Dated'), graph2)).toBeNull();
    expect(describeChainSegment(['o', 'nothing_id'], 1, rootOf('OrderFk'), graph2)).toBeNull();
  });

  // Same Unicode class closed one commit ago, in the file that reads these.
  it('reads an attname whose relation has a non-ASCII name', () => {
    const model = mkModel(
      'Pedido',
      [mkField('id', 'AutoField')],
      [{ kind: 'fk', fromModel: 'shop.Pedido', toModel: 'Product', fieldName: 'artículo' }],
    );
    const g = createModelGraph([model, PRODUCT]);
    const info = describeChainSegment(['p', 'artículo_id'], 1, rootOf('Pedido'), g);
    expect(info?.kind).toBe('fk-id');
  });
});
