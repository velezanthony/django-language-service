/**
 * Ported from legacy __tests__/context-diagnostics.test.ts — the diagnostics
 * sections (undefined vars, locals, builtins, deep chains, reverse relations,
 * conditional keys, annotate/values/aggregate propagation, typing-in-progress
 * grace). Re-expressed against diagnoseTemplate + the new Model shape.
 */
import { describe, it, expect } from 'vitest';
import { diagnoseTemplate } from './diagnose';
import { createModelGraph } from './model-graph';
import type { Model } from '$domain/types/model';
import type { Field } from '$domain/types/field';
import type { Relation } from '$domain/types/relation';
import type { ContextVar } from '$domain/types/context-var';

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
  [mkField('name'), mkField('status'), mkField('price', 'DecimalField')],
  [{ kind: 'fk', fromModel: 'shop.Product', toModel: 'Author', fieldName: 'category' }],
  ['is_active'],
);
const AUTHOR = mkModel('Author', [mkField('name'), mkField('email')], [], ['full_name']);
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
const WAREHOUSE = mkModel(
  'Warehouse',
  [mkField('capacity', 'FloatField')],
  [
    {
      kind: 'o2o',
      fromModel: 'shop.Warehouse',
      toModel: 'Product',
      fieldName: 'product',
      relatedName: 'warehouse',
    },
  ],
);

const graph = createModelGraph([PRODUCT, AUTHOR, ORDER, WAREHOUSE]);

const v = (name: string, extra: Partial<ContextVar> = {}): ContextVar =>
  ({ name, kind: 'scalar', ...extra }) as ContextVar;

const productsVar: ContextVar = { name: 'products', kind: 'queryset', typeRef: 'Product' };
const productVar: ContextVar = { name: 'product', kind: 'instance', typeRef: 'Product' };
const authorVar: ContextVar = { name: 'author', kind: 'instance', typeRef: 'Author' };

const run = (
  templateSource: string,
  contextVars: readonly ContextVar[],
  incomingKwargs?: readonly { name: string; expr: string }[],
) =>
  diagnoseTemplate({
    templateSource,
    contextVars,
    graph,
    ...(incomingKwargs !== undefined ? { incomingKwargs } : {}),
  });

// ── SECTION 1-2: undefined variable detection ────────────────────────────────

describe('diagnoseTemplate — undefined variables', () => {
  it('no diagnostics when all variables are in context', () => {
    expect(run('{{ title }} and {{ product.name }}', [v('title'), productVar])).toEqual([]);
  });

  it('empty template yields no diagnostics', () => {
    expect(run('', [v('title')])).toEqual([]);
    expect(run('<p>static only</p>', [v('title')])).toEqual([]);
  });

  it('reports undefined variable with warning severity', () => {
    const diags = run('{{ missing_thing }}', [v('title')]);
    expect(diags).toHaveLength(1);
    expect(diags[0]).toMatchObject({
      variable: 'missing_thing',
      severity: 'warning',
      code: 'undefined-variable',
    });
    expect(diags[0]!.message).toContain('missing_thing');
  });

  it('reports one diagnostic per usage with correct 1-based lines', () => {
    const diags = run('line one\n{{ ghost }}\ntext\n{{ ghost }}', [v('title')]);
    expect(diags).toHaveLength(2);
    expect(diags.map(d => d.line)).toEqual([2, 4]);
  });

  it('dotted access checks the ROOT against context', () => {
    expect(run('{{ product.name }}', [productVar])).toEqual([]);
    const diags = run('{{ ghost.name }}', [productVar]);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.variable).toBe('ghost');
  });

  it('typo suggestion via findSimilar', () => {
    const diags = run('{{ prodcts }}', [productsVar]);
    expect(diags[0]!.suggestion).toBe('products');
  });

  it('no suggestion when nothing is similar', () => {
    const diags = run('{{ zzz_qqq }}', [v('title')]);
    expect(diags[0]!.suggestion).toBeUndefined();
  });
});

