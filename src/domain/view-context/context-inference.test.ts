/**
 * Ported from legacy __tests__/context-type-inference.test.ts — the spec of
 * how view source maps to typed context entries. Annotations are arrays here
 * (AnnotationRef[]) instead of the legacy Map.
 */
import { describe, it, expect } from 'vitest';
import { inferContextTypes } from './context-inference';

const ann = (types: ReturnType<typeof inferContextTypes>, key: string): string[] =>
  (types.get(key)?.annotations ?? []).map(a => a.name);

// ── SECTION 1: Model.objects.filter → QuerySet ───────────────────────────────

describe('inferContextTypes — querysets', () => {
  it('Model.objects.filter → queryset of Model', () => {
    const types = inferContextTypes(`
def product_list(request):
    context = dict()
    context['products'] = Product.objects.filter(active=True)
    return render(request, 'list.html', context)
`);
    expect(types.get('products')).toMatchObject({ kind: 'queryset', model: 'Product' });
  });

  it('Model.objects.all → queryset of Model', () => {
    const types = inferContextTypes(`
def list_view(request):
    context = dict()
    context['categories'] = Category.objects.all()
    return render(request, 'list.html', context)
`);
    expect(types.get('categories')).toMatchObject({ kind: 'queryset', model: 'Category' });
  });

  it('chained filter/select_related/annotate still detects model', () => {
    const types = inferContextTypes(`
def list_view(request):
    context = dict()
    context['products'] = Product.objects.filter(category=author).select_related('profile').annotate(total=Count('id'))
    return render(request, 'list.html', context)
`);
    expect(types.get('products')).toMatchObject({ kind: 'queryset', model: 'Product' });
  });
});

// ── SECTION 2: .get / .first / shortcuts → instance ──────────────────────────

describe('inferContextTypes — instances', () => {
  it('Model.objects.get → instance', () => {
    const types = inferContextTypes(`
def detail(request, pk):
    context = dict()
    context['product'] = Product.objects.get(id=pk)
    return render(request, 'detail.html', context)
`);
    expect(types.get('product')).toMatchObject({ kind: 'instance', model: 'Product' });
  });

  it('Model.objects.filter(...).first() → instance', () => {
    const types = inferContextTypes(`
def detail(request, pk):
    context = dict()
    context['order'] = Order.objects.filter(customer=author).order_by('-created').first()
    return render(request, 'detail.html', context)
`);
    expect(types.get('order')).toMatchObject({ kind: 'instance', model: 'Order' });
  });

  it('Model.objects.create() → instance', () => {
    const types = inferContextTypes(`
def view(request):
    product = Product.objects.create(name='X', price=10)
    context = dict()
    context['product'] = product
    return render(request, 'tpl.html', context)
`);
    expect(types.get('product')).toMatchObject({ kind: 'instance', model: 'Product' });
  });

  it('get_object_or_404 with bare Model → instance', () => {
    const types = inferContextTypes(`
def view(request, slug):
    product = get_object_or_404(Product, slug=slug)
    context = dict()
    context['product'] = product
    return render(request, 'tpl.html', context)
`);
    expect(types.get('product')).toMatchObject({ kind: 'instance', model: 'Product' });
  });

  it('get_object_or_404 with queryset arg → instance (not queryset)', () => {
    const types = inferContextTypes(`
def view(request, slug):
    product = get_object_or_404(
        Product.objects.select_related('category', 'author'),
        slug=slug,
        status='published',
    )
    context = dict()
    context['product'] = product
    return render(request, 'tpl.html', context)
`);
    expect(types.get('product')).toMatchObject({ kind: 'instance', model: 'Product' });
  });

  it('get_list_or_404 → queryset', () => {
    const types = inferContextTypes(`
def view(request):
    items = get_list_or_404(Product, status='published')
    context = dict()
    context['items'] = items
    return render(request, 'tpl.html', context)
`);
    expect(types.get('items')).toMatchObject({ kind: 'queryset', model: 'Product' });
  });

  it('get_or_create / update_or_create → tuple, NOT classified as queryset', () => {
    const types = inferContextTypes(`
def view(request):
    pair = Product.objects.get_or_create(name='X')
    other = Product.objects.update_or_create(name='X', defaults={'price': 10})
    context = dict()
    context['pair'] = pair
    context['other'] = other
    return render(request, 'tpl.html', context)
`);
    expect(types.get('pair')?.kind).not.toBe('queryset');
    expect(types.get('other')?.kind).not.toBe('queryset');
  });
});

