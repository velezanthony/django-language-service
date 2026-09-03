/**
 * The Django surface a template can reach that is NOT a declared field.
 *
 * Written from a study of the 5.2 docs and source, then run against the engine:
 * inheritance was not resolved at all, reverse accessors existed only when
 * `related_name` was given, and the attributes Django synthesizes off a field
 * name were missing. Every one of those was a false error on ordinary code.
 */
import { describe, it, expect } from 'vitest';
import { diagnoseTemplate } from './diagnose';
import { createModelGraph } from './model-graph';
import { parseModels } from '$domain/parsers/models';
import { inferContextTypes } from './context-inference';
import { buildContextVars } from './context-vars';
import type { ContextVar } from '$domain/types/context-var';

const MODELS = `
from django.db import models

class Customer(models.Model):
    name = models.CharField(max_length=50)

class Tag(models.Model):
    label = models.CharField(max_length=20)

class Order(models.Model):
    STATUS = [("p", "Pending"), ("d", "Delivered")]
    status = models.CharField(max_length=1, choices=STATUS)
    created = models.DateTimeField()
    closed = models.DateTimeField(null=True)
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name="orders")
    tags = models.ManyToManyField(Tag)
    hidden = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name="+")

class Profile(models.Model):
    customer = models.OneToOneField(Customer, on_delete=models.CASCADE)

class Place(models.Model):
    address = models.CharField(max_length=80)

class Restaurant(Place):
    serves_pizza = models.BooleanField()

class PlaceProxy(Place):
    class Meta:
        proxy = True
`;
const parsed = parseModels(MODELS, { filePath: 'shop/models.py' });
if (!parsed.ok) throw new Error('fixture failed');
const graph = createModelGraph(parsed.value);

const CTX: ContextVar[] = [
  { name: 'order', kind: 'instance', typeRef: 'Order' },
  { name: 'orders', kind: 'queryset', typeRef: 'Order' },
  { name: 'customer', kind: 'instance', typeRef: 'Customer' },
  { name: 'place', kind: 'instance', typeRef: 'Place' },
  { name: 'restaurant', kind: 'instance', typeRef: 'Restaurant' },
  { name: 'proxy', kind: 'instance', typeRef: 'PlaceProxy' },
  { name: 'rows', kind: 'queryset', typeRef: 'Order', valuesFields: ['id', 'customer__name'] },
];
const msgs = (t: string) =>
  diagnoseTemplate({ templateSource: t, contextVars: CTX, graph }).map(d => d.message);

describe('reverse accessors', () => {
  it('related_name is the accessor', () => {
    expect(msgs('{% for o in customer.orders.all %}{{ o.status }}{% endfor %}')).toEqual([]);
  });

  // related_name REPLACES <model>_set — it is not an extra alias.
  it('related_name REPLACES order_set', () => {
    expect(msgs('{{ customer.order_set.count }}')).not.toEqual([]);
  });

  it('related_name="+" creates no accessor at all', () => {
    expect(msgs('{{ customer.hidden_set.count }}')).not.toEqual([]);
  });

  it('reverse O2O is an instance, not a manager', () => {
    expect(msgs('{{ customer.profile.id }}')).toEqual([]);
  });
});

describe('the FK _id shadow attribute', () => {
  it('order.customer_id is the raw pk and always exists', () => {
    expect(msgs('{{ order.customer_id }}')).toEqual([]);
  });

  // Deliberate silence: the resolver stops at a scalar because Django keeps
  // going on real Python values — `{{ order.created.year }}` and
  // `{{ order.status.upper }}` are both valid. Being stricter here buys one
  // error and costs false positives on `.year`.
  it('says nothing about what is chained off a scalar', () => {
    expect(msgs('{{ order.customer_id.name }}')).toEqual([]);
  });
});

