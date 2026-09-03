# Test Django Project

Test project for manually validating **Django Language Service** VS Code extension features.

## Setup

```bash
cd src/test-django-project
uv sync
uv run python manage.py migrate
```

## Run Tests

```bash
uv run python manage.py test apps.shop -v2
```

## Launch with Extension

F5 in VS Code opens this project as the debug workspace.

## Bulk Apps (generated)

Every app under `apps/` except `shop`, `core` and `accounts` is written by
`scripts/generate_test_models.py`: `models.py`, `apps.py`, `migrations/0001_initial.py` per app,
plus a rewrite of `INSTALLED_APPS` in `config/settings.py` that keeps the hand-written apps and
re-adds the generated ones. Re-running overwrites all of it, so an edit made by hand in one of
those apps is lost the next time anyone runs the script.

The fixture's size is load-bearing. `CONTRIBUTING.md` attributes the integration suite's
`retries: 2` to activation and scanner contention at the current model count, so regenerating
with different numbers changes the timing that suite was tuned against.

---

## Model Relationship Cases

Every type of Django model relationship is covered. Use these in templates to test the extension's chain type resolver, reverse relations, and intellisense.

### ForeignKey WITH `related_name`

| Model | Field | Target | `related_name` | Template access |
|---|---|---|---|---|
| `Product` | `category` | `Category` | `'products'` | `category.products.all` |
| `Product` | `author` | `User` | `'products'` | `user.products.all` |
| `Review` | `product` | `Product` | `'reviews'` | `product.reviews.all` |
| `Review` | `author` | `User` | `'reviews'` | `user.reviews.all` |
| `Order` | `customer` | `User` | `'orders'` | `user.orders.all` |
| `OrderItem` | `order` | `Order` | `'items'` | `order.items.all` |
| `SubCategory` | `category` | `Category` | `'subcategories'` | `category.subcategories.all` |
| `Supplier` | `product` | `Product` | `'suppliers'` | `product.suppliers.all` |
| `ProductImage` | `product` | `Product` | `'images'` | `product.images.all` |
| `ProductImage` | `uploaded_by` | `User` | `'uploaded_images'` | `user.uploaded_images.all` |

### ForeignKey WITHOUT `related_name` (auto-generated `_set`)

| Model | Field | Target | Auto reverse | Template access |
|---|---|---|---|---|
| `Comment` | `product` | `Product` | `comment_set` | `product.comment_set.all` |
| `Comment` | `author` | `User` | `comment_set` | `user.comment_set.all` |
| `OrderItem` | `product` | `Product` | `orderitem_set` | `product.orderitem_set.all` |

### ForeignKey with `related_name='+'` (reverse DISABLED)

| Model | Field | Target | Reverse | Template access |
|---|---|---|---|---|
| `Coupon` | `product` | `Product` | disabled | `product.???` should NOT resolve |

### Self-referential ForeignKey

| Model | Field | Target | `related_name` | Template access |
|---|---|---|---|---|
| `SubCategory` | `parent` | `self` | `'children'` | `subcategory.children.all` / `subcategory.parent.name` |

### ForeignKey via string reference

| Model | Field | Target | `related_name` | Note |
|---|---|---|---|---|
| `Supplier` | `product` | `'shop.Product'` | `'suppliers'` | String instead of import |

### Multiple FKs to same model

| Model | Fields | Target | `related_name`s |
|---|---|---|---|
| `ProductImage` | `product` + `uploaded_by` | `Product` + `User` | `'images'` + `'uploaded_images'` |

### OneToOne WITH `related_name`

| Model | Field | Target | `related_name` | Template access |
|---|---|---|---|---|
| `Profile` | `user` | `User` | `'profile'` | `user.profile.full_name` |
| `Warehouse` | `product` | `Product` | `'warehouse'` | `product.warehouse.capacity` |

### OneToOne WITHOUT `related_name` (auto-generated lowercase)

| Model | Field | Target | Auto reverse | Template access |
|---|---|---|---|---|
| `SpecialOffer` | `product` | `Product` | `specialoffer` | `product.specialoffer.discount_percent` |
| `Wishlist` | `user` | `User` | `wishlist` | `user.wishlist.products.all` |

### ManyToMany WITH `related_name`

