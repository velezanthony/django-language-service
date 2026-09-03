import { describe, it, expect } from 'vitest';
import { createModelGraph } from './model-graph';
import type { Model } from '$domain/types/model';
import type { Field } from '$domain/types/field';
import type { Relation } from '$domain/types/relation';

// ── Builders ─────────────────────────────────────────────────────────────────

function mkField(name: string, fieldType = 'CharField'): Field {
  return { name, fieldType };
}

function mkModel(
  name: string,
  appLabel: string,
  fields: Field[] = [],
  relations: Relation[] = [],
  properties: string[] = [],
): Model {
  return {
    kind: 'model',
    name,
    appLabel,
    filePath: `apps/${appLabel}/models.py`,
    line: 1,
    fields,
    relations,
    // helpers take plain names; a Model stores {name, source}
    properties: properties.map(name => ({ name, source: '@property' })),
  };
}

function fk(from: string, to: string, fieldName: string, relatedName?: string): Relation {
  return {
    kind: 'fk',
    fromModel: from,
    toModel: to,
    fieldName,
    ...(relatedName !== undefined && { relatedName }),
  };
}

// ── resolveModel (ported from legacy lookupByBareSuffix semantics) ───────────

describe('createModelGraph — resolveModel', () => {
  const author = mkModel('Author', 'blog', [mkField('name')]);
  const product = mkModel('Product', 'shop', [mkField('title')]);
  const graph = createModelGraph([author, product]);

  it('resolves by qualified app.Name key', () => {
    expect(graph.resolveModel('blog.Author')).toBe(author);
  });

  it('resolves by bare class name', () => {
    expect(graph.resolveModel('Product')).toBe(product);
  });

  it('returns undefined for unknown refs', () => {
    expect(graph.resolveModel('Missing')).toBeUndefined();
    expect(graph.resolveModel('shop.Missing')).toBeUndefined();
  });

  it('bare-name collision: first model wins (legacy iteration order)', () => {
    const a = mkModel('Tag', 'blog');
    const b = mkModel('Tag', 'shop');
    const g = createModelGraph([a, b]);
    expect(g.resolveModel('Tag')).toBe(a);
    expect(g.resolveModel('shop.Tag')).toBe(b);
  });
});

// ── field / forward relation lookup ──────────────────────────────────────────

describe('createModelGraph — fieldOf / relationOf', () => {
  const rel = fk('blog.Post', 'Author', 'author', 'posts');
  const post = mkModel('Post', 'blog', [mkField('title')], [rel]);
  const graph = createModelGraph([post]);

  it('fieldOf finds scalar fields by name', () => {
    expect(graph.fieldOf(post, 'title')?.fieldType).toBe('CharField');
  });

  it('fieldOf returns undefined for relation names (relations are split out)', () => {
    expect(graph.fieldOf(post, 'author')).toBeUndefined();
  });

  it('relationOf finds forward relations by field name', () => {
    expect(graph.relationOf(post, 'author')).toBe(rel);
  });

  it('relationOf returns undefined for scalar fields', () => {
    expect(graph.relationOf(post, 'title')).toBeUndefined();
  });
});

// ── reverse index (ported from legacy relation-indexer.test.ts) ──────────────