describe('inheritance', () => {
  it('an MTI child sees the parent fields', () => {
    expect(msgs('{{ restaurant.address }}')).toEqual([]);
  });

  it('an MTI child has the <parent>_ptr link', () => {
    expect(msgs('{{ restaurant.place_ptr.address }}')).toEqual([]);
  });

  it('a proxy sees the parent fields', () => {
    expect(msgs('{{ proxy.address }}')).toEqual([]);
  });

  // A proxy shares the parent's table — there is no link field to create.
  it('a proxy does NOT get a <parent>_ptr', () => {
    expect(msgs('{{ proxy.place_ptr }}')).not.toEqual([]);
  });
});

describe('synthesized date accessors', () => {
  // Every DateField/DateTimeField without null=True gets these.
  it('get_next_by_<field> exists for a non-null DateTimeField', () => {
    expect(msgs('{{ order.get_next_by_created }}')).toEqual([]);
  });

  it('get_previous_by_<field> too', () => {
    expect(msgs('{{ order.get_previous_by_created }}')).toEqual([]);
  });

  // The guard is `if not self.null`.
  it('does NOT exist for a nullable one', () => {
    expect(msgs('{{ order.get_next_by_closed }}')).not.toEqual([]);
  });

  it('does not exist for a non-date field', () => {
    expect(msgs('{{ order.get_next_by_status }}')).not.toEqual([]);
  });
});

describe('values() projections', () => {
  it('a projected field is fine', () => {
    expect(msgs('{% for r in rows %}{{ r.id }}{% endfor %}')).toEqual([]);
  });

  // values() rows are dicts: the key is literally "customer__name".
  it('the double-underscore key is the way to read a joined field', () => {
    expect(msgs('{% for r in rows %}{{ r.customer__name }}{% endfor %}')).toEqual([]);
  });

  // ...and walking the relation is NOT — it renders blank.
  it('walking the relation on a values() row is wrong', () => {
    expect(msgs('{% for r in rows %}{{ r.customer.name }}{% endfor %}')).not.toEqual([]);
  });

  it('a field outside the projection is wrong', () => {
    expect(msgs('{% for r in rows %}{{ r.status }}{% endfor %}')).not.toEqual([]);
  });
});

describe('leading underscore', () => {
  // "Variables and attributes may not begin with underscores" — a
  // TemplateSyntaxError at COMPILE time, which takes the whole page down.
  it('obj._meta is reported', () => {
    expect(msgs('{{ order._meta }}')).not.toEqual([]);
  });

  it('obj._state is reported', () => {
    expect(msgs('{{ order._state.db }}')).not.toEqual([]);
  });
});

describe('manager access', () => {
  // A Manager has no __iter__ — {% for %} does list(values) and raises.
  it('iterating a related manager without .all is an error', () => {
    expect(msgs('{% for t in order.tags %}{{ t.label }}{% endfor %}')).not.toEqual([]);
  });

  it('with .all it is correct', () => {
    expect(msgs('{% for t in order.tags.all %}{{ t.label }}{% endfor %}')).toEqual([]);
  });

  // ManagerDescriptor raises AttributeError on an instance → HTTP 500.
  it('objects on an INSTANCE is an error', () => {
    expect(msgs('{{ order.objects.count }}')).not.toEqual([]);
  });
});

describe('indexing', () => {
  it('a numeric index into a queryset', () => {
    expect(msgs('{{ orders.0.status }}')).toEqual([]);
  });

  // KNOWN GAP. `-` is outside Django's variable charset, so `{{ orders.-1 }}`
  // is a TemplateSyntaxError that takes the page down at compile time. We stay
  // quiet: that failure is loud and immediate, and the parser has no notion of
  // expressions it cannot tokenise.
  it('does not yet catch a negative index', () => {
    expect(msgs('{{ orders.-1 }}')).toEqual([]);
  });
});

describe('choices', () => {
  it('get_<field>_display for a field with choices', () => {
    expect(msgs('{{ order.get_status_display }}')).toEqual([]);
  });

  it('but not for a field without them', () => {
    expect(msgs('{{ order.get_created_display }}')).not.toEqual([]);
  });
});