// ── SECTION 3: intermediate variables + context.update ───────────────────────

describe('inferContextTypes — variable indirection and update()', () => {
  it('type flows through an intermediate variable', () => {
    const types = inferContextTypes(`
def list_view(request):
    products_qs = Product.objects.filter(category=author)
    context = dict()
    context['products'] = products_qs
    return render(request, 'list.html', context)
`);
    expect(types.get('products')).toMatchObject({ kind: 'queryset', model: 'Product' });
  });

  it('context.update({...}) — dict values typed', () => {
    const types = inferContextTypes(`
def list_view(request):
    context = dict()
    context.update({
        'products': Product.objects.filter(active=True),
        'sponsors': Sponsor.objects.filter(author=author),
    })
    return render(request, 'list.html', context)
`);
    expect(types.get('products')?.model).toBe('Product');
    expect(types.get('sponsors')?.model).toBe('Sponsor');
  });

  it('multi-line assignment with parentheses wrapper', () => {
    const types = inferContextTypes(`
def product_list(request):
    products_qs = (
        Product.objects
        .filter(category=author)
        .select_related('profile')
        .annotate(total=Count('id'))
    )
    context = dict()
    context['products'] = products_qs
    return render(request, 'list.html', context)
`);
    expect(types.get('products')).toMatchObject({ kind: 'queryset', model: 'Product' });
  });

  it('multi-line without wrapper (chained method args)', () => {
    const types = inferContextTypes(`
def list_view(request):
    context = dict()
    context['tags'] = Tag.objects.filter(
        product=product
    ).select_related('profile')
    return render(request, 'list.html', context)
`);
    expect(types.get('tags')).toMatchObject({ kind: 'queryset', model: 'Tag' });
  });
});

// ── SECTION 4: non-model values are not typed ────────────────────────────────

describe('inferContextTypes — non-model values', () => {
  it('string / number / unknown call have no type', () => {
    const types = inferContextTypes(`
def page(request):
    context = dict()
    context['title'] = _('Dashboard')
    context['total_revenue'] = 0
    context['data'] = get_data()
    return render(request, 'page.html', context)
`);
    expect(types.has('title')).toBe(false);
    expect(types.has('total_revenue')).toBe(false);
    expect(types.has('data')).toBe(false);
  });

  it('Sum()/render() bare calls are not classified', () => {
    const types = inferContextTypes(`
def view(request):
    total = Sum('price')
    context = dict()
    context['total'] = total
    return render(request, 'tpl.html', context)
`);
    expect(types.has('total')).toBe(false);
  });
});

// ── SECTION 5: CBV model attribute ───────────────────────────────────────────

