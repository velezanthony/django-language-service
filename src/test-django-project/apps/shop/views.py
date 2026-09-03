from django.shortcuts import render, get_object_or_404
from django.views.generic import ListView, DetailView
from django.contrib.auth.decorators import login_required
from django.db.models import Count, Avg, Q, Sum, F

from apps.core.context import get_base_context
from .models import Product, Category, Review, Order, Tag


# ── Home ──

def home(request):
    template_name = 'shop/pages/home.html'
    context = get_base_context(request)

    context.update({
        'featured_products': Product.objects.filter(status='published').order_by('-created')[:6],
        'total_products': Product.objects.filter(status='published').count(),
        'total_categories': Category.objects.count(),
    })

    return render(request, template_name, context)


# ── Product views (FBV) ──

def product_list(request):
    template_name = 'shop/pages/products/product_list.html'
    context = get_base_context(request)

    products_qs = (
        Product.objects
        .filter(status='published')
        .select_related('category', 'author')
        .annotate(
            review_count=Count('reviews'),
            avg_rating=Avg('reviews__rating'),
        )
        .order_by('-created')
    )

    # Filtering
    category_slug = request.GET.get('category')
    if category_slug:
        products_qs = products_qs.filter(category__slug=category_slug)

    search = request.GET.get('q')
    if search:
        products_qs = products_qs.filter(
            Q(name__icontains=search) | Q(description__icontains=search)
        )

    context.update({
        'products': products_qs,
        'categories': Category.objects.annotate(product_count=Count('products')),
        'SORT_OPTIONS': Product.STATUS_CHOICES,
        'search_query': search or '',
    })

    return render(request, template_name, context)


def product_detail(request, slug):
    template_name = 'shop/pages/products/product_detail.html'
    context = get_base_context(request)

    product = get_object_or_404(
        Product.objects.select_related('category', 'author'),
        slug=slug,
        status='published',
    )

    context['product'] = product
    context['reviews'] = Review.objects.filter(product=product).select_related('author')
    context['related_products'] = (
        Product.objects
        .filter(category=product.category, status='published')
        .exclude(id=product.id)[:4]
    )
    context['tags'] = product.tags.all()

    return render(request, template_name, context)


# ── Dashboard (FBV) ──

@login_required
def dashboard(request):
    template_name = 'shop/pages/dashboard/dashboard.html'
    context = get_base_context(request)

    # Sales chart data
    monthly_sales = (
        Order.objects
        .filter(customer=request.user, status='delivered')
        .values('created__month')
        .annotate(total=Sum('total'))
        .order_by('created__month')
    )

    context.update({
        'chart_labels': [item['created__month'] for item in monthly_sales],
        'chart_values': [float(item['total']) for item in monthly_sales],
        'recent_orders': Order.objects.filter(customer=request.user).order_by('-created')[:5],
    })

    return render(request, template_name, context)


# ── CBV examples ──

class ProductListView(ListView):
    model = Product
    template_name = 'shop/pages/products/product_list.html'
    context_object_name = 'products'
    paginate_by = 12

    def get_queryset(self):
        return Product.objects.filter(status='published').select_related('category')


class ProductDetailView(DetailView):
    model = Product
    template_name = 'shop/pages/products/product_detail.html'
    context_object_name = 'product'

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['reviews'] = self.object.reviews.all()
        context['tags'] = self.object.tags.all()
        return context