// `Prefetch('pizzas', queryset=…, to_attr='veg_menu')` puts the prefetched rows
// on `veg_menu` as a plain LIST. It is a real attribute the model does not
// declare, so it read as "not a field of Restaurant" on correct Django.
describe('Prefetch(to_attr=…)', () => {
  const PREFETCH = `
from django.db import models
class Pizza(models.Model):
    name = models.CharField(max_length=50)
class Restaurant(models.Model):
    title = models.CharField(max_length=50)
    pizzas = models.ManyToManyField(Pizza, related_name='restaurants')
`;
  const built = (() => {
    const models = parseModels(PREFETCH, { filePath: 'shop/models.py' });
    if (!models.ok) throw new Error('fixture');
    const inferred = inferContextTypes(`
def d(request):
    context = {}
    context['places'] = Restaurant.objects.prefetch_related(
        Prefetch('pizzas', queryset=Pizza.objects.filter(veg=True), to_attr='veg_menu'))
    return render(request, 'x.html', context)
`);
    return {
      graph: createModelGraph(models.value),
      vars: buildContextVars(['places'], inferred),
    };
  })();

  const say = (templateSource: string) =>
    diagnoseTemplate({ templateSource, contextVars: built.vars, graph: built.graph }).map(
      d => d.message,
    );

  it('accepts the attribute', () => {
    expect(say(`{% for p in places %}{{ p.veg_menu }}{% endfor %}`)).toEqual([]);
  });

  it('types what iterating it yields', () => {
    expect(
      say(`{% for p in places %}{% for z in p.veg_menu %}{{ z.name }}{% endfor %}{% endfor %}`),
    ).toEqual([]);
  });

  it('so a typo on the element is still caught', () => {
    expect(
      say(`{% for p in places %}{% for z in p.veg_menu %}{{ z.nmae }}{% endfor %}{% endfor %}`),
    ).toEqual(["'nmae' is not a field of Pizza"]);
  });

  it('does not start accepting anything else', () => {
    expect(say(`{% for p in places %}{{ p.nope }}{% endfor %}`)).toEqual([
      "'nope' is not a field of Restaurant",
    ]);
  });
});

// The manager check only looked at iterables rooted in a CONTEXT key, so it
// missed the commonest shape of the mistake: an inner loop over a relation of
// the outer loop's variable.
describe('a manager reached through a loop variable', () => {
  it('is reported', () => {
    const models = parseModels(
      `
from django.db import models
class Tag(models.Model):
    label = models.CharField(max_length=20)
class Post(models.Model):
    tags = models.ManyToManyField(Tag)
`,
      { filePath: 'blog/models.py' },
    );
    if (!models.ok) throw new Error('fixture');
    const graph = createModelGraph(models.value);
    const contextVars = [{ name: 'posts', kind: 'queryset' as const, typeRef: 'Post' }];
    const msgs = diagnoseTemplate({
      templateSource:
        '{% for p in posts %}{% for t in p.tags %}{{ t.label }}{% endfor %}{% endfor %}',
      contextVars,
      graph,
    }).map(d => d.message);
    expect(msgs).toEqual([
      "'p.tags' is a related manager, which cannot be iterated — use 'p.tags.all'",
    ]);
  });

  it('and .all is still accepted', () => {
    const models = parseModels(
      `
from django.db import models
class Tag(models.Model):
    label = models.CharField(max_length=20)
class Post(models.Model):
    tags = models.ManyToManyField(Tag)
`,
      { filePath: 'blog/models.py' },
    );
    if (!models.ok) throw new Error('fixture');
    expect(
      diagnoseTemplate({
        templateSource:
          '{% for p in posts %}{% for t in p.tags.all %}{{ t.label }}{% endfor %}{% endfor %}',
        contextVars: [{ name: 'posts', kind: 'queryset', typeRef: 'Post' }],
        graph: createModelGraph(models.value),
      }),
    ).toEqual([]);
  });
});
