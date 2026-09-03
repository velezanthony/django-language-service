/**
 * `context_object_name` is an attribute of the class, not of a nearby line.
 *
 * It was looked for in a fixed window of five lines above and ten below the
 * `model =` line. A ListView with a docstring and the ordinary set of
 * attributes — paginate_by, ordering, template_name, a queryset, a couple of
 * mixin settings — pushes it out of that window, and then the alias the
 * template actually iterates is reported as
 * "'orders' is not defined in the view context": a hard WARNING on correct
 * code, in the file the author is looking at.
 *
 * A class body ends where the indentation does. That is the window.
 */
import { describe, it, expect } from 'vitest';
import { inferContextTypes } from './context-inference';

const cbv = (attrs: string) =>
  `from django.views.generic import ListView\n\n\nclass OrderListView(ListView):\n${attrs}\n`;

describe('context_object_name anywhere in the class body', () => {
  it('is found right next to the model', () => {
    const types = inferContextTypes(cbv(`    model = Order\n    context_object_name = 'orders'`));
    expect(types.has('orders')).toBe(true);
  });

  it('is found far below the model, past a realistic run of attributes', () => {
    const types = inferContextTypes(
      cbv(
        [
          '    """List every order for the current tenant.',
          '',
          '    Paginated, newest first.',
          '    """',
          '',
          '    model = Order',
          '    template_name = "orders/list.html"',
          '    paginate_by = 25',
          '    ordering = ["-created_at"]',
          '    allow_empty = True',
          '    http_method_names = ["get"]',
          '    login_url = "/accounts/login/"',
          '    permission_required = "orders.view_order"',
          '    raise_exception = True',
          '    slug_field = "reference"',
          '    context_object_name = "orders"',
        ].join('\n'),
      ),
    );

    expect(types.has('orders')).toBe(true);
    expect(types.get('orders')).toEqual({ model: 'Order', kind: 'queryset' });
  });

  it('is found above the model too', () => {
    const types = inferContextTypes(
      cbv(
        [
          '    context_object_name = "orders"',
          '    template_name = "orders/list.html"',
          '    paginate_by = 25',
          '    ordering = ["-created_at"]',
          '    allow_empty = True',
          '    http_method_names = ["get"]',
          '    slug_field = "reference"',
          '    model = Order',
        ].join('\n'),
      ),
    );

    expect(types.has('orders')).toBe(true);
  });

  // The window is the class, so a NEIGHBOURING class cannot lend its alias.
  it('does not borrow the attribute from the next class', () => {
    const source = [
      'class OrderListView(ListView):',
      '    model = Order',
      '',
      'class ProductListView(ListView):',
      '    model = Product',
      '    context_object_name = "products"',
    ].join('\n');
    const types = inferContextTypes(source);

    expect(types.has('products')).toBe(true);
    expect(types.has('order_list')).toBe(true);
  });

  it('falls back to Django default naming when the class does not set one', () => {
    expect(inferContextTypes(cbv('    model = Order')).has('order_list')).toBe(true);
  });
});