describe('inferContextTypes — CBV', () => {
  it('DetailView with context_object_name → instance under that name', () => {
    const types = inferContextTypes(`
class ProductDetailView(DetailView):
    template_name = 'detail.html'
    model = Product
    context_object_name = 'product'
`);
    expect(types.get('product')).toMatchObject({ kind: 'instance', model: 'Product' });
  });

  it('ListView without context_object_name → object_list queryset', () => {
    const types = inferContextTypes(`
class ProductListView(ListView):
    template_name = 'list.html'
    model = Product
`);
    expect(types.get('object_list')).toMatchObject({ kind: 'queryset', model: 'Product' });
  });

  it('get_queryset override with annotate → object carries annotations', () => {
    const types = inferContextTypes(`
class ProductListView(ListView):
    model = Product
    context_object_name = 'products'

    def get_queryset(self):
        return Product.objects.annotate(review_count=Count('reviews')).filter(status='published')
`);
    expect(types.get('products')).toMatchObject({ kind: 'queryset', model: 'Product' });
    expect(ann(types, 'products')).toContain('review_count');
  });

  it('get_queryset with values projection propagates', () => {
    const types = inferContextTypes(`
class ItemListView(ListView):
    model = Item
    context_object_name = 'items'

    def get_queryset(self):
        return Item.objects.values('id', 'name')
`);
    expect(types.get('items')?.valuesFields).toEqual(expect.arrayContaining(['id', 'name']));
  });

  it('CBV without get_queryset — bare queryset, no annotations', () => {
    const types = inferContextTypes(`
class ItemListView(ListView):
    model = Item
    context_object_name = 'items'
`);
    expect(types.get('items')).toMatchObject({ kind: 'queryset', model: 'Item' });
    expect(types.get('items')?.annotations).toBeUndefined();
  });

  it('multi-line get_queryset return parsed correctly', () => {
    const types = inferContextTypes(`
class ProductListView(ListView):
    model = Product
    context_object_name = 'products'

    def get_queryset(self):
        return (
            Product.objects
            .filter(status='published')
            .annotate(
                review_count=Count('reviews'),
                avg_rating=Avg('reviews__rating'),
            )
        )
`);
    expect(ann(types, 'products')).toEqual(expect.arrayContaining(['review_count', 'avg_rating']));
  });
});

// ── SECTION 6: annotations / values / aggregate ──────────────────────────────

describe('inferContextTypes — annotate / values / aggregate', () => {
  it('annotate Count adds annotation to queryset type', () => {
    const types = inferContextTypes(`
def list_view(request):
    context = dict()
    context['categories'] = Category.objects.annotate(product_count=Count('products'))
    return render(request, 'tpl.html', context)
`);
    expect(ann(types, 'categories')).toContain('product_count');
    expect(types.get('categories')?.annotations?.[0]?.func).toBe('Count');
  });

  it('multiple annotations all captured', () => {
    const types = inferContextTypes(`
def view(request):
    context = dict()
    context['products'] = Product.objects.annotate(
        total=Count('orders'),
        avg_price=Avg('price'),
        max_price=Max('price'),
    )
    return render(request, 'tpl.html', context)
`);
    expect(ann(types, 'products')).toEqual(
      expect.arrayContaining(['total', 'avg_price', 'max_price']),
    );
  });

  it('annotate via local variable preserves annotations', () => {
    const types = inferContextTypes(`
def view(request):
    qs = Category.objects.annotate(product_count=Count('products'))
    context = dict()
    context['categories'] = qs
    return render(request, 'tpl.html', context)
`);
    expect(ann(types, 'categories')).toContain('product_count');
  });

  it('no annotate → annotations undefined', () => {
    const types = inferContextTypes(`
def view(request):
    context = dict()
    context['categories'] = Category.objects.all()
    return render(request, 'tpl.html', context)
`);
    expect(types.get('categories')?.annotations).toBeUndefined();
  });

  it('values() captures the field list', () => {
    const types = inferContextTypes(`
def view(request):
    context = dict()
    context['cats'] = Category.objects.values('id', 'name')
    return render(request, 'tpl.html', context)
`);
    expect(types.get('cats')?.valuesFields).toEqual(expect.arrayContaining(['id', 'name']));
  });

  it('values() with no args leaves valuesFields undefined (all fields)', () => {
    const types = inferContextTypes(`
def view(request):
    context = dict()
    context['cats'] = Category.objects.values()
    return render(request, 'tpl.html', context)
`);
    expect(types.get('cats')?.valuesFields).toBeUndefined();
  });

  it('values() combined with annotate carries both', () => {
    const types = inferContextTypes(`
def view(request):
    context = dict()
    context['cats'] = Category.objects.annotate(c=Count('items')).values('id', 'c')
    return render(request, 'tpl.html', context)
`);
    expect(ann(types, 'cats')).toContain('c');
    expect(types.get('cats')?.valuesFields).toEqual(expect.arrayContaining(['id', 'c']));
  });

  it('aggregate() → kind=dict with kwargs as dictKeys', () => {
    const types = inferContextTypes(`
def view(request):
    context = dict()
    context['totals'] = Category.objects.aggregate(total=Count('id'), avg=Avg('price'))
    return render(request, 'tpl.html', context)
`);
    expect(types.get('totals')?.kind).toBe('dict');
    expect(types.get('totals')?.dictKeys).toEqual(expect.arrayContaining(['total', 'avg']));
  });
});

