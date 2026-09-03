/**
 * A template local named in the project's own language.
 *
 * `{% for artículo in artículos %}` is ordinary Django — the for tag takes a
 * target name and Django resolves it against the context dict, which accepts
 * any string as a key. This module reads those names with `\w`, so `artículo`
 * matched as `art` and then the pattern needed `\s+in` and found `í`: no match
 * at all, and the loop variable was never registered as a template local.
 *
 * The consequence is the worst kind. An unregistered local is an UNDEFINED
 * one, so `{{ artículo.nombre }}` inside that loop is reported as a variable
 * the view never provided — a red squiggle on correct code, in every template
 * of a project not written in English.
 *
 * Three earlier rounds closed this property for the readers of Python source,
 * the declarations and the lexer. This is the reader of TEMPLATE names, and it
 * was missed: found by a documentation audit that went looking for a claim
 * about `\w` and checked whether it was still true.
 */
import { describe, it, expect } from 'vitest';
import { forLoops, collectTemplateLocalNames } from './template-scope';

/** Loop names a real Django project in any of these languages would carry. */
const NAMES = ['artículo', 'días', 'ação', 'κατάλογος', '記事'] as const;

describe('a {% for %} target named in the project language', () => {
  it.each(NAMES)('registers %s as a loop variable', name => {
    const source = `{% for ${name} in lista %}{{ ${name}.nombre }}{% endfor %}`;
    expect(
      forLoops(source)
        .map(l => l.iterators)
        .flat(),
    ).toContain(name);
  });

  it('still registers an ASCII loop variable', () => {
    const source = '{% for post in posts %}{{ post.title }}{% endfor %}';
    expect(
      forLoops(source)
        .map(l => l.iterators)
        .flat(),
    ).toContain('post');
  });

  it('registers both names of an unpacking loop', () => {
    const source = '{% for clave, artículo in items %}{{ artículo }}{% endfor %}';
    const names = forLoops(source)
      .map(l => l.iterators)
      .flat();
    expect(names).toContain('clave');
    expect(names).toContain('artículo');
  });
});

describe('the names a template offers its own diagnostics', () => {
  it.each(NAMES)('includes the loop variable %s', name => {
    const source = `{% for ${name} in lista %}{{ ${name} }}{% endfor %}`;
    expect(collectTemplateLocalNames(source)).toContain(name);
  });

  it('includes a name bound by `as`', () => {
    const source = '{% url "detail" as enlace_artículo %}{{ enlace_artículo }}';
    expect(collectTemplateLocalNames(source)).toContain('enlace_artículo');
  });

  it('still includes an ASCII name bound by `as`', () => {
    const source = '{% url "detail" as link %}{{ link }}';
    expect(collectTemplateLocalNames(source)).toContain('link');
  });
});
