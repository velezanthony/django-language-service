/**
 * The template side of the same property: a DTL name is a Python identifier.
 *
 * A custom tag, a custom filter and a `{% load %}` library are all Python
 * names — the tag is the registered function, the library is the module under
 * `templatetags/`. A `{% block %}` name is a bare token Django never resolves,
 * so it is whatever the author typed, and an author writing a site in Spanish
 * types `{% block título %}`.
 *
 * Every one of these was read with `\w`. The worst is `tagNameOf` in the lexer:
 * it is THE grammar reader for the whole extension, and it answers `''` for a
 * tag it cannot spell — so the tag has no name anywhere downstream. Not an
 * unknown tag, a nameless one.
 *
 * This is the third place the same property has had to be asserted (see
 * `unicode-identifiers.test.ts` for the context readers and
 * `parsers/unicode-declarations.test.ts` for the declarations). It is written
 * here as one file over the CLASS for the same reason as those.
 */
import { describe, it, expect } from 'vitest';
import { liveTokens } from './parsers/_shared/dtl-lexer';
import { BLOCK_NAME_RE, LOAD_TAG_RE } from './parsers/_shared/html-tokens';
import { parseTemplate } from './parsers/template';

const first = (re: RegExp, text: string) => new RegExp(re.source, re.flags).exec(text);

describe('the lexer names a tag written in any language', () => {
  it.each(['categoría_lista', 'ação', 'κατάλογος', '日本語_tag'])('names {%% %s %%}', name => {
    const [token] = liveTokens(`{% ${name} 1 %}`);
    expect(token?.name).toBe(name);
  });

  it('still names an ASCII tag', () => {
    expect(liveTokens('{% include "a.html" %}')[0]?.name).toBe('include');
  });

  it('leaves a variable token unnamed, as before', () => {
    expect(liveTokens('{{ título }}')[0]?.name).toBe('');
  });
});

describe('block names', () => {
  it.each(['título', 'contenido', 'ação', '本文'])('reads {%% block %s %%}', name => {
    expect(first(BLOCK_NAME_RE, `{% block ${name} %}`)?.[1]).toBe(name);
  });

  it('reaches the parsed template', () => {
    const r = parseTemplate('{% block título %}x{% endblock %}', {
      filePath: 'shop/templates/shop/p.html',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value[0]?.blocks).toContain('título');
  });

  it('still reads an ASCII block', () => {
    expect(first(BLOCK_NAME_RE, '{% block content %}')?.[1]).toBe('content');
  });
});

describe('load libraries', () => {
  it.each(['tienda_tags', 'índice_tags', 'ação_tags'])('reads {%% load %s %%}', name => {
    expect(first(LOAD_TAG_RE, `{% load ${name} %}`)?.[1]).toBe(name);
  });

  it('still reads an ASCII library', () => {
    expect(first(LOAD_TAG_RE, '{% load shop_tags %}')?.[1]).toBe('shop_tags');
  });
});
