import { describe, it, expect, vi } from 'vitest';
import { measureScaling } from '../../test-support/scaling';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseModels } from './models';
import { choiceValues } from '$domain/types/choice';

const f = (rel: string) => readFileSync(join(__dirname, '__fixtures__', rel), 'utf8');

// ── Happy path — spec PARSEMODELS ─────────────────────────────────────────────

describe('parseModels — simple models (spec PARSEMODELS)', () => {
  const src = f('models/simple.py');
  const result = parseModels(src, { filePath: 'blog/models.py' });

  it('returns ok:true', () => {
    expect(result.ok).toBe(true);
  });

  it('extracts 2 models', () => {
    if (!result.ok) throw new Error('not ok');
    expect(result.value).toHaveLength(2);
  });

  it('Author — kind, name, appLabel, filePath, line', () => {
    if (!result.ok) throw new Error('not ok');
    const model = result.value[0]!;
    expect(model.kind).toBe('model');
    expect(model.name).toBe('Author');
    expect(model.appLabel).toBe('blog');
    expect(model.filePath).toBe('blog/models.py');
    expect(model.line).toBe(6);
  });

  it('Author — 4 scalar fields, no relations', () => {
    if (!result.ok) throw new Error('not ok');
    const model = result.value[0]!;
    expect(model.fields).toHaveLength(4);
    expect(model.relations).toHaveLength(0);
    expect(model.fields[0]!.name).toBe('name');
    expect(model.fields[0]!.fieldType).toBe('CharField');
    expect(model.fields[0]!.maxLength).toBe(100);
  });

  it('Author — @property display_name extracted', () => {
    if (!result.ok) throw new Error('not ok');
    const props = result.value[0]!.properties;
    expect(props.map(p => p.name)).toContain('display_name');
    // The source travels with the name — the tooltip shows it on hover.
    expect(props.find(p => p.name === 'display_name')!.source).toMatch(
      /^@property\ndef display_name\(/,
    );
  });

  it('Tag — 2 scalar fields', () => {
    if (!result.ok) throw new Error('not ok');
    const model = result.value[1]!;
    expect(model.name).toBe('Tag');
    expect(model.fields).toHaveLength(2);
  });
});

// ── Relations (spec PARSEMODELS — FK + M2M + O2O) ────────────────────────────

describe('parseModels — models with relations', () => {
  const src = f('models/with-relations.py');
  const result = parseModels(src, { filePath: 'catalogue/models.py' });

  it('returns ok:true', () => {
    expect(result.ok).toBe(true);
  });

  it('Product — category FK relation extracted', () => {
    if (!result.ok) throw new Error('not ok');
    const product = result.value.find(m => m.name === 'Product');
    expect(product).toBeDefined();
    const fkRel = product!.relations.find(r => r.fieldName === 'category');
    expect(fkRel).toBeDefined();
    expect(fkRel!.kind).toBe('fk');
    expect(fkRel!.toModel).toBe('Category');
    expect(fkRel!.onDelete).toBe('CASCADE');
    expect(fkRel!.relatedName).toBe('products');
  });

  it('Product — tags M2M relation with through model', () => {
    if (!result.ok) throw new Error('not ok');
    const product = result.value.find(m => m.name === 'Product');
    const m2mRel = product!.relations.find(r => r.fieldName === 'tags');
    expect(m2mRel).toBeDefined();
    expect(m2mRel!.kind).toBe('m2m');
    expect(m2mRel!.through).toBe('ProductTag');
  });

  it('UserProfile — user O2O relation', () => {
    if (!result.ok) throw new Error('not ok');
    const profile = result.value.find(m => m.name === 'UserProfile');
    expect(profile).toBeDefined();
    const o2oRel = profile!.relations.find(r => r.fieldName === 'user');
    expect(o2oRel).toBeDefined();
    expect(o2oRel!.kind).toBe('o2o');
    expect(o2oRel!.toModel).toBe('auth.User');
    expect(o2oRel!.relatedName).toBe('profile');
  });

  it('fromModel uses appLabel.modelName', () => {
    if (!result.ok) throw new Error('not ok');
    const product = result.value.find(m => m.name === 'Product')!;
    for (const rel of product.relations) {
      expect(rel.fromModel).toBe('catalogue.Product');
    }
  });
});

// ── Choices — spec PARSEMODELS external choices deferred ─────────────────────

describe('parseModels — choices (spec PARSEMODELS external choices deferred)', () => {
  const src = f('models/with-choices.py');
  const onWarn = vi.fn();
  const resolveImport = vi.fn(); // MUST receive zero calls
  const result = parseModels(src, { filePath: 'orders/models.py', onWarn, resolveImport });

  it('returns ok:true', () => {
    expect(result.ok).toBe(true);
  });

  it('resolveImport receives ZERO calls (design §8)', () => {
    expect(resolveImport).not.toHaveBeenCalled();
  });

  it('inline choices extracted as Choice[]', () => {
    if (!result.ok) throw new Error('not ok');
    const order = result.value.find(m => m.name === 'Order')!;
    const priority = order.fields.find(f => f.name === 'priority');
    expect(priority).toBeDefined();
    expect(priority!.choices?.kind).toBe('inline');
    expect(choiceValues(priority!.choices).length).toBe(3);
    expect(choiceValues(priority!.choices)[0]).toEqual({ value: '1', label: 'Low' });
  });

  it('nested TextChoices (PaymentStatus) resolved as Choice[]', () => {
    if (!result.ok) throw new Error('not ok');
    const order = result.value.find(m => m.name === 'Order')!;
    const paymentStatus = order.fields.find(f => f.name === 'payment_status');
    expect(paymentStatus).toBeDefined();
    expect(paymentStatus!.choices?.kind).toBe('resolved');
    expect(choiceValues(paymentStatus!.choices).length).toBeGreaterThanOrEqual(1);
  });

  it('module-level constant (STATUS_CHOICES) resolved as Choice[]', () => {
    if (!result.ok) throw new Error('not ok');
    const order = result.value.find(m => m.name === 'Order')!;
    const status = order.fields.find(f => f.name === 'status');
    expect(status).toBeDefined();
    expect(status!.choices?.kind).toBe('resolved');
    expect(choiceValues(status!.choices).length).toBeGreaterThanOrEqual(1);
  });
});

// ── Choices — class-level constant tolerates non-4-space indentation ─────────

describe('parseModels — class-level choices constant tolerates any indentation', () => {
  it('resolves a class-level constant ref when the body uses 2-space indentation', () => {
    const src = [
      'from django.db import models',
      '',
      'class Order(models.Model):',
      '  PRIORITY_CHOICES = [(1, "Low"), (2, "High")]',
      '  priority = models.IntegerField(choices=PRIORITY_CHOICES)',
      '',
    ].join('\n');
    const result = parseModels(src, { filePath: 'orders/models.py' });
    if (!result.ok) throw new Error('not ok');
    const order = result.value.find(m => m.name === 'Order')!;
    const priority = order.fields.find(f => f.name === 'priority');
    expect(priority, 'field is detected regardless of indentation').toBeDefined();
    expect(choiceValues(priority!.choices)).toEqual([
      { value: '1', label: 'Low' },
      { value: '2', label: 'High' },
    ]);
  });

  it('does NOT capture deeper-nested assignments as class-level constants', () => {
    // A constant living inside a nested class must not leak into the model's
    // class-level constant index (that would be a false positive from \s+).
    const src = [
      'from django.db import models',
      '',
      'class Order(models.Model):',
      '    class Meta:',
      '        LEAKED = [(9, "Nope")]',
      '    status = models.IntegerField(choices=LEAKED)',
      '',
    ].join('\n');
    const result = parseModels(src, { filePath: 'orders/models.py' });
    if (!result.ok) throw new Error('not ok');
    const order = result.value.find(m => m.name === 'Order')!;
    const status = order.fields.find(f => f.name === 'status');
    expect(status).toBeDefined();
    // ref present but unresolved → keeps the symbol, never the leaked value
    expect(status!.choices).toEqual({ kind: 'unresolved', symbolName: 'LEAKED' });
    expect(choiceValues(status!.choices)).not.toContainEqual({ value: '9', label: 'Nope' });
  });
});

// ── Meta class ────────────────────────────────────────────────────────────────

describe('parseModels — models with Meta', () => {
  const src = f('models/with-meta.py');
  const result = parseModels(src, { filePath: 'cms/models.py' });

  it('returns ok:true', () => {
    expect(result.ok).toBe(true);
  });

  it('BaseContent — meta.abstract = true', () => {
    if (!result.ok) throw new Error('not ok');
    const base = result.value.find(m => m.name === 'BaseContent');
    expect(base?.meta?.abstract).toBe(true);
  });

  it('Article — meta.dbTable and meta.ordering', () => {
    if (!result.ok) throw new Error('not ok');
    const article = result.value.find(m => m.name === 'Article');
    expect(article?.meta?.dbTable).toBe('cms_articles');
    expect(article?.meta?.ordering).toContain('created_at');
    expect(article?.meta?.verboseName).toBe('Article');
  });

  it('LegacyProduct — meta.proxy and meta.tableComment', () => {
    if (!result.ok) throw new Error('not ok');
    const legacy = result.value.find(m => m.name === 'LegacyProduct');
    expect(legacy?.meta?.proxy).toBe(true);
    expect(legacy?.meta?.tableComment).toBe('Legacy product table from v1');
  });
});

// ── Empty input ────────────────────────────────────────────────────────────────

describe('parseModels — empty input (spec EMPTY-INPUT-INVARIANCE)', () => {
  it('returns ok:true with empty array for ""', () => {
    const result = parseModels('');
    expect(result).toEqual({ ok: true, value: [] });
  });

  it('returns ok:true with empty array for whitespace-only', () => {
    const result = parseModels('   \n\t  ');
    expect(result).toEqual({ ok: true, value: [] });
  });
});

// ── Malformed input ────────────────────────────────────────────────────────────

describe('parseModels — malformed input (spec MALFORMED-INPUT-RESILIENCE)', () => {
  it('returns ok:true and recovers partial models before malformed class', () => {
    const src = `
from django.db import models

class GoodModel(models.Model):
    name = models.CharField(max_length=100)

class |||BrokenModel(models.
    name = models.CharField()
`;
    const result = parseModels(src);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBeGreaterThanOrEqual(1);
      expect(result.value[0]!.name).toBe('GoodModel');
    }
  });

  it('handles model with no fields gracefully', () => {
    const src = `
from django.db import models

class EmptyModel(models.Model):
    pass
`;
    const result = parseModels(src);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]!.fields).toHaveLength(0);
      expect(result.value[0]!.relations).toHaveLength(0);
    }
  });
});

