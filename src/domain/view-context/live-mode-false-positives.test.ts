/**
 * Live Mode used to warn about perfectly valid Django. A false warning is
 * worse than none: it teaches people to ignore the squiggles.
 *
 * Every case here produced a warning before. The last block checks the real
 * mistakes still get caught — silencing the noise must not silence the signal.
 */
import { describe, it, expect } from 'vitest';
import { diagnoseTemplate } from './diagnose';
import { createModelGraph } from './model-graph';
import { parseModels } from '$domain/parsers/models';
import type { ContextVar } from '$domain/types/context-var';

const MODELS = `
from django.db import models

class Product(models.Model):
    STATUS = [("d", "Draft"), ("p", "Published")]
    name = models.CharField(max_length=100)
    status = models.CharField(max_length=1, choices=STATUS)

    @property
    def display_name(self):
        return self.name

    def get_absolute_url(self):
        return "/p/"

    def discounted(self, pct):
        return 0

class Ticket(models.Model):
    code = models.UUIDField(primary_key=True)
    label = models.CharField(max_length=10)
`;

const parsed = parseModels(MODELS, { filePath: 'shop/models.py' });
if (!parsed.ok) throw new Error('fixture failed to parse');
const graph = createModelGraph(parsed.value);

const CTX: ContextVar[] = [
  { name: 'product', kind: 'instance', typeRef: 'Product' },
  { name: 'products', kind: 'queryset', typeRef: 'Product' },
  { name: 'ticket', kind: 'instance', typeRef: 'Ticket' },
];

const diagnose = (templateSource: string) =>
  diagnoseTemplate({ templateSource, contextVars: CTX, graph });
const messages = (src: string) => diagnose(src).map(d => d.message);

describe('regions that are not template expressions', () => {
  it('ignores a {% comment %} block', () => {
    expect(messages(`{% comment %}{{ nope }}{% endcomment %}`)).toEqual([]);
  });

  it('ignores a {% comment %} with the optional note argument', () => {
    expect(messages(`{% comment "wip" %}{{ nope }}{% endcomment %}`)).toEqual([]);
  });

  it('ignores a multi-line {% comment %}', () => {
    expect(messages(`{% comment %}\n{{ nope }}\n{% endcomment %}`)).toEqual([]);
  });

  // The one tag whose whole purpose is holding {{ }} Django must not touch.
  it('ignores {% verbatim %}, where Vue and Angular braces live', () => {
    expect(messages(`{% verbatim %}\n{{ vueThing }}\n{% endverbatim %}`)).toEqual([]);
  });

  it('keeps line numbers correct across a stripped block', () => {
    const out = diagnose(`x\n{% comment %}\n{{ a }}\n{% endcomment %}\n{{ nope }}`);
    expect(out).toHaveLength(1);
    expect(out[0]!.line).toBe(5);
  });
});

describe('attributes Django synthesizes', () => {
  it('accepts pk on any model', () => {
    expect(messages(`{{ product.pk }}`)).toEqual([]);
    expect(messages(`{{ ticket.pk }}`)).toEqual([]);
  });

  it('accepts id when the primary key is the implicit one', () => {
    expect(messages(`{{ product.id }}`)).toEqual([]);
  });

  // An explicit primary key REPLACES id — accepting it would hide a real bug.
  it('rejects id on a model keyed by something else', () => {
    expect(messages(`{{ ticket.id }}`)).toHaveLength(1);
  });

  it('accepts get_<field>_display for a field with choices', () => {
    expect(messages(`{{ product.get_status_display }}`)).toEqual([]);
  });

  it('rejects get_<field>_display when the field has no choices', () => {
    expect(messages(`{{ product.get_name_display }}`)).toHaveLength(1);
  });

  it('rejects get_<field>_display when there is no such field', () => {
    expect(messages(`{{ product.get_nope_display }}`)).toHaveLength(1);
  });
});

describe('model methods', () => {
  it('accepts a zero-argument method — Django docs put get_absolute_url on every model', () => {
    expect(messages(`{{ product.get_absolute_url }}`)).toEqual([]);
  });

  it('still accepts a @property', () => {
    expect(messages(`{{ product.display_name }}`)).toEqual([]);
  });

  // A template can only call zero-argument attributes, so this IS a mistake.
  it('rejects a method that takes arguments', () => {
    expect(messages(`{{ product.discounted }}`)).toHaveLength(1);
  });
});

describe('sequence indexing', () => {
  it('accepts a numeric index into a queryset', () => {
    expect(messages(`{{ products.0.name }}`)).toEqual([]);
  });

  it('still validates what comes after the index', () => {
    expect(messages(`{{ products.0.nme }}`)).toHaveLength(1);
  });
});

