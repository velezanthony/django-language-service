/**
 * A queryset nested inside another expression is not the outer one.
 *
 * `parseValuesFields`, `opaqueRowType` and `parseAggregateKeys` scanned the
 * WHOLE right-hand side for their call, wherever it sat. So the textbook
 * subquery
 *
 *     Product.objects.filter(id__in=Order.objects.values('product_id'))
 *
 * recorded `product_id` as the OUTER queryset's projection: every real field of
 * Product then read as "not in the projection", the whole template filled with
 * warnings on correct code, and completion offered one column that does not
 * exist on the row. `values_list(..., flat=True)` — the most common shape of
 * all — degraded the outer queryset to a scalar instead, which silently turns
 * off every check inside the loop.
 *
 * The rule below is one rule, not four fixes: only a call in the OUTER chain
 * says anything about the outer type.
 */
import { describe, it, expect } from 'vitest';
import { inferContextTypes } from './context-inference';
import { buildContextVars } from './context-vars';
import { createModelGraph } from './model-graph';
import { diagnoseTemplate } from './diagnose';
import { parseModels } from '$domain/parsers/models';
import type { ResolvedType } from './types';

const MODELS = `
from django.db import models

class Category(models.Model):
    name = models.CharField(max_length=50)

class Tag(models.Model):
    label = models.CharField(max_length=20)

class Product(models.Model):
    name = models.CharField(max_length=50)
    price = models.DecimalField(max_digits=6, decimal_places=2)
    category = models.ForeignKey(Category, on_delete=models.CASCADE, related_name="products")
    tags = models.ManyToManyField(Tag)

class Order(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="orders")
    amount = models.IntegerField()
`;
const parsed = parseModels(MODELS, { filePath: 'shop/models.py' });
if (!parsed.ok) throw new Error('model fixture failed');
const graph = createModelGraph(parsed.value);

const fbv = (body: string): string =>
  `def probe_view(request):\n    context = {}\n${body}\n    return render(request, 't.html', context)\n`;

const typeOf = (expr: string): ResolvedType | undefined =>
  inferContextTypes(fbv(`    context['products'] = ${expr}`)).get('products');

const warnings = (expr: string, template: string): string[] => {
  const inferred = inferContextTypes(fbv(`    context['products'] = ${expr}`));
  return diagnoseTemplate({
    templateSource: template,
    contextVars: buildContextVars([...inferred.keys()], inferred),
    graph,
  }).map(d => d.message);
};

const PRODUCT_QS: ResolvedType = { model: 'Product', kind: 'queryset' };

describe('a call nested in an argument does not retype the outer queryset', () => {
  it.each([
    [
      'values in a filter subquery',
      `Product.objects.filter(id__in=Order.objects.values('product_id'))`,
    ],
    [
      'values_list flat in a subquery',
      `Product.objects.filter(id__in=Order.objects.values_list('product_id', flat=True))`,
    ],
    [
      'values_list in an exclude',
      `Product.objects.exclude(id__in=Order.objects.values_list('product_id'))`,
    ],
    [
      'aggregate inside a filter',
      `Product.objects.filter(price__gt=Order.objects.aggregate(n=Count('id'))['n'])`,
    ],
    [
      'values inside a Prefetch queryset',
      `Product.objects.prefetch_related(Prefetch('tags', queryset=Tag.objects.values('label')))`,
    ],
    [
      'two levels down',
      `Product.objects.filter(id__in=Order.objects.filter(x__in=Tag.objects.values('id')).values_list('product_id', flat=True))`,
    ],
  ])('%s', (_label, expr) => {
    expect(typeOf(expr)).toEqual(PRODUCT_QS);
  });

  // `annotate(last=Subquery(...))` DOES add an annotation to the outer queryset
  // — that part is correct and stays. What must not happen is the inner
  // `.values()` becoming the outer projection.
  it('records the annotation but not the inner projection', () => {
    const type = typeOf(
      `Product.objects.annotate(last=Subquery(Order.objects.values('amount')[:1]))`,
    );
    expect(type?.kind).toBe('queryset');
    expect(type?.model).toBe('Product');
    expect(type).not.toHaveProperty('valuesFields');
  });

  it('does not warn on ordinary field access through a subquery filter', () => {
    expect(
      warnings(
        `Product.objects.filter(id__in=Order.objects.values('product_id'))`,
        '{% for p in products %}{{ p.name }}{{ p.price }}{% endfor %}',
      ),
    ).toEqual([]);
  });

  it('does not turn the loop variable into a scalar', () => {
    expect(
      warnings(
        `Product.objects.filter(id__in=Order.objects.values_list('product_id', flat=True))`,
        '{% for p in products %}{{ p.name }}{% endfor %}',
      ),
    ).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// …and a call that IS in the outer chain still speaks for it.
// ─────────────────────────────────────────────────────────────────────────────
describe('a call in the outer chain still types the result', () => {
  it('keeps a real projection', () => {
    expect(typeOf(`Product.objects.values('name', 'price')`)).toEqual({
      model: 'Product',
      kind: 'queryset',
      valuesFields: ['name', 'price'],
    });
  });

  it('keeps a projection that follows a filter', () => {
    expect(typeOf(`Product.objects.filter(price__gt=10).values('name')`)).toEqual({
      model: 'Product',
      kind: 'queryset',
      valuesFields: ['name'],
    });
  });

  it('keeps a projection whose own argument holds parentheses', () => {
    expect(typeOf(`Product.objects.values('name', lower=Lower('name'))`)).toEqual({
      model: 'Product',
      kind: 'queryset',
      valuesFields: ['name', 'lower'],
    });
  });

  it('still degrades a flat values_list in the outer chain to a scalar', () => {
    expect(typeOf(`Product.objects.values_list('name', flat=True)`)?.kind).toBe('primitive');
  });

  it('still reads a real aggregate as a dict', () => {
    expect(typeOf(`Product.objects.aggregate(total=Sum('price'))`)?.kind).toBe('dict');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A chain that ends in a scalar is a scalar.
//
// `.exists()` returns a bool and `.count()` an int, but the chain in front of
// them matched the queryset pattern and the terminal was never looked at — so
// `{% if has_orders %}` was typed as a queryset of Order, offering every field
// of the model on a boolean and validating attribute access against it.
// ─────────────────────────────────────────────────────────────────────────────
describe('a scalar terminal ends the chain', () => {
  it.each([
    `Product.objects.filter(price__gt=10).exists()`,
    `Product.objects.exists()`,
    `Product.objects.filter(price__gt=10).count()`,
    `Product.objects.all().count()`,
  ])('%s is a value, not a queryset', expr => {
    expect(typeOf(expr)).toEqual({ kind: 'primitive' });
  });

  it('does not offer model fields on a boolean', () => {
    expect(
      warnings(`Product.objects.filter(price__gt=10).exists()`, '{% if products %}yes{% endif %}'),
    ).toEqual([]);
  });

  it('leaves the chain alone when the terminal is not scalar', () => {
    expect(typeOf(`Product.objects.filter(price__gt=10).distinct()`)).toEqual({
      model: 'Product',
      kind: 'queryset',
    });
  });
});
