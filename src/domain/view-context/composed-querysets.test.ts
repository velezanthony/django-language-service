/**
 * Views compose a queryset over several statements — a base, a narrowing, an
 * annotation, sometimes under an `if`. Inference only recognised
 * `Model.objects…`, so the SECOND statement matched nothing and the variable
 * kept whatever the first line established: every annotation added later was
 * silently dropped, and `{{ o.item_count }}` in the template then read as a
 * field that does not exist.
 *
 * The other half of the same story: a view may call its context dict anything.
 * context-keys.ts learned that long ago; the types side kept the name
 * hardcoded, so a view using `ctx` got its keys listed and not one typed.
 */
import { describe, it, expect } from 'vitest';
import { inferContextTypes } from './context-inference';

const t = (src: string, key = 'orders') => inferContextTypes(src).get(key);

describe('a queryset composed across statements', () => {
  it('inline: everything in one expression', () => {
    expect(
      t(`
def d(request):
    context = {'orders': Order.objects.select_related('customer').annotate(n=Count('items')).filter(x=1)}
`),
    ).toEqual({ model: 'Order', kind: 'queryset', annotations: [{ name: 'n', func: 'Count' }] });
  });

  it('one local, then straight into the context', () => {
    expect(
      t(`
def d(request):
    qs = Order.objects.annotate(n=Count('items'))
    context = {'orders': qs}
`),
    ).toEqual({ model: 'Order', kind: 'queryset', annotations: [{ name: 'n', func: 'Count' }] });
  });

  it('REASSIGNED: base, then narrowed', () => {
    expect(
      t(`
def d(request):
    qs = Order.objects.select_related('customer')
    qs = qs.filter(status='pending')
    context = {'orders': qs}
`),
    ).toEqual({ model: 'Order', kind: 'queryset' });
  });

  it('REASSIGNED: annotation added in a later statement', () => {
    expect(
      t(`
def d(request):
    qs = Order.objects.all()
    qs = qs.annotate(item_count=Count('items'))
    context = {'orders': qs}
`),
    ).toEqual({
      model: 'Order',
      kind: 'queryset',
      annotations: [{ name: 'item_count', func: 'Count' }],
    });
  });

  it('CONDITIONAL narrowing, the everyday shape', () => {
    expect(
      t(`
def d(request):
    qs = Order.objects.annotate(n=Count('items'))
    if request.GET.get('q'):
        qs = qs.filter(name__icontains=request.GET['q'])
    context = {'orders': qs}
`),
    ).toEqual({ model: 'Order', kind: 'queryset', annotations: [{ name: 'n', func: 'Count' }] });
  });

  it('values() applied later', () => {
    expect(
      t(`
def d(request):
    qs = Order.objects.all()
    qs = qs.values('id', 'status')
    context = {'orders': qs}
`),
    ).toEqual({ model: 'Order', kind: 'queryset', valuesFields: ['id', 'status'] });
  });

  it('two locals composed into one', () => {
    expect(
      t(`
def d(request):
    base = Order.objects.select_related('customer')
    recent = base.filter(created__gte=x).annotate(n=Count('items'))
    context = {'orders': recent}
`),
    ).toEqual({ model: 'Order', kind: 'queryset', annotations: [{ name: 'n', func: 'Count' }] });
  });

  it('multi-line chain, as a formatter would leave it', () => {
    expect(
      t(`
def d(request):
    qs = (
        Order.objects
        .select_related('customer')
        .annotate(n=Count('items'))
    )
    context = {'orders': qs}
`),
    ).toEqual({ model: 'Order', kind: 'queryset', annotations: [{ name: 'n', func: 'Count' }] });
  });

  it('.first() after composition is one instance', () => {
    expect(
      t(`
def d(request):
    qs = Order.objects.all()
    latest = qs.order_by('-created').first()
    context = {'orders': latest}
`),
    ).toEqual({ model: 'Order', kind: 'instance' });
  });
});