describe('createModelGraph — reverseRelationsOf', () => {
  it('indexes a bare FK target under the bare name', () => {
    const author = mkModel('Author', 'blog');
    const post = mkModel('Post', 'blog', [], [fk('blog.Post', 'Author', 'author', 'posts')]);
    const graph = createModelGraph([author, post]);

    const entries = graph.reverseRelationsOf('Author');
    expect(entries).toHaveLength(1);
    expect(entries[0]!.name).toBe('posts');
    expect(entries[0]!.sourceModel).toBe('blog.Post');
    expect(entries[0]!.relationKind).toBe('fk');
  });

  it('indexes a qualified FK target under BOTH qualified and bare keys', () => {
    const post = mkModel('Post', 'blog', [], [fk('blog.Post', 'shop.Product', 'product', 'posts')]);
    const graph = createModelGraph([post]);

    expect(graph.reverseRelationsOf('shop.Product')).toHaveLength(1);
    const bare = graph.reverseRelationsOf('Product');
    expect(bare).toHaveLength(1);
    expect(bare[0]!.name).toBe('posts');
  });

  it('qualified + bare entries are the SAME object reference', () => {
    const post = mkModel('Post', 'blog', [], [fk('blog.Post', 'shop.Product', 'product', 'posts')]);
    const graph = createModelGraph([post]);
    expect(graph.reverseRelationsOf('shop.Product')[0]).toBe(
      graph.reverseRelationsOf('Product')[0],
    );
  });

  it('multiple FKs to the same target accumulate into one list', () => {
    const post = mkModel('Post', 'blog', [], [fk('blog.Post', 'User', 'author', 'posts')]);
    const comment = mkModel(
      'Comment',
      'blog',
      [],
      [fk('blog.Comment', 'User', 'author', 'comments')],
    );
    const graph = createModelGraph([post, comment]);
    expect(graph.reverseRelationsOf('User')).toHaveLength(2);
  });

  // This used to assert the reverse was SKIPPED, which encoded a bug as a
  // rule: Django's default accessor is `<model>_set`, and not indexing it
  // made `{{ user.post_set.all }}` — the plainest reverse access there is —
  // read as a mistake.
  it("relation without relatedName gets Django's <model>_set default", () => {
    const post = mkModel('Post', 'blog', [], [fk('blog.Post', 'User', 'author')]);
    const graph = createModelGraph([post]);
    expect(graph.reverseRelationsOf('User').map(r => r.name)).toEqual(['post_set']);
  });

  it('a OneToOne reverses to the bare model name, with no _set', () => {
    const profile = mkModel(
      'Profile',
      'accounts',
      [],
      [{ kind: 'o2o', fromModel: 'accounts.Profile', toModel: 'User', fieldName: 'user' }],
    );
    const graph = createModelGraph([profile]);
    expect(graph.reverseRelationsOf('User').map(r => r.name)).toEqual(['profile']);
  });

  it("related_name='+' asks for no reverse accessor at all", () => {
    const post = mkModel('Post', 'blog', [], [fk('blog.Post', 'User', 'author', '+')]);
    const graph = createModelGraph([post]);
    expect(graph.reverseRelationsOf('User')).toHaveLength(0);
  });

  // `"%(class)s_set"` on an abstract base is a template resolved per concrete
  // child; interpolating it is not attempted, so claim nothing.
  it('skips an uninterpolated abstract-base related_name', () => {
    const post = mkModel(
      'Post',
      'blog',
      [],
      [fk('blog.Post', 'User', 'author', '%(class)s_items')],
    );
    const graph = createModelGraph([post]);
    expect(graph.reverseRelationsOf('User')).toHaveLength(0);
  });

  it("self-FK ('self' target) indexes the reverse under the declaring model", () => {
    const category = mkModel(
      'Category',
      'shop',
      [mkField('name')],
      [fk('shop.Category', 'self', 'parent', 'children')],
    );
    const graph = createModelGraph([category]);

    const byBare = graph.reverseRelationsOf('Category');
    expect(byBare).toHaveLength(1);
    expect(byBare[0]!.name).toBe('children');
    expect(byBare[0]!.sourceModel).toBe('shop.Category');

    expect(graph.reverseRelationsOf('shop.Category')).toHaveLength(1);
  });

  it('unknown target returns empty array', () => {
    const graph = createModelGraph([]);
    expect(graph.reverseRelationsOf('Nope')).toEqual([]);
  });
});

// `from core import mixins` then `class Foo(mixins.TimeStampedModel)` is
// ordinary Django. The template side of inheritance resolved bases by their raw
// string, so a base written with its module path matched nothing and the model
// inherited NOTHING — every field, @property and method of it read as undefined.
describe('a base written with its module path', () => {
  const mk = (name: string, bases: string[], fields: string[], props: string[] = []) => ({
    kind: 'model' as const,
    name,
    appLabel: 'shop',
    filePath: 'shop/models.py',
    line: 1,
    fields: fields.map(f => mkField(f)),
    relations: [],
    bases,
    properties: props.map(n => ({ name: n, source: '@property' })),
  });

  const graph = createModelGraph([
    mk('Place', ['models.Model'], ['address'], ['pretty']),
    mk('Dotted', ['shop.models.Place'], ['own']),
    mk('Bare', ['Place'], ['own']),
  ]);

  it('folds the inherited fields in, as it always did for a bare base', () => {
    expect(graph.resolveModel('Bare')!.fields.map(f => f.name)).toEqual(['own', 'address']);
  });

  it('folds them in for a dotted base too', () => {
    expect(graph.resolveModel('Dotted')!.fields.map(f => f.name)).toEqual(['own', 'address']);
  });

  it('and the inherited @property with it', () => {
    expect(graph.resolveModel('Dotted')!.properties.map(p => p.name)).toEqual(['pretty']);
  });

  it('does not invent a parent that is not in the project', () => {
    const g = createModelGraph([mk('Lonely', ['third_party.models.Thing'], ['own'])]);
    expect(g.resolveModel('Lonely')!.fields.map(f => f.name)).toEqual(['own']);
  });
});
