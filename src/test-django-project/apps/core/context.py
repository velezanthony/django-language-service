from datetime import datetime
from django.conf import settings
from django.db.models import Sum


def get_base_context(request):
    """Base context shared across all views."""
    context = dict(user=request.user)
    context['site_name'] = 'Django Shop'
    context['current_year'] = datetime.now().year
    context['debug_mode'] = settings.DEBUG

    user_type = 'anonymous'
    if request.user.is_authenticated:
        if request.user.is_superuser:
            user_type = 'admin'
        elif request.user.is_staff:
            user_type = 'staff'
        else:
            user_type = 'customer'

    context['user_type'] = user_type

    if user_type == 'admin':
        context.update(get_admin_context(request))
    elif user_type == 'staff':
        context.update(get_staff_context(request))
    elif user_type == 'customer':
        context.update(get_customer_context(request))

    return context


def get_admin_context(request):
    """Context for admin users — products, orders, reports."""
    from apps.shop.models import Product, Order
    return {
        'all_products': Product.objects.all(),
        'pending_orders': Order.objects.filter(status='pending'),
        'total_revenue': Order.objects.aggregate(total=Sum('total'))['total'] or 0,
    }


def get_staff_context(request):
    """Context for staff users — limited management."""
    from apps.shop.models import Product, Order
    return {
        'assigned_products': Product.objects.filter(author=request.user),
        'recent_orders': Order.objects.order_by('-created')[:10],
    }


def get_customer_context(request):
    """Context for authenticated customers — their orders and wishlist."""
    from apps.shop.models import Order
    return {
        'my_orders': Order.objects.filter(customer=request.user),
        'order_count': Order.objects.filter(customer=request.user).count(),
    }
