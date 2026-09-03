/**
 * A Python identifier is Unicode. Everywhere this project reads one.
 *
 * Python 3 identifiers are XID_Start followed by XID_Continue, so `índice`,
 * `日本語` and `Artículo` are ordinary names. JavaScript's `\w` is
 * `[A-Za-z0-9_]`, so every reader written with `\w` silently drops them — not
 * "reads them wrong", drops them: the block is never recognised, so the file
 * parses to nothing at all.
 *
 * `parseViews` was fixed for this and `PY_IDENT` was exported for the purpose.
 * These four kept `\w`, which is precisely the shape of defect this repository
 * has now watched come back three times: the case gets fixed, the class does
 * not. So this file is written over the CLASS — one property, asserted against
 * every reader that has to hold it — rather than one test per module.
 */
import { describe, it, expect } from 'vitest';
import { contextVariableNames } from './view-context/context-keys';
import { extractHelperBodies } from './view-context/helper-keys';
import { inferContextTypes } from './view-context/context-inference';
import { parseHelpers } from './parsers/helpers';

/** Names a Django project in any of these languages could really contain. */
const NAMES = ['índice', 'días', 'Artículo', 'ação', 'κατάλογος', '日本語', 'naïve'] as const;

describe('context dict variables under any name', () => {
  const view = (dict: string) =>
    [
      'def probe(request):',
      `    ${dict} = {}`,
      `    ${dict}['ok'] = 1`,
      `    return render(request, 't.html', ${dict})`,
    ].join('\n');

  it.each(NAMES)('recognises a context dict called %s', name => {
    const source = view(name);
    expect(contextVariableNames(source, source.split('\n'))).toContain(name);
  });

  it('still recognises the conventional name', () => {
    const source = view('context');
    expect(contextVariableNames(source, source.split('\n'))).toContain('context');
  });
});

describe('helper functions under any name', () => {
  const helper = (name: string) =>
    [`def ${name}(request):`, "    return {'total': 1}", ''].join('\n');

  it.each(NAMES)('finds a helper called %s', name => {
    expect([...extractHelperBodies(helper(name)).keys()]).toContain(name);
  });

  it('still finds an ASCII helper', () => {
    expect([...extractHelperBodies(helper('build_context')).keys()]).toContain('build_context');
  });
});

describe('inferred context keys under any name', () => {
  const view = (name: string) =>
    [
      'def probe(request):',
      `    ${name} = Article.objects.all()`,
      `    context = {'rows': ${name}}`,
      "    return render(request, 't.html', context)",
    ].join('\n');

  it.each(NAMES)('follows a local called %s to its queryset', name => {
    expect(inferContextTypes(view(name)).get('rows')).toEqual({
      model: 'Article',
      kind: 'queryset',
    });
  });

  it('still follows an ASCII local', () => {
    expect(inferContextTypes(view('rows_qs')).get('rows')).toEqual({
      model: 'Article',
      kind: 'queryset',
    });
  });
});

describe('template tag libraries under any name', () => {
  const library = (name: string) =>
    [
      'from django import template',
      'register = template.Library()',
      '',
      '@register.simple_tag',
      `def ${name}(value):`,
      '    return value',
      '',
    ].join('\n');

  it.each(NAMES)('registers a tag called %s', name => {
    const result = parseHelpers(library(name), { filePath: 'shop/templatetags/shop_tags.py' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map(h => h.name)).toContain(name);
  });

  it('still registers an ASCII tag', () => {
    const result = parseHelpers(library('money'), { filePath: 'shop/templatetags/shop_tags.py' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map(h => h.name)).toContain('money');
  });
});

// A reader that accepts Unicode must still refuse what Python refuses.
describe('and what is still not an identifier', () => {
  it('does not take a name that starts with a digit', () => {
    const source = ['def probe(request):', '    2fast = {}', "    2fast['x'] = 1"].join('\n');
    expect(contextVariableNames(source, source.split('\n'))).not.toContain('2fast');
  });

  it('does not take a name containing a hyphen', () => {
    const source = 'def probe(request):\n    no-go = {}';
    expect(contextVariableNames(source, source.split('\n'))).not.toContain('no-go');
  });
});
