from django import template

register = template.Library()


@register.filter
def currency(value):
    """Format a number as currency: {{ price|currency }} → $29.99"""
    try:
        return f"${float(value):,.2f}"
    except (ValueError, TypeError):
        return value


@register.filter
def star_rating(value):
    """Convert numeric rating to stars: {{ rating|star_rating }} → ★★★★☆"""
    try:
        filled = int(float(value))
        empty = 5 - filled
        return '★' * filled + '☆' * empty
    except (ValueError, TypeError):
        return '☆☆☆☆☆'


@register.simple_tag
def price_range(queryset):
    """Get min-max price range from a product queryset."""
    agg = queryset.aggregate(
        min_price=models.Min('price'),
        max_price=models.Max('price'),
    )
    return f"${agg['min_price']} - ${agg['max_price']}"


@register.inclusion_tag('components/product_card.html')
def product_card(product):
    """Render a product card component."""
    return {'product': product}


@register.simple_tag(takes_context=True)
def active_nav(context, url_name):
    """Add 'active' class if current URL matches."""
    request = context['request']
    if request.resolver_match and request.resolver_match.url_name == url_name:
        return 'active'
    return ''