describe('locals other tags introduce', () => {
  it('accepts a value a custom tag returned with `as`', () => {
    expect(messages(`{% get_thing 1 as result %}{{ result }}`)).toEqual([]);
  });

  it('accepts a {% regroup ... as X %} result', () => {
    expect(messages(`{% regroup products by status as grouped %}{{ grouped }}`)).toEqual([]);
  });

  it('accepts a blocktrans binding', () => {
    expect(messages(`{% blocktrans with n=product.name %}Hi {{ n }}{% endblocktrans %}`)).toEqual(
      [],
    );
  });

  it('accepts a blocktranslate binding', () => {
    expect(
      messages(`{% blocktranslate with n=product.name %}Hi {{ n }}{% endblocktranslate %}`),
    ).toEqual([]);
  });
});

describe('expressions that are not variable names', () => {
  it('ignores a gettext call', () => {
    expect(messages(`{{ _("Hola") }}`)).toEqual([]);
  });

  it('ignores any other call-shaped expression', () => {
    expect(messages(`{{ foo(bar) }}`)).toEqual([]);
  });
});

// The point of all of the above is to keep THESE working.
describe('real mistakes are still reported', () => {
  it('catches a misspelled field', () => {
    const [d] = diagnose(`{{ product.nme }}`);
    expect(d?.code).toBe('invalid-chain');
    expect(d?.suggestion).toBe('name');
  });

  it('catches an undefined variable', () => {
    const [d] = diagnose(`{{ totally_undefined }}`);
    expect(d?.code).toBe('undefined-variable');
  });

  it('reports the real column of the SECOND occurrence too', () => {
    const out = diagnose(`{{ nope }} and {{ nope }}`);
    expect(out.map(d => d.col)).toEqual([4, 19]);
  });
});

// When the view builds its context in a way the reader could not follow, the
// key list is PARTIAL. Reporting the difference as "not defined" accuses the
// user of a mistake this tool made.
describe('an incomplete context surface softens the verdict', () => {
  const opts = (contextIncomplete: boolean) => ({
    templateSource: `{{ mystery }}`,
    contextVars: CTX,
    graph,
    ...(contextIncomplete ? { contextIncomplete: true } : {}),
  });

  it('warns when the surface is fully read', () => {
    const [d] = diagnoseTemplate(opts(false));
    expect(d?.severity).toBe('warning');
    expect(d?.message).toContain('is not defined in the view context');
  });

  it('drops to a note when it is not', () => {
    const [d] = diagnoseTemplate(opts(true));
    expect(d?.severity).toBe('info');
    expect(d?.message).toContain('cannot read');
  });

  it('keeps the code so a quick-fix can still act on it', () => {
    expect(diagnoseTemplate(opts(true))[0]?.code).toBe('undefined-variable');
  });

  it('keeps the did-you-mean suggestion', () => {
    const [d] = diagnoseTemplate({
      templateSource: `{{ produtc }}`,
      contextVars: CTX,
      graph,
      contextIncomplete: true,
    });
    expect(d?.suggestion).toBe('product');
  });

  // A chain error is about a variable we DO have — the surface being partial
  // says nothing about whether that model has the field.
  it('leaves chain errors at warning level', () => {
    const [d] = diagnoseTemplate({
      templateSource: `{{ product.nme }}`,
      contextVars: CTX,
      graph,
      contextIncomplete: true,
    });
    expect(d?.severity).toBe('warning');
    expect(d?.code).toBe('invalid-chain');
  });
});

// The `{% for %}` tag has more grammar than a bare dotted name. When the
// iterable regex failed to match, the loop variable was not registered as a
// local AT ALL, so every use of it in the body read as an undefined variable —
// a wall of warnings triggered by ordinary Django.
describe('the full {% for %} grammar', () => {
  it('accepts a filtered iterable', () => {
    expect(messages('{% for p in products|slice:":3" %}{{ p.name }}{% endfor %}')).toEqual([]);
  });

  it('accepts a dictsort filter', () => {
    expect(messages('{% for p in products|dictsort:"name" %}{{ p.name }}{% endfor %}')).toEqual([]);
  });

  it('accepts the reversed modifier', () => {
    expect(messages('{% for p in products reversed %}{{ p.name }}{% endfor %}')).toEqual([]);
  });

  it('accepts a filter and the modifier together', () => {
    expect(messages('{% for p in products|slice:":3" reversed %}{{ p.name }}{% endfor %}')).toEqual(
      [],
    );
  });

  it('still types the loop variable through an order-preserving filter', () => {
    expect(messages('{% for p in products|slice:":3" %}{{ p.nmae }}{% endfor %}')).toEqual([
      "'nmae' is not a field of Product",
    ]);
  });

  // `{% for c in word|make_list %}` iterates characters, not whatever `word`
  // was. Registering the name without a type is the honest answer: no false
  // "undefined", and no invented fields either.
  it('registers but does not type a loop over an element-changing filter', () => {
    expect(messages('{% for c in products|make_list %}{{ c.anything }}{% endfor %}')).toEqual([]);
  });
});