// ── SECTION 3-4: locals and builtins are NOT reported ────────────────────────

describe('diagnoseTemplate — locals and builtins', () => {
  it('for-loop iterator is not reported', () => {
    const diags = run('{% for p in products %}{{ p }}{% endfor %}', [productsVar]);
    expect(diags).toEqual([]);
  });

  it('for-loop over a MISSING iterable reports the iterable, not the iterator', () => {
    const diags = run('{% for x in missing %}{{ x }}{% endfor %}', [v('title')]);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.variable).toBe('missing');
  });

  it('with-block binding is not reported', () => {
    const diags = run(`{% with total=products.count %}{{ total }}{% endwith %}`, [productsVar]);
    expect(diags).toEqual([]);
  });

  it('builtins (forloop, request, block, csrf_token) are not reported', () => {
    const diags = run(
      '{{ forloop.counter }} {{ request.user }} {{ block.super }} {{ csrf_token }}',
      [],
    );
    expect(diags).toEqual([]);
  });

  it('undefined variable inside {% if %} is reported', () => {
    const diags = run('{% if mystery %}x{% endif %}', [v('title')]);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.variable).toBe('mystery');
  });
});

// ── SECTION 10-12: deep chain validation ─────────────────────────────────────

describe('diagnoseTemplate — deep chains', () => {
  it('invalid field on instance is reported with suggestion', () => {
    const diags = run('{{ product.nme }}', [productVar]);
    expect(diags).toHaveLength(1);
    expect(diags[0]).toMatchObject({
      variable: 'product.nme',
      severity: 'warning',
      code: 'invalid-chain',
      suggestion: 'name',
    });
  });

  it('valid field / @property / FK chain are clean', () => {
    expect(
      run('{{ product.name }} {{ product.is_active }} {{ product.category.full_name }}', [
        productVar,
      ]),
    ).toEqual([]);
  });

  it('field access directly on a queryset is an error', () => {
    const diags = run('{{ products.name }}', [productsVar]);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.message).toContain('QuerySet');
  });

  it('queryset .first/.count/.all are valid', () => {
    expect(run('{{ products.first.name }} {{ products.count }}', [productsVar])).toEqual([]);
  });

  it('reverse FK related_name is valid; O2O reverse chains to fields', () => {
    expect(
      run('{{ author.orders.count }} {{ product.warehouse.capacity }}', [authorVar, productVar]),
    ).toEqual([]);
  });

  it('field access on reverse manager is an error at the right chain', () => {
    const diags = run('{{ author.orders.total }}', [authorVar]);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.variable).toBe('author.orders.total');
  });

  it('for-loop iterator inherits model type — invalid field flagged', () => {
    const diags = run('{% for p in products %}{{ p.nonexistent }}{% endfor %}', [productsVar]);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.variable).toBe('p.nonexistent');
  });

  it('no type info on root means no deep validation', () => {
    expect(run('{{ mystery_dict.whatever }}', [v('mystery_dict')])).toEqual([]);
  });
});

// ── SECTION 13: conditional keys ─────────────────────────────────────────────

describe('diagnoseTemplate — conditional keys', () => {
  it('conditional var → info severity, not warning', () => {
    const diags = run('{{ maybe }}', [v('maybe', { conditional: true })]);
    expect(diags).toHaveLength(1);
    expect(diags[0]).toMatchObject({ severity: 'info', code: 'conditional-variable' });
  });

  it('truly undefined var still warns alongside conditionals', () => {
    const diags = run('{{ maybe }} {{ ghost }}', [v('maybe', { conditional: true })]);
    expect(diags).toHaveLength(2);
    expect(diags.find(d => d.variable === 'maybe')!.severity).toBe('info');
    expect(diags.find(d => d.variable === 'ghost')!.severity).toBe('warning');
  });
});

// ── annotate / values / aggregate propagation ────────────────────────────────