describe('the context dict under any name', () => {
  const orders = (src: string) => inferContextTypes(src).get('orders');
  const QS = { model: 'Order', kind: 'queryset' };

  it('types a one-line context literal', () => {
    expect(
      orders(`
def d(request):
    context = {'orders': Order.objects.all()}
    return render(request, 'x.html', context)
`),
    ).toEqual(QS);
  });

  it('types subscript assignment on a dict named something else', () => {
    expect(
      orders(`
def d(request):
    ctx = {}
    ctx['orders'] = Order.objects.all()
    return render(request, 'x.html', ctx)
`),
    ).toEqual(QS);
  });

  it('types a literal assigned to a dict named something else', () => {
    expect(
      orders(`
def d(request):
    payload = {'orders': Order.objects.all()}
    return render(request, 'x.html', payload)
`),
    ).toEqual(QS);
  });

  it('types an update() on a dict named something else', () => {
    expect(
      orders(`
def d(request):
    ctx = {}
    ctx.update({'orders': Order.objects.all()})
    return render(request, 'x.html', ctx)
`),
    ).toEqual(QS);
  });

  it('follows the context= keyword argument', () => {
    expect(
      orders(`
def d(request):
    data = {'orders': Order.objects.all()}
    return render(request, 'x.html', context=data)
`),
    ).toEqual(QS);
  });

  // A comparison is not an assignment.
  it('does not read ctx[orders] == x as a context value', () => {
    expect(
      orders(`
def d(request):
    ctx = {}
    if ctx['orders'] == Order.objects.all():
        pass
    return render(request, 'x.html', ctx)
`),
    ).toBeUndefined();
  });
});

// A `.values*()` row is not a model instance, and which shape it IS depends on
// the call. All of these used to come out as a queryset of the model, so the
// template was measured against fields the row does not carry and completion
// offered them.
describe('what a .values() row actually is', () => {
  const rowType = (rhs: string) =>
    inferContextTypes(`
def d(request):
    context = {}
    context['rows'] = ${rhs}
    return render(request, 'x.html', context)
`).get('rows');

  it('keeps the projection for values() with columns', () => {
    expect(rowType(`Entry.objects.values('id', 'title')`)).toEqual({
      model: 'Entry',
      kind: 'queryset',
      valuesFields: ['id', 'title'],
    });
  });

  it('keeps a joined column under the name Django gives it', () => {
    expect(rowType(`Entry.objects.values('blog__name')`)?.valuesFields).toEqual(['blog__name']);
  });

  // `values(lower=Lower('title'))` names a column too.
  it('counts a column named by an expression', () => {
    expect(rowType(`Entry.objects.values(lower=Lower('title'))`)?.valuesFields).toEqual(['lower']);
  });

  it('counts positional and expression columns together', () => {
    expect(rowType(`Entry.objects.values('id', lower=Lower('title'))`)?.valuesFields).toEqual([
      'id',
      'lower',
    ]);
  });

  // Knowable — every concrete field, foreign keys under their _id attname —
  // but only with the model graph, which the inference does not have. Saying
  // "a value, no further" beats claiming it is still the model.
  it('says nothing about values() with no columns', () => {
    expect(rowType('Entry.objects.values()')).toEqual({ kind: 'primitive' });
  });

  // values_list hands back TUPLES: {{ row.id }} renders blank however right it
  // looks.
  it('says nothing about a values_list tuple', () => {
    expect(rowType(`Entry.objects.values_list('id', 'title')`)).toEqual({ kind: 'primitive' });
  });

  it('says nothing about flat=True, which is a bare scalar', () => {
    expect(rowType(`Entry.objects.values_list('id', flat=True)`)).toEqual({ kind: 'primitive' });
  });

  // named=True is the one form that DOES take attribute access.
  it('keeps the projection for named=True', () => {
    expect(rowType(`Entry.objects.values_list('id', 'title', named=True)`)).toEqual({
      model: 'Entry',
      kind: 'queryset',
      valuesFields: ['id', 'title'],
    });
  });

  it('leaves an ordinary queryset alone', () => {
    expect(rowType('Entry.objects.filter(x=1)')).toEqual({ model: 'Entry', kind: 'queryset' });
  });

  it('leaves annotations alone', () => {
    expect(rowType(`Entry.objects.annotate(n=Count('c'))`)?.annotations).toEqual([
      { name: 'n', func: 'Count' },
    ]);
  });
});
