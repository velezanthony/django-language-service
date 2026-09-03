/**
 * `context['tags'] = product.tags.all()` — the shape that made hover, completion
 * and diagnostics all go silent on `tags`.
 *
 * The scanner sees only the view source, so it cannot know that `Product.tags`
 * is an M2M to Tag; the old inference therefore dropped the value and `tags`
 * became a bare scalar. The template then had a variable the extension "knew"
 * the name of and could say nothing else about — hovering it returned nothing,
 * which reads exactly like an unknown variable.
 *
 * The walk is now recorded at scan time and finished against the graph at
 * consumption time. These tests pin both halves.
 */
import { describe, it, expect } from 'vitest';
import { inferContextTypes } from './context-inference';
import { buildContextVars, contextVarToResolvedType } from './context-vars';
import { buildIteratorTypes } from './template-scope';
import { createModelGraph } from './model-graph';
import { diagnoseTemplate } from './diagnose';
import type { Model } from '$domain/types/model';
import type { Relation } from '$domain/types/relation';

const mk = (name: string, fields: string[], relations: Relation[] = []): Model => ({
  kind: 'model',
  name,
  appLabel: 'shop',
  filePath: 'apps/shop/models.py',
  line: 1,
  fields: fields.map(f => ({ name: f, fieldType: 'CharField' })),
  relations,
  properties: [],
});

const TAG = mk('Tag', ['name', 'slug']);
const REVIEW = mk('Review', ['body', 'rating']);
const PRODUCT = mk(
  'Product',
  ['name', 'price'],
  [
    { kind: 'm2m', fromModel: 'shop.Product', toModel: 'Tag', fieldName: 'tags' },
    {
      kind: 'fk',
      fromModel: 'shop.Review',
      toModel: 'Product',
      fieldName: 'product',
      relatedName: 'reviews',
    },
  ],
);
const GRAPH = createModelGraph([PRODUCT, TAG, REVIEW]);

const VIEW = `
def product_detail(request, slug):
    product = get_object_or_404(Product, slug=slug)
    context = {'product': product}
    context['tags'] = product.tags.all()
    return render(request, 'shop/product_detail.html', context)
`;

// The parser declares the keys it saw assigned, exactly as the scanner does —
// so `tags` is a ContextVar even in the runs where nothing could be inferred.
const KEYS = ['product', 'tags'];

const typesOf = (source: string) => {
  const inferred = inferContextTypes(source);
  const vars = buildContextVars(KEYS, inferred);
  const out = new Map<string, ReturnType<typeof contextVarToResolvedType>>();
  for (const v of vars) out.set(v.name, contextVarToResolvedType(v, GRAPH));
  return out;
};

describe('a context value walked off a local', () => {
  it('resolves product.tags.all() to a queryset of the related model', () => {
    expect(typesOf(VIEW).get('tags')).toEqual({ kind: 'queryset', model: 'Tag' });
  });

  it('leaves the var scalar for a consumer with no graph', () => {
    const inferred = inferContextTypes(VIEW);
    const [tags] = buildContextVars(['tags'], inferred);
    expect(tags!.kind).toBe('scalar');
    expect(contextVarToResolvedType(tags!)).toBeNull();
  });

  it('follows a reverse accessor too', () => {
    const src = VIEW.replace('product.tags.all()', 'product.reviews.all()');
    expect(typesOf(src).get('tags')).toEqual({ kind: 'queryset', model: 'shop.Review' });
  });

  it('reads .first() as a single instance, not a queryset', () => {
    const src = VIEW.replace('product.tags.all()', 'product.tags.first()');
    expect(typesOf(src).get('tags')).toEqual({ kind: 'instance', model: 'Tag' });
  });

  it('survives a longer queryset chain', () => {
    const src = VIEW.replace('product.tags.all()', "product.tags.filter(x=1).order_by('name')");
    expect(typesOf(src).get('tags')).toEqual({ kind: 'queryset', model: 'Tag' });
  });

  it('types a bare relation access with no call at all', () => {
    const src = VIEW.replace('product.tags.all()', 'product.tags');
    expect(typesOf(src).get('tags')).toEqual({ kind: 'queryset', model: 'Tag' });
  });

  // A projection or a number is NOT a model, and pretending otherwise would
  // invent fields the template does not have.
  it.each(['count()', 'values("name")', 'aggregate(n=Count("id"))', 'weird_helper()'])(
    'stays silent rather than guessing for .%s',
    tail => {
      const src = VIEW.replace('product.tags.all()', `product.tags.${tail}`);
      expect(typesOf(src).get('tags')).toBeNull();
    },
  );

  it('says nothing when the root local is itself untyped', () => {
    const src = VIEW.replace(
      'product = get_object_or_404(Product, slug=slug)',
      'product = whatever()',
    );
    expect(typesOf(src).get('tags')).toBeNull();
  });
});

describe('what the resolved walk unlocks downstream', () => {
  const vars = (() => {
    const inferred = inferContextTypes(VIEW);
    return buildContextVars(KEYS, inferred);
  })();
  const contextTypes = new Map(
    vars.flatMap(v => {
      const t = contextVarToResolvedType(v, GRAPH);
      return t ? [[v.name, t] as const] : [];
    }),
  );

  it('types the loop variable in {% for tag in tags %}', () => {
    const iters = buildIteratorTypes('{% for tag in tags %}{% endfor %}', contextTypes, GRAPH);
    expect(iters.get('tag')).toEqual({ kind: 'instance', model: 'Tag' });
  });

  it('accepts a real field on the loop variable', () => {
    const tpl = '{% for tag in tags %}{{ tag.name }}{% endfor %}';
    expect(diagnoseTemplate({ templateSource: tpl, contextVars: vars, graph: GRAPH })).toEqual([]);
  });

  it('now catches a typo on it, which it could not before', () => {
    const tpl = '{% for tag in tags %}{{ tag.nmae }}{% endfor %}';
    const msgs = diagnoseTemplate({ templateSource: tpl, contextVars: vars, graph: GRAPH }).map(
      d => d.message,
    );
    expect(msgs.join(' ')).toMatch(/nmae/);
  });
});
