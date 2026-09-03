import { describe, it, expect } from 'vitest';
import { buildContextVars, contextVarToResolvedType } from './context-vars';
import type { ResolvedType } from './types';

const types = (entries: Record<string, ResolvedType>): Map<string, ResolvedType> =>
  new Map(Object.entries(entries));

describe('buildContextVars', () => {
  it('typed keys carry kind + typeRef', () => {
    const vars = buildContextVars(
      ['products'],
      types({ products: { kind: 'queryset', model: 'Product' } }),
    );
    expect(vars).toEqual([{ name: 'products', kind: 'queryset', typeRef: 'Product' }]);
  });

  it('untyped keys fall back to scalar without typeRef', () => {
    const vars = buildContextVars(['title'], types({}));
    expect(vars).toEqual([{ name: 'title', kind: 'scalar' }]);
  });

  it('keys only present in the inferred types are included (CBV object_list)', () => {
    const vars = buildContextVars(
      [],
      types({ object_list: { kind: 'queryset', model: 'Category' } }),
    );
    expect(vars).toEqual([{ name: 'object_list', kind: 'queryset', typeRef: 'Category' }]);
  });

  it('contextKeys order is preserved; inferred-only keys append after', () => {
    const vars = buildContextVars(
      ['b', 'a'],
      types({ z: { kind: 'instance', model: 'M' }, a: { kind: 'instance', model: 'N' } }),
    );
    expect(vars.map(v => v.name)).toEqual(['b', 'a', 'z']);
  });

  it('annotations / valuesFields / dictKeys survive onto the ContextVar', () => {
    const vars = buildContextVars(
      ['stats', 'rows'],
      types({
        stats: { kind: 'dict', dictKeys: ['total', 'avg'] },
        rows: {
          kind: 'queryset',
          model: 'Product',
          annotations: [{ name: 'c', func: 'Count' }],
          valuesFields: ['id', 'c'],
        },
      }),
    );
    expect(vars[0]).toEqual({ name: 'stats', kind: 'dict', dictKeys: ['total', 'avg'] });
    expect(vars[1]).toEqual({
      name: 'rows',
      kind: 'queryset',
      typeRef: 'Product',
      annotations: [{ name: 'c', func: 'Count' }],
      valuesFields: ['id', 'c'],
    });
  });

  it('no duplicates when a key is both declared and inferred', () => {
    const vars = buildContextVars(
      ['product'],
      types({ product: { kind: 'instance', model: 'Product' } }),
    );
    expect(vars).toHaveLength(1);
  });
});

describe('contextVarToResolvedType', () => {
  it('round-trips a typed var back into a chain-engine root type', () => {
    const [v] = buildContextVars(
      ['rows'],
      types({
        rows: {
          kind: 'queryset',
          model: 'Product',
          annotations: [{ name: 'c', func: 'Count' }],
        },
      }),
    );
    expect(contextVarToResolvedType(v!)).toEqual({
      kind: 'queryset',
      model: 'Product',
      annotations: [{ name: 'c', func: 'Count' }],
    });
  });

  it('scalar vars produce null (nothing to resolve chains against)', () => {
    const [v] = buildContextVars(['title'], types({}));
    expect(contextVarToResolvedType(v!)).toBeNull();
  });
});

describe('buildContextVars — conditional keys', () => {
  it('key in conditionalKeys → conditional:true on the var', () => {
    const vars = buildContextVars(['maybe'], types({}), new Set(['maybe']));
    expect(vars).toEqual([{ name: 'maybe', kind: 'scalar', conditional: true }]);
  });

  it('conditional-only names (not in contextKeys) are appended', () => {
    const vars = buildContextVars(['always'], types({}), new Set(['injected']));
    expect(vars.map(v => v.name)).toEqual(['always', 'injected']);
    expect(vars[1]).toEqual({ name: 'injected', kind: 'scalar', conditional: true });
    expect(vars[0]!.conditional).toBeUndefined();
  });

  it('typed conditional key keeps both the type and the flag', () => {
    const vars = buildContextVars(
      [],
      types({ managed: { kind: 'queryset', model: 'Product' } }),
      new Set(['managed']),
    );
    expect(vars).toEqual([
      { name: 'managed', kind: 'queryset', typeRef: 'Product', conditional: true },
    ]);
  });

  it('omitting the set keeps every var unconditional (back-compat)', () => {
    const vars = buildContextVars(['a'], types({}));
    expect(vars[0]!.conditional).toBeUndefined();
  });
});
