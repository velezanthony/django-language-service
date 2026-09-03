/**
 * Ported from legacy completion-provider.ts (instanceCompletions /
 * managerCompletions / dictCompletions / tryFormCompletion) — re-expressed
 * as pure data entries the completion adapter maps to vscode items.
 */
import { describe, it, expect } from 'vitest';
import { buildChainEntries, matchFormVar, buildFormFieldEntries } from './completion-entries';
import { createModelGraph } from './model-graph';
import type { Model } from '$domain/types/model';
import type { Field } from '$domain/types/field';
import type { Relation } from '$domain/types/relation';
import type { Form } from '$domain/types/form';
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
  [mkField('name'), mkField('price', 'DecimalField')],
  [{ kind: 'fk', fromModel: 'shop.Product', toModel: 'Author', fieldName: 'category' }],
  ['is_active'],
);
const AUTHOR = mkModel('Author', [mkField('name'), mkField('email')]);
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

const labels = (entries: ReturnType<typeof buildChainEntries>): string[] =>
  entries.map(e => e.label);

// ── Instance entries ─────────────────────────────────────────────────────────

describe('buildChainEntries — instance', () => {
  const instance: ResolvedType = { kind: 'instance', model: 'Product' };

  it('offers fields, relations, properties, and reverse relations', () => {
    const entries = buildChainEntries(instance, graph);
    expect(labels(entries)).toEqual(
      expect.arrayContaining(['name', 'price', 'category', 'is_active', 'reviews']),
    );
  });

  it('classifies each entry kind', () => {
    const entries = buildChainEntries(instance, graph);
    const byLabel = new Map(entries.map(e => [e.label, e]));
    expect(byLabel.get('name')?.kind).toBe('field');
    expect(byLabel.get('category')?.kind).toBe('relation');
    expect(byLabel.get('is_active')?.kind).toBe('property');
    expect(byLabel.get('reviews')?.kind).toBe('reverse');
  });

  it('relation detail names the target model', () => {
    const entries = buildChainEntries(instance, graph);
    const cat = entries.find(e => e.label === 'category')!;
    expect(cat.detail).toContain('Author');
  });

  it('annotations surface alongside fields', () => {
    const entries = buildChainEntries(
      { ...instance, annotations: [{ name: 'review_count', func: 'Count' }] },
      graph,
    );
    const ann = entries.find(e => e.label === 'review_count');
    expect(ann?.kind).toBe('annotation');
    expect(ann?.detail).toContain('Count');
  });

  it('values() projection narrows entries to projected keys + annotations', () => {
    const entries = buildChainEntries(
      {
        kind: 'instance',
        model: 'Product',
        valuesFields: ['name'],
        annotations: [{ name: 'c', func: 'Count' }],
      },
      graph,
    );
    expect(labels(entries).sort()).toEqual(['c', 'name']);
  });

  it('unknown model yields no entries', () => {
    expect(buildChainEntries({ kind: 'instance', model: 'Nope' }, graph)).toEqual([]);
  });
});

// ── Manager / queryset / dict / primitive entries ────────────────────────────

describe('buildChainEntries — manager, queryset, dict, primitive', () => {
  it('manager offers exactly the six 0-arg attrs', () => {
    const entries = buildChainEntries({ kind: 'manager', model: 'Review' }, graph);
    expect(labels(entries).sort()).toEqual(['all', 'count', 'exists', 'first', 'last', 'none']);
    expect(entries.every(e => e.kind === 'manager-attr')).toBe(true);
  });

  it('queryset offers the same attrs', () => {
    const entries = buildChainEntries({ kind: 'queryset', model: 'Product' }, graph);
    expect(labels(entries)).toContain('first');
  });

  it('dict offers its keys', () => {
    const entries = buildChainEntries({ kind: 'dict', dictKeys: ['total', 'avg'] }, graph);
    expect(labels(entries).sort()).toEqual(['avg', 'total']);
    expect(entries[0]?.kind).toBe('dict-key');
  });

  it('primitive yields nothing', () => {
    expect(buildChainEntries({ kind: 'primitive' }, graph)).toEqual([]);
  });
});

// ── Form field completion (legacy tryFormCompletion port) ────────────────────

const productForm: Form = {
  kind: 'form',
  name: 'ProductForm',
  filePath: 'shop/forms.py',
  line: 1,
  fields: [],
  modelRef: 'Product',
  metaFields: ['name', 'price'],
};
const contactForm: Form = {
  kind: 'form',
  name: 'ContactForm',
  filePath: 'app/forms.py',
  line: 1,
  fields: [
    { name: 'email', fieldType: 'EmailField' },
    { name: 'subject', fieldType: 'CharField' },
  ],
};
const allForm: Form = {
  kind: 'form',
  name: 'AllFieldsForm',
  filePath: 'shop/forms.py',
  line: 20,
  fields: [],
  modelRef: 'Product',
  metaFields: ['__all__'],
};

describe('matchFormVar — legacy heuristic', () => {
  const forms = [productForm, contactForm];

  it("bare 'form' matches the first form", () => {
    expect(matchFormVar('form', forms)).toBe(productForm);
  });

  it('lowercased form name without the Form suffix matches', () => {
    expect(matchFormVar('product', forms)).toBe(productForm);
    expect(matchFormVar('contact', forms)).toBe(contactForm);
  });

  it("'<name>_form' pattern matches", () => {
    expect(matchFormVar('product_form', forms)).toBe(productForm);
  });

  it('camelCase form name matches', () => {
    expect(matchFormVar('productForm', forms)).toBe(productForm);
  });

  it('unrelated names do not match', () => {
    expect(matchFormVar('basket', forms)).toBeUndefined();
  });
});

describe('buildFormFieldEntries', () => {
  it('declared fields carry their form field type', () => {
    const entries = buildFormFieldEntries(contactForm, graph);
    const email = entries.find(e => e.label === 'email');
    expect(email?.kind).toBe('form-field');
    expect(email?.detail).toContain('EmailField');
  });

  it('ModelForm Meta.fields resolve types through the model', () => {
    const entries = buildFormFieldEntries(productForm, graph);
    const name = entries.find(e => e.label === 'name');
    expect(name?.kind).toBe('form-field');
    expect(name?.detail).toContain('CharField');
    expect(labels2(entries)).toContain('price');
  });

  it("Meta.fields = '__all__' expands to every model field", () => {
    const entries = buildFormFieldEntries(allForm, graph);
    expect(labels2(entries)).toEqual(expect.arrayContaining(['name', 'price']));
  });

  it('declared fields are not duplicated by Meta.fields', () => {
    const mixed: Form = {
      ...productForm,
      fields: [{ name: 'name', fieldType: 'CharField' }],
    };
    const entries = buildFormFieldEntries(mixed, graph);
    expect(entries.filter(e => e.label === 'name')).toHaveLength(1);
  });

  it('standard form attributes are appended and sorted last', () => {
    const entries = buildFormFieldEntries(contactForm, graph);
    const errors = entries.find(e => e.label === 'errors');
    expect(errors?.kind).toBe('form-attr');
    expect(errors?.sortLast).toBe(true);
    expect(labels2(entries)).toEqual(
      expect.arrayContaining(['as_p', 'as_table', 'non_field_errors']),
    );
  });
});

function labels2(entries: ReturnType<typeof buildFormFieldEntries>): string[] {
  return entries.map(e => e.label);
}
