/**
 * Two families of context key whose NAME appears nowhere in the view source,
 * so a reader that only looks for literals never finds them — and then reports
 * the only spelling that works as an undefined variable.
 *
 *   - CBV aliases: ListView on `Article` puts `article_list` in the context,
 *     which is the name Django's own docs use in every example.
 *   - Positional aggregates: `aggregate(Avg("price"))` produces the key
 *     `price__avg`, synthesised by Aggregate.default_alias.
 */
import { describe, it, expect } from 'vitest';
import { inferContextTypes } from './context-inference';

const keys = (src: string) => [...inferContextTypes(src).keys()].sort();
const typeOf = (src: string, key: string) => inferContextTypes(src).get(key);

describe('ListView context', () => {
  const SRC = 'class ArticleList(ListView):\n    model = Article\n';

  it('exposes object_list', () => {
    expect(typeOf(SRC, 'object_list')).toEqual({ model: 'Article', kind: 'queryset' });
  });

  // MultipleObjectMixin: `"%s_list" % object_list.model._meta.model_name`.
  it('exposes the <model>_list alias Django docs use everywhere', () => {
    expect(typeOf(SRC, 'article_list')).toEqual({ model: 'Article', kind: 'queryset' });
  });

  // `_meta.model_name` is `object_name.lower()` — no CamelCase splitting.
  // Only verbose_name splits words, and confusing the two invents a key.
  it('lowercases a CamelCase model without inserting underscores', () => {
    expect(keys('class L(ListView):\n    model = BlogPost\n')).toContain('blogpost_list');
    expect(keys('class L(ListView):\n    model = BlogPost\n')).not.toContain('blog_post_list');
  });

  it('context_object_name replaces the alias but keeps object_list', () => {
    const k = keys('class L(ListView):\n    model = Article\n    context_object_name = "posts"\n');
    expect(k).toContain('object_list');
    expect(k).toContain('posts');
    expect(k).not.toContain('article_list');
  });

  // Docs: "If the page is not paginated, this context variable will be None."
  // So neither "undefined" nor "definitely a Page" is right — naming them
  // without a type is.
  it('names the pagination keys, which are always present', () => {
    const k = keys(SRC);
    expect(k).toEqual(expect.arrayContaining(['paginator', 'page_obj', 'is_paginated']));
  });

  it('does not pretend to know what page_obj is', () => {
    expect(typeOf(SRC, 'page_obj')).toEqual({ kind: 'primitive' });
  });
});

describe('DetailView context', () => {
  it('exposes object AND the model alias', () => {
    const k = keys('class D(DetailView):\n    model = BlogPost\n');
    expect(k).toContain('object');
    expect(k).toContain('blogpost');
  });

  // SingleObjectMixin assigns both; dropping `object` made `{{ object.name }}`
  // read as undefined on any view that named its object.
  it('keeps object when context_object_name is set', () => {
    const k = keys('class D(DetailView):\n    model = Article\n    context_object_name = "post"\n');
    expect(k).toContain('object');
    expect(k).toContain('post');
    expect(k).not.toContain('article');
  });
});

// ContextMixin.get_context_data does `kwargs.setdefault("view", self)`.
describe('every CBV', () => {
  it('has view in the context', () => {
    expect(keys('class D(DetailView):\n    model = Article\n')).toContain('view');
    expect(keys('class L(ListView):\n    model = Article\n')).toContain('view');
  });

  it('and a plain function view does not', () => {
    expect(keys("def d(request):\n    context = {'a': Article.objects.all()}\n")).not.toContain(
      'view',
    );
  });
});

// Aggregate.default_alias is `"%s__%s" % (expression.name, aggregate_name.lower())`.
describe('positional aggregate names', () => {
  const agg = (call: string) => {
    const t = inferContextTypes(`
def d(request):
    context = {'stats': Order.objects.aggregate(${call})}
`).get('stats');
    return t?.kind === 'dict' ? t.dictKeys : undefined;
  };

  it('Avg("price") → price__avg', () => {
    expect(agg('Avg("price")')).toEqual(['price__avg']);
  });

  it('Count("authors") → authors__count', () => {
    expect(agg('Count("authors")')).toEqual(['authors__count']);
  });

  it('a related path keeps its double underscores', () => {
    expect(agg('Max("book__pages")')).toEqual(['book__pages__max']);
  });

  it('a dotted path becomes the ORM spelling', () => {
    expect(agg('Min("book.pages")')).toEqual(['book__pages__min']);
  });

  it('distinct=True does not change the name', () => {
    expect(agg('Count("authors", distinct=True)')).toEqual(['authors__count']);
  });

  it('keyword aliases still win, and mix with positional ones', () => {
    expect(agg('Avg("price"), total=Sum("price")')).toEqual(['price__avg', 'total']);
  });
});

// `alias()` looks exactly like `annotate()` and adds NOTHING to the objects —
// the value is kept for reuse in a later filter. Treating them alike invents
// an attribute that renders as an empty string.
describe('alias() is not annotate()', () => {
  it('adds no annotation', () => {
    const t = inferContextTypes(`
def d(request):
    context = {'orders': Order.objects.filter(x=1).alias(t=Sum("lines__amt"))}
`).get('orders');
    expect(t).toEqual({ model: 'Order', kind: 'queryset' });
  });
});

// annotate() names work the same way, and had the same nested-`=` bug.
describe('annotate names', () => {
  const ann = (call: string) => {
    const t = inferContextTypes(`
def d(request):
    context = {'orders': Order.objects.annotate(${call})}
`).get('orders');
    return t?.annotations?.map(a => `${a.name}:${a.func}`);
  };

  it('keyword alias', () => {
    expect(ann('n=Count("items")')).toEqual(['n:Count']);
  });

  it('keyword alias whose aggregate carries its own kwarg', () => {
    expect(ann('n=Count("items", distinct=True)')).toEqual(['n:Count']);
  });

  it('positional, which Django auto-names', () => {
    expect(ann('Count("entries")')).toEqual(['entries__count:Count']);
  });

  it('a non-call expression keeps its alias', () => {
    expect(ann('n=F("other")')).toEqual(['n:F']);
  });
});