| Model | Field | Target | `related_name` | Template access |
|---|---|---|---|---|
| `Tag` | `products` | `Product` | `'tags'` | `product.tags.all` / `tag.products.all` |

### ManyToMany WITHOUT `related_name` (auto-generated `_set`)

| Model | Field | Target | Auto reverse | Template access |
|---|---|---|---|---|
| `Wishlist` | `products` | `Product` | `wishlist_set` | `product.wishlist_set.all` |

### Abstract model inheritance

| Abstract | Child | Inherited fields |
|---|---|---|
| `TimeStampedModel` | `Comment` | `created_at`, `updated_at` |

### @property methods

| Model | Property | Returns |
|---|---|---|
| `Product` | `is_available` | `bool` |
| `Product` | `discount_price` | `Decimal` |
| `Profile` | `full_name` | `str` |
| `Profile` | `display_name` | `str` |
| `Order` | `is_completed` | `bool` |
| `Comment` | `short_text` | `str` |
| `SpecialOffer` | `is_active` | `bool` |

---

## View Context Cases

### FBV (Function-Based Views)

| View | Template | Context keys | Helpers |
|---|---|---|---|
| `home` | `shop/pages/home.html` | `featured_products`, `total_products`, `total_categories` | `get_base_context` |
| `product_list` | `shop/pages/products/product_list.html` | `products`, `categories`, `SORT_OPTIONS`, `search_query` | `get_base_context` |
| `product_detail` | `shop/pages/products/product_detail.html` | `product`, `reviews`, `related_products`, `tags` | `get_base_context` |
| `dashboard` | `shop/pages/dashboard/dashboard.html` | `chart_labels`, `chart_values`, `recent_orders` | `get_base_context` |

### CBV (Class-Based Views)

| View | Type | `model` | `context_object_name` |
|---|---|---|---|
| `ProductListView` | `ListView` | `Product` | `'products'` |
| `ProductDetailView` | `DetailView` | `Product` | `'product'` |

### Helper functions with conditional branches

| Helper | Direct keys | Conditional keys (per user type) |
|---|---|---|
| `get_base_context` | `user`, `site_name`, `current_year`, `debug_mode`, `user_type` | admin/staff/customer branches |
| `get_admin_context` | `all_products`, `pending_orders`, `total_revenue` | only if `user_type == 'admin'` |
| `get_staff_context` | `assigned_products`, `recent_orders` | only if `user_type == 'staff'` |
| `get_customer_context` | `my_orders`, `order_count` | only if `user_type == 'customer'` |

---

## Template Feature Cases

### DTL Tags tested

`{% extends %}`, `{% block %}`, `{% include %}`, `{% load %}`, `{% for/empty %}`, `{% if/elif/else %}`, `{% csrf_token %}`, `{% url %}`, `{% trans %}`

No template here uses `{% with %}` or `{% static %}`. `{% load static %}` appears without a
single `{% static %}` call, so nothing in this fixture exercises static-path completion inside a
template — `static/css/site.css` exists only for the unit test to assert against.

### Custom template tags (`{% load shop_tags %}`)

| Type | Name | Usage |
|---|---|---|
| `@register.filter` | `currency` | `{{ price\|currency }}` |
| `@register.filter` | `star_rating` | `{{ rating\|star_rating }}` |
| `@register.simple_tag` | `price_range` | `{% price_range products %}` |
| `@register.inclusion_tag` | `product_card` | `{% product_card product %}` |
| `@register.simple_tag(takes_context=True)` | `active_nav` | `{% active_nav 'url_name' %}` |

### Inline JS with DTL (`<script>`)

- `dashboard.html` — Chart.js with `{{ chart_labels|safe }}`, `{{ chart_values|safe }}`, `{% trans %}`

### Inline CSS with DTL (`<style>`)

- `home.html` — `{{ theme_color|default:"#4f46e5" }}`, `{% if debug_mode %}`

### Alpine.js directives

`x-data`, `x-show`, `x-transition`, `@click`, `@click.away`, `@mouseenter`, `@mouseleave`, `x-text`, `x-model`, `x-intersect`, `:class`

---

## Stack

- Django 6.0 + SQLite
- Tailwind CSS (CDN)
- Alpine.js (CDN)
- Chart.js (CDN)
