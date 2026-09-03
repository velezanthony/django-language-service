# Fixture: templatetags/shop_tags.py
# Based on patterns from django-oscar (BSD licence, Tangent Communications PLC).
from django import template
from django.utils.safestring import mark_safe

register = template.Library()


@register.simple_tag
def featured_products(count=6):
    """Return the top N featured products."""
    from catalogue.models import Product
    return Product.objects.filter(is_featured=True)[:count]


@register.simple_tag(takes_context=True)
def basket_item_count(context):
    """Return number of items in the current basket."""
    request = context.get('request')
    if request and hasattr(request, 'basket'):
        return request.basket.num_lines
    return 0


@register.filter
def currency(value, symbol='$'):
    """Format a decimal value as currency."""
    try:
        return f'{symbol}{float(value):,.2f}'
    except (TypeError, ValueError):
        return value


@register.filter(name='truncate_middle')
def truncate_middle(value, length=20):
    """Truncate a string in the middle, preserving start and end."""
    s = str(value)
    if len(s) <= length:
        return s
    half = (length - 3) // 2
    return f'{s[:half]}...{s[-(length - half - 3):]}'


@register.inclusion_tag('shop/partials/price_box.html', takes_context=True)
def price_box(context, product):
    """Render the price box partial for a product."""
    return {
        'product': product,
        'currency': context.get('currency', 'USD'),
    }
