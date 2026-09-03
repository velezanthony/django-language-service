/**
 * Text Django does not execute is not a reference.
 *
 * `parseTemplate` ran its patterns over the RAW source while its two siblings —
 * `url-references.ts` and `template-variables.ts` — already read the lexer's
 * live tokens. So an `{% include %}` inside `{% comment %}` still created an
 * edge in the template graph, a `{% url %}` inside `{% verbatim %}` counted as
 * a real reference, and commenting a block out was not enough to stop either:
 * the target kept its "used" status and an unresolvable name kept its warning.
 */
import { describe, it, expect } from 'vitest';
import { parseTemplate } from './template';

const parse = (source: string) => {
  const result = parseTemplate(source, { filePath: 'shop/templates/shop/t.html' });
  if (!result.ok) throw new Error('parse failed');
  return result.value[0]!;
};

const targets = (source: string) => parse(source).includes.map(i => i.target);

describe('inert regions hold no references', () => {
  it('ignores an include inside {% comment %}', () => {
    expect(targets('{% comment %}{% include "dead.html" %}{% endcomment %}')).toEqual([]);
  });

  it('ignores an include inside {% verbatim %}', () => {
    expect(targets('{% verbatim %}{% include "dead.html" %}{% endverbatim %}')).toEqual([]);
  });

  it('ignores a url reference inside {% comment %}', () => {
    expect(targets('{% comment %}{% url "gone:index" %}{% endcomment %}')).toEqual([]);
  });

  it('ignores a static reference inside {% verbatim %}', () => {
    expect(targets('{% verbatim %}{% static "css/dead.css" %}{% endverbatim %}')).toEqual([]);
  });

  it('ignores an include inside a {# … #} comment', () => {
    expect(targets('{# {% include "dead.html" %} #}')).toEqual([]);
  });

  it('does not take a parent from a commented-out extends', () => {
    expect(parse('{% comment %}{% extends "dead.html" %}{% endcomment %}').extends).toBeUndefined();
  });

  it('does not register a block declared inside a comment', () => {
    expect(parse('{% comment %}{% block ghost %}{% endblock %}{% endcomment %}').blocks).toEqual(
      [],
    );
  });

  it('keeps the live references that sit beside the inert ones', () => {
    const source = [
      '{% extends "base.html" %}',
      '{% comment %}{% include "dead.html" %}{% endcomment %}',
      '{% include "live.html" %}',
      '{% verbatim %}{% url "gone:index" %}{% endverbatim %}',
      '{% url "shop:index" %}',
      '{% block content %}{% endblock %}',
    ].join('\n');
    const template = parse(source);

    expect(template.extends).toBe('base.html');
    expect(template.blocks).toEqual(['content']);
    expect(template.includes.map(i => i.target)).toEqual(['live.html', '__url__:shop:index']);
  });

  // A script ELEMENT is not an inert region for this reader. Blanking it whole
  // — attributes included — lost `<script src="{% static … %}">`, which Django
  // resolves like any other static reference. Braces in a script body are a
  // problem for a JavaScript parser, not for a reader counting template refs.
  it('keeps a static reference written in a script tag attribute', () => {
    expect(targets('<script src="{% static \'js/app.js\' %}"></script>')).toEqual([
      '__static__:js/app.js',
    ]);
  });

  it('keeps an include written inside a script body', () => {
    expect(targets('<script>{% include "partial.js" %}</script>')).toEqual(['partial.js']);
  });

  it('reports the live reference on its own line', () => {
    const source =
      '{% comment %}\n{% include "dead.html" %}\n{% endcomment %}\n{% include "live.html" %}';
    const [include] = parse(source).includes;
    expect(include?.target).toBe('live.html');
    expect(include?.line).toBe(4);
  });
});