// ── Indentation tolerance ─────────────────────────────────────────────────────

describe('parseModels — indentation tolerance', () => {
  it('parses a model indented with 2 spaces (fields, relation, Meta, property)', () => {
    const src = [
      'from django.db import models',
      '',
      'class Article(models.Model):',
      '  title = models.CharField(max_length=200)',
      '  author = models.ForeignKey("Author", on_delete=models.CASCADE, related_name="articles")',
      '',
      '  class Meta:',
      '    db_table = "articles"',
      '    ordering = ["-created_at"]',
      '',
      '  @property',
      '  def summary(self):',
      '    return self.title',
      '',
    ].join('\n');

    const result = parseModels(src, { filePath: 'blog/models.py' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toHaveLength(1);
    const model = result.value[0]!;
    expect(model.fields.map(fl => fl.name)).toEqual(['title']);
    expect(model.fields[0]!.maxLength).toBe(200);
    expect(model.relations).toHaveLength(1);
    expect(model.relations[0]!.toModel).toBe('Author');
    expect(model.meta?.dbTable).toBe('articles');
    expect(model.meta?.ordering).toContain('created_at');
    expect(model.properties.map(p => p.name)).toContain('summary');
  });

  it('parses a model indented with tabs (fields and Meta)', () => {
    const src = [
      'class Ticket(models.Model):',
      '\tcode = models.CharField(max_length=10)',
      '\tuser = models.ForeignKey("auth.User", on_delete=models.PROTECT)',
      '',
      '\tclass Meta:',
      '\t\tdb_table = "tickets"',
      '\t\tverbose_name = "Ticket"',
      '',
    ].join('\n');

    const result = parseModels(src, { filePath: 'support/models.py' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toHaveLength(1);
    const model = result.value[0]!;
    expect(model.fields.map(fl => fl.name)).toEqual(['code']);
    expect(model.relations.map(r => r.fieldName)).toEqual(['user']);
    expect(model.meta?.dbTable).toBe('tickets');
    expect(model.meta?.verboseName).toBe('Ticket');
  });

  it('parses a file mixing 4-space and 2-space models (each class detects its own indent)', () => {
    const src = [
      'class Wide(models.Model):',
      '    name = models.CharField(max_length=50)',
      '',
      'class Narrow(models.Model):',
      '  slug = models.SlugField()',
      '',
    ].join('\n');

    const result = parseModels(src, { filePath: 'app/models.py' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toHaveLength(2);
    expect(result.value[0]!.fields.map(fl => fl.name)).toEqual(['name']);
    expect(result.value[1]!.fields.map(fl => fl.name)).toEqual(['slug']);
  });
});

// ── Performance (spec PERFORMANCE) ───────────────────────────────────────────

describe('parseModels — performance (spec PERFORMANCE)', () => {
  it('stays linear as the file grows', () => {
    const modelBlock = (n: number) =>
      `class Model${n}(models.Model):\n    name = models.CharField(max_length=100)\n    slug = models.SlugField(unique=True)\n    count = models.IntegerField(default=0)\n\n`;

    const { ratio } = measureScaling({
      prepare: size => Array.from({ length: size }, (_, i) => modelBlock(i)).join(''),
      run: src => {
        parseModels(src, { filePath: 'app/models.py' });
      },
    });
    expect(ratio).toBeLessThan(2.5);
  });
});

// Django 5.2's CompositePrimaryKey wears field syntax but is a table
// constraint. Parsed as a field it produced a junk column in every export.
describe('parseModels — CompositePrimaryKey', () => {
  const parse = (src: string) => {
    const r = parseModels(src, { filePath: 'core/models.py' });
    if (!r.ok) throw new Error('parse failed');
    return r.value;
  };

  it('lifts the columns onto the model', () => {
    const [m] = parse(`
class TenantRow(models.Model):
    pk = models.CompositePrimaryKey("tenant_id", "row_id")
    tenant_id = models.IntegerField()
    row_id = models.IntegerField()
`);
    expect(m?.compositePrimaryKey).toEqual(['tenant_id', 'row_id']);
  });

  it('does not leave it behind as a field', () => {
    const [m] = parse(`
class TenantRow(models.Model):
    pk = models.CompositePrimaryKey("tenant_id", "row_id")
    tenant_id = models.IntegerField()
`);
    expect(m?.fields.map(f => f.name)).toEqual(['tenant_id']);
  });

  it('accepts single quotes and extra whitespace', () => {
    const [m] = parse(`
class TenantRow(models.Model):
    pk = models.CompositePrimaryKey( 'a' ,  'b' )
    a = models.IntegerField()
    b = models.IntegerField()
`);
    expect(m?.compositePrimaryKey).toEqual(['a', 'b']);
  });

  it('leaves the property absent when there is none', () => {
    const [m] = parse(`
class Plain(models.Model):
    name = models.CharField(max_length=10)
`);
    expect(m?.compositePrimaryKey).toBeUndefined();
  });
});

// Django templates call any zero-argument attribute exactly like a field, and
// Django's own docs put get_absolute_url on every model. Only @property was
// captured, so every such call was reported as a typo.
describe('parseModels — zero-argument methods', () => {
  const parse = (src: string) => {
    const r = parseModels(src, { filePath: 'shop/models.py' });
    if (!r.ok) throw new Error('parse failed');
    return r.value;
  };

  it('captures a plain def', () => {
    const [m] = parse(`
class Product(models.Model):
    name = models.CharField(max_length=1)

    def get_absolute_url(self):
        return "/"
`);
    expect(m?.methods).toEqual(['get_absolute_url']);
  });

  // A template cannot pass arguments, so accepting these would green-light a
  // real mistake.
  it('skips a method that takes arguments', () => {
    const [m] = parse(`
class Product(models.Model):
    name = models.CharField(max_length=1)

    def discounted(self, pct):
        return 0
`);
    expect(m?.methods).toBeUndefined();
  });

  it('accepts a return annotation and a trailing comma', () => {
    const [m] = parse(`
class Product(models.Model):
    name = models.CharField(max_length=1)

    def total(self,) -> int:
        return 0
`);
    expect(m?.methods).toEqual(['total']);
  });

  it('leaves dunders out', () => {
    const [m] = parse(`
class Product(models.Model):
    name = models.CharField(max_length=1)

    def __str__(self):
        return "x"
`);
    expect(m?.methods).toBeUndefined();
  });

  it('does not swallow a @property into methods', () => {
    const [m] = parse(`
class Product(models.Model):
    name = models.CharField(max_length=1)

    @property
    def label(self):
        return self.name
`);
    expect(m?.methods).toBeUndefined();
    expect(m?.properties.map(p => p.name)).toEqual(['label']);
  });
});

// `to=` is how migrations are written and perfectly normal in a model. The
// target pattern took the first token after the paren, so EVERY to= relation
// resolved to a model literally called "to": the chain resolver then rejected
// {{ order.owner.email }}, and the target's reverse accessor never existed.
describe('parseModels — the to= keyword form', () => {
  const relationOf = (line: string) => {
    const r = parseModels(`class Order(models.Model):\n    ${line}\n`, {
      filePath: 'shop/models.py',
    });
    if (!r.ok) throw new Error('parse failed');
    return r.value[0]?.relations[0];
  };

  it.each([
    [
      'a bare class',
      'owner = models.ForeignKey(to=Customer, on_delete=models.CASCADE)',
      'Customer',
    ],
    [
      'a quoted app.Model',
      'owner = models.ForeignKey(to="shop.Customer", on_delete=models.CASCADE)',
      'shop.Customer',
    ],
    [
      'the user setting',
      'owner = models.ForeignKey(to=settings.AUTH_USER_MODEL, on_delete=models.CASCADE)',
      'settings.AUTH_USER_MODEL',
    ],
    ['a many-to-many', 'tags = models.ManyToManyField(to=Tag)', 'Tag'],
    ['a one-to-one', 'p = models.OneToOneField(to=Profile, on_delete=models.CASCADE)', 'Profile'],
  ])('resolves %s', (_label, line, expected) => {
    expect(relationOf(line)?.toModel).toBe(expected);
  });

  it('keeps reading the positional form', () => {
    expect(
      relationOf('owner = models.ForeignKey(Customer, on_delete=models.CASCADE)')?.toModel,
    ).toBe('Customer');
  });

  it('keeps reading self', () => {
    expect(
      relationOf('parent = models.ForeignKey("self", on_delete=models.CASCADE)')?.toModel,
    ).toBe('self');
  });

  it('keeps the other kwargs alongside it', () => {
    const rel = relationOf(
      'owner = models.ForeignKey(to=Customer, related_name="orders", on_delete=models.CASCADE)',
    );
    expect(rel?.relatedName).toBe('orders');
    expect(rel?.onDelete).toBe('CASCADE');
  });
});

// Django 5.0 accepts a MAPPING for choices as well as a list of pairs. It was
// not read at all, so the field carried none: no badge, and
// `get_<field>_display` was reported as not a field of the model.
describe('parseModels — choices given as a mapping', () => {
  const choicesOf = (line: string) => {
    const r = parseModels(`class Order(models.Model):\n    ${line}\n`, {
      filePath: 'shop/models.py',
    });
    if (!r.ok) throw new Error('parse failed');
    const c = r.value[0]?.fields[0]?.choices;
    return c && c.kind !== 'unresolved' ? c.values.map(v => `${v.value}=${v.label}`) : [];
  };

  it('reads string keys', () => {
    expect(choicesOf('st = models.CharField(choices={"a": "A", "b": "B"})')).toEqual([
      'a=A',
      'b=B',
    ]);
  });

  it('reads integer keys', () => {
    expect(choicesOf('st = models.IntegerField(choices={1: "One", 2: "Two"})')).toEqual([
      '1=One',
      '2=Two',
    ]);
  });

  it('reads single-quoted ones', () => {
    expect(choicesOf("st = models.CharField(choices={'a': 'A'})")).toEqual(['a=A']);
  });

  it('still reads the list of pairs', () => {
    expect(choicesOf('st = models.CharField(choices=[("a", "A")])')).toEqual(['a=A']);
  });
});
