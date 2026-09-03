import { describe, it, expect } from 'vitest';
import { findUrlReferences, findUnknownUrlReferences } from './url-references';

describe('findUrlReferences', () => {
  it('captures a single-quoted name with correct position', () => {
    const refs = findUrlReferences(`{% url 'home' %}`);
    expect(refs).toEqual([{ name: 'home', line: 0, startCol: 8, length: 4 }]);
  });

  it('captures a double-quoted name', () => {
    const refs = findUrlReferences(`{% url "home" %}`);
    expect(refs[0]?.name).toBe('home');
  });

  it('captures a namespaced name verbatim', () => {
    const refs = findUrlReferences(`{% url 'blog:detail' pk=1 %}`);
    expect(refs[0]?.name).toBe('blog:detail');
    expect(refs[0]?.length).toBe('blog:detail'.length);
  });

  it('skips dynamic (unquoted) references — cannot validate at rest', () => {
    expect(findUrlReferences(`{% url some_var %}`)).toEqual([]);
  });

  it('tolerates whitespace-control tag modifiers', () => {
    const refs = findUrlReferences(`{%- url 'home' -%}`);
    expect(refs[0]?.name).toBe('home');
  });

  it('reports the line index and column on indented multi-line input', () => {
    const src = `<div>\n    {% url 'shop:cart' %}\n</div>`;
    const refs = findUrlReferences(src);
    expect(refs).toEqual([{ name: 'shop:cart', line: 1, startCol: 12, length: 9 }]);
  });

  it('captures multiple references on one line', () => {
    const refs = findUrlReferences(`{% url 'a' %} {% url 'b' %}`);
    expect(refs.map(r => r.name)).toEqual(['a', 'b']);
  });

  it('returns [] when there are no url tags', () => {
    expect(findUrlReferences(`<p>no tags here {{ x }}</p>`)).toEqual([]);
  });
});

describe('findUnknownUrlReferences', () => {
  it('does not flag a known name', () => {
    expect(findUnknownUrlReferences(`{% url 'home' %}`, new Set(['home']))).toEqual([]);
  });

  it('flags an unknown name', () => {
    const unknown = findUnknownUrlReferences(`{% url 'missing' %}`, new Set(['home']));
    expect(unknown.map(r => r.name)).toEqual(['missing']);
  });

  it('flags only the unknown ones in a mix', () => {
    const src = `{% url 'home' %}\n{% url 'ghost' %}`;
    const unknown = findUnknownUrlReferences(src, new Set(['home', 'blog:detail']));
    expect(unknown.map(r => r.name)).toEqual(['ghost']);
  });

  it('flags nothing when the index is empty (scan incomplete → avoid false positives)', () => {
    expect(findUnknownUrlReferences(`{% url 'home' %}`, new Set())).toEqual([]);
  });

  it('respects the namespace — bare name is unknown when only the namespaced one is indexed', () => {
    const unknown = findUnknownUrlReferences(`{% url 'detail' %}`, new Set(['blog:detail']));
    expect(unknown.map(r => r.name)).toEqual(['detail']);
  });
});

// Found by moving this reader onto the shared lexer. It used to scan raw lines,
// which meant two things its own comment got wrong.
describe('findUrlReferences — regions and wrapping', () => {
  it('ignores a url tag inside {% comment %}', () => {
    expect(findUrlReferences(`{% comment %}{% url 'ghost' %}{% endcomment %}`)).toEqual([]);
  });

  it('ignores one inside {% verbatim %}', () => {
    expect(findUrlReferences(`{% verbatim %}{% url 'vue' %}{% endverbatim %}`)).toEqual([]);
  });

  it('and so stops calling a commented-out name unknown', () => {
    expect(
      findUnknownUrlReferences(`{% comment %}{% url 'ghost' %}{% endcomment %}`, new Set(['home'])),
    ).toEqual([]);
  });

  // The old comment claimed multi-line support; the line split made that false.
  it('finds a name in a tag wrapped across lines', () => {
    const refs = findUrlReferences(`{% url\n   'shop:cart' %}`);
    expect(refs.map(r => r.name)).toEqual(['shop:cart']);
  });

  it('points at the name on the line it is written on', () => {
    const src = `<p>x</p>\n{% url 'home' %}`;
    const [ref] = findUrlReferences(src);
    expect(ref?.line).toBe(1);
    expect(src.split('\n')[1]!.slice(ref!.startCol, ref!.startCol + ref!.length)).toBe('home');
  });
});