// ── SECTION 7: render(request, 'tpl', {...}) inline dict (new-arch extension) ─

describe('inferContextTypes — render() inline dict', () => {
  it('types values inside the render dict literal', () => {
    const types = inferContextTypes(`
def product_list(request):
    products = Product.objects.all()
    category = request.GET.get('category')
    return render(request, 'catalogue/product_list.html', {
        'products': products,
        'category': category,
    })
`);
    expect(types.get('products')).toMatchObject({ kind: 'queryset', model: 'Product' });
    expect(types.has('category')).toBe(false);
  });

  it('types direct expressions inside a single-line render dict', () => {
    const types = inferContextTypes(`
def list_posts(request):
    posts = Post.objects.filter(status='published')
    return render(request, 'blog/list.html', {'posts': posts})
`);
    expect(types.get('posts')).toMatchObject({ kind: 'queryset', model: 'Post' });
  });
});

// ── SECTION 8: realistic patterns + empty input ──────────────────────────────

describe('inferContextTypes — real patterns', () => {
  it('product_list pattern (helper context + update + choices)', () => {
    const types = inferContextTypes(`
@group_required(['admin'])
def product_list(request):
    template_name = 'shop/pages/products/list.html'
    admin_author = request.user.author
    context = get_base_context(request)
    products_qs = Product.objects.filter(category=admin_author).select_related('profile').annotate(total=Count('id'))
    context.update({
        'products': products_qs,
        'CATEGORY_CHOICES': CATEGORY_CHOICES,
        'STOCK_STATUS': STOCK_STATUS
    })
    return render(request, template_name, context)
`);
    expect(types.get('products')).toMatchObject({ kind: 'queryset', model: 'Product' });
    expect(types.has('CATEGORY_CHOICES')).toBe(false);
  });

  it('detail pattern with .get()', () => {
    const types = inferContextTypes(`
def product_detail(request, pk):
    context = get_base_context(request)
    context['product'] = Product.objects.get(id=pk)
    context['tags'] = Tag.objects.filter(product=context['product'])
    return render(request, 'detail.html', context)
`);
    expect(types.get('product')).toMatchObject({ kind: 'instance', model: 'Product' });
    expect(types.get('tags')).toMatchObject({ kind: 'queryset', model: 'Tag' });
  });

  it('empty source returns empty map', () => {
    expect(inferContextTypes('').size).toBe(0);
  });
});

// ── SECTION 10: return {...} dict literals (helper-body typing) ──────────────

describe('inferContextTypes — return {...} dict (helper bodies)', () => {
  it('return dict literal values are typed', () => {
    const types = inferContextTypes(`
def get_admin_context(request):
    products = Product.objects.filter(managed=True)
    return {
        'is_admin': True,
        'managed_products': products,
    }
`);
    expect(types.get('managed_products')).toMatchObject({
      kind: 'queryset',
      model: 'Product',
    });
    expect(types.has('is_admin')).toBe(false);
  });

  it('single-line return dict with direct queryset RHS', () => {
    const types = inferContextTypes(`
def helper(request):
    return {'items': Item.objects.all()}
`);
    expect(types.get('items')).toMatchObject({ kind: 'queryset', model: 'Item' });
  });
});