// The parser read one line at a time, so a tag wrapped across lines matched
// nothing and Live Mode reported no problem with it — a MISSED typo, which is
// the one thing the feature exists to catch.
describe('tags wrapped across lines', () => {
  it('catches a typo in a multi-line {% if %}', () => {
    expect(messages('{% if product.nmae\n   and products %}x{% endif %}')).toEqual([
      "'nmae' is not a field of Product",
    ]);
  });

  // Django's own lexer is `re.compile(r"({%.*?%}|{{.*?}}|{#.*?#})", re.DOTALL)`
  // — a variable tag may wrap too, and long filter chains do.
  it('catches a typo in a multi-line {{ }}', () => {
    expect(messages('{{ product.nmae\n   |default:"x" }}')).toEqual([
      "'nmae' is not a field of Product",
    ]);
  });

  it('catches a typo in a multi-line {% with %}', () => {
    expect(messages('{% with n=product.nmae\n        m=1 %}{% endwith %}')).toEqual([
      "'nmae' is not a field of Product",
    ]);
  });

  it('reports it on the line it is actually written on', () => {
    const [d] = diagnose('<p>ok</p>\n{% if products\n   and product.nmae %}x{% endif %}');
    expect(d?.line).toBe(3);
  });

  it('accepts a correct multi-line tag', () => {
    expect(messages('{% if product.name\n   and products %}x{% endif %}')).toEqual([]);
  });
});

// A half-written comment is a normal editing state. While `{% endcomment %}`
// is missing, everything below it would otherwise be read as live template
// code and reported undefined — a screenful of warnings about text the author
// has already decided is not code.
describe('an unterminated region', () => {
  it('swallows the rest of the file after {% comment %}', () => {
    expect(messages('{% comment %}\n{{ ghost.attr }}\n{{ another_ghost }}')).toEqual([]);
  });

  // NOT the same for `{#`. Checked against Django's own tag_re: an unterminated
  // `{#` produces no token at all, so the text stays literal and everything
  // after it is still evaluated. Blanking there would stop checking code that
  // runs. `{% comment %}` differs because Django DOES tokenize the opener and
  // then raises "Unclosed tag" — the page is already dead.
  it('does NOT swallow anything after an unterminated {#', () => {
    expect(messages('{# note\n{{ product.nmae }}')).toEqual(["'nmae' is not a field of Product"]);
  });

  it('still reports what came BEFORE the opener', () => {
    expect(messages('{{ product.nmae }}\n{% comment %}\n{{ ghost }}')).toEqual([
      "'nmae' is not a field of Product",
    ]);
  });
});

// Found by moving these readers onto the shared lexer: they used to scan the
// raw source, so a loop or binding inside a region Django never evaluates
// still registered its names as real template locals. The cost is a MISSED
// error — `{{ ghost }}` after a commented-out loop read as defined — and a
// completion list offering variables from a Vue block.
describe('locals declared where Django does not look', () => {
  it('a {% for %} inside {% comment %} binds nothing', () => {
    expect(
      messages('{% comment %}{% for ghost in products %}{% endfor %}{% endcomment %}{{ ghost }}'),
    ).toEqual(["'ghost' is not defined in the view context"]);
  });

  it('a {% for %} inside {% verbatim %} binds nothing', () => {
    expect(
      messages('{% verbatim %}{% for vueitem in xs %}{% endfor %}{% endverbatim %}{{ vueitem }}'),
    ).toEqual(["'vueitem' is not defined in the view context"]);
  });

  it('a {% with %} inside {% comment %} binds nothing', () => {
    expect(
      messages('{% comment %}{% with phantom=1 %}{% endwith %}{% endcomment %}{{ phantom }}'),
    ).toEqual(["'phantom' is not defined in the view context"]);
  });

  it('and the same tags outside one still bind', () => {
    expect(messages('{% for p in products %}{{ p.name }}{% endfor %}')).toEqual([]);
  });
});
