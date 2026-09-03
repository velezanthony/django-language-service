# Fixture: FBV that returns JsonResponse (no template)
# Inspired by typical Django API endpoint patterns
from django.http import JsonResponse
from django.views.decorators.http import require_POST


@require_POST
def add_to_basket(request):
    """Add a product to the basket, returns JSON."""
    product_id = request.POST.get('product_id')
    quantity = int(request.POST.get('quantity', 1))
    # basket.add(product_id, quantity)
    return JsonResponse({'success': True, 'quantity': quantity})


def basket_count(request):
    count = 0  # basket.count()
    return JsonResponse({'count': count})
