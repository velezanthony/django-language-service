# Fixture: FBV views with render() and context dict
# Inspired by django-oscar catalogue views
from django.shortcuts import render, get_object_or_404
from django.http import Http404
from django.contrib.auth.decorators import login_required


@login_required
def product_list(request):
    """List all products with optional category filter."""
    products = Product.objects.all()
    category = request.GET.get('category')
    return render(request, 'catalogue/product_list.html', {
        'products': products,
        'category': category,
    })


def product_detail(request, pk):
    """Show a single product detail page."""
    product = get_object_or_404(Product, pk=pk)
    related = Product.objects.filter(category=product.category)[:4]
    return render(request, 'catalogue/product_detail.html', {
        'product': product,
        'related': related,
    })