describe('diagnoseTemplate — annotate / values / aggregate', () => {
  const annotated: ContextVar = {
    name: 'products',
    kind: 'queryset',
    typeRef: 'Product',
    annotations: [{ name: 'review_count', func: 'Count' }],
  };

  it('annotated field is valid on iterator and through .first', () => {
    expect(
      run(
        '{% for p in products %}{{ p.review_count }}{% endfor %}{{ products.first.review_count }}',
        [annotated],
      ),
    ).toEqual([]);
  });

  it('values() projection restricts iterator keys', () => {
    const projected: ContextVar = {
      name: 'rows',
      kind: 'queryset',
      typeRef: 'Product',
      valuesFields: ['name'],
    };
    expect(run('{% for r in rows %}{{ r.name }}{% endfor %}', [projected])).toEqual([]);
    const diags = run('{% for r in rows %}{{ r.status }}{% endfor %}', [projected]);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.message).toContain('values()');
  });

  it('aggregate dict — valid key passes, unknown key flagged with suggestion', () => {
    const totals: ContextVar = { name: 'totals', kind: 'dict', dictKeys: ['total', 'avg'] };
    expect(run('{{ totals.total }}', [totals])).toEqual([]);
    const diags = run('{{ totals.totl }}', [totals]);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.suggestion).toBe('total');
  });
});

// ── typing-in-progress grace ─────────────────────────────────────────────────

describe('diagnoseTemplate — typing-in-progress', () => {
  it('partial of a context key is not flagged (gap >= 3)', () => {
    expect(run('{{ prod }}', [productsVar])).toEqual([]);
  });

  it('almost-complete typo IS flagged (gap < 3)', () => {
    const diags = run('{{ product }}', [productsVar]);
    expect(diags).toHaveLength(1);
  });

  it('single-letter root does not trigger the prefix grace', () => {
    const diags = run('{{ p }}', [productsVar]);
    expect(diags).toHaveLength(1);
  });
});

// ── include-with kwargs in scope ─────────────────────────────────────────────

describe('diagnoseTemplate — incoming include-with kwargs', () => {
  it('kwarg-bound name is in scope and typed', () => {
    const diags = run(
      '{{ item.name }} {{ item.bogus }}',
      [productVar],
      [{ name: 'item', expr: 'product' }],
    );
    expect(diags).toHaveLength(1);
    expect(diags[0]!.variable).toBe('item.bogus');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A partial validates the values its includer passes in.
//
// The incoming `{% include … with k=v %}` kwargs were injected AFTER the
// template scope had been built and after the manager checks had already run.
// So inside any partial, nothing written in terms of an incoming value was
// checked — not even `manager-not-iterable`, which is a 500 in production.
// Partials are where a large template project keeps most of its markup.
// ─────────────────────────────────────────────────────────────────────────────
describe('incoming include kwargs are part of the scope', () => {
  const kwargs = [{ name: 'writer', expr: 'author' }];

  it('flags iterating a manager that arrived as a kwarg', () => {
    const diags = run('{% for o in writer.orders %}{{ o.total }}{% endfor %}', [authorVar], kwargs);
    expect(diags.length).toBeGreaterThan(0);
  });

  it('flags an unknown field on a kwarg', () => {
    const diags = run('{{ writer.nonexistent }}', [authorVar], kwargs);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.variable).toBe('writer.nonexistent');
  });

  it('types a loop over a kwarg, so its item is checked', () => {
    const diags = run(
      '{% for o in writer.orders.all %}{{ o.nonexistent }}{% endfor %}',
      [authorVar],
      kwargs,
    );
    expect(diags).toHaveLength(1);
    expect(diags[0]!.variable).toBe('o.nonexistent');
  });

  it('says nothing about correct use of a kwarg', () => {
    expect(
      run('{% for o in writer.orders.all %}{{ o.total }}{% endfor %}', [authorVar], kwargs),
    ).toEqual([]);
  });
});
