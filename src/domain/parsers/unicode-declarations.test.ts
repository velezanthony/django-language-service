/**
 * A model, a field, a form and a method declared with a non-ASCII name.
 *
 * The Unicode round covered the four readers that resolve a template's context
 * — `contextVariableNames`, `extractHelperBodies`, `inferContextTypes`,
 * `parseHelpers`. It did not touch the readers for the DECLARATIONS, which are
 * still `^class\s+(\w+)` and `^(\w+)\s*=\s*models\.`.
 *
 * `\w` is `[A-Za-z0-9_]`. Python 3 identifiers are XID_Start/XID_Continue, so
 * `class Artículo(models.Model)` is an ordinary Django model in an ordinary
 * Spanish project — and the reader does not misread it, it fails to match at
 * all. The class is never detected, so the model is absent from the project:
 * no diagram node, no hover, no field completion, no relation. Everything
 * downstream is correct about a model that, as far as it can tell, was never
 * written.
 *
 * Any project not written in English is a project this extension is partly
 * blind to, and nothing anywhere says so.
 */
import { describe, it, expect } from 'vitest';
import { parseModels } from './models';
import { parseForms } from './forms';

/** Names a real Django project in one of these languages would carry. */
const CLASS_NAMES = ['Artículo', 'Categoría', 'Ação', 'Κατάλογος', '記事'] as const;
const FIELD_NAMES = ['título', 'días', 'ação', 'κατάλογος', '日本語'] as const;

function models(source: string) {
  const r = parseModels(source, { filePath: 'tienda/models.py' });
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error('parse failed');
  return r.value;
}

describe('a model class named in the project language', () => {
  it.each(CLASS_NAMES)('detects class %s', name => {
    const parsed = models(
      [`class ${name}(models.Model):`, '    name = models.CharField()'].join('\n'),
    );
    expect(parsed.map(m => m.name)).toContain(name);
  });

  it('still detects an ASCII class', () => {
    expect(
      models('class Article(models.Model):\n    name = models.CharField()').map(m => m.name),
    ).toEqual(['Article']);
  });
});

describe('a field named in the project language', () => {
  it.each(FIELD_NAMES)('reads the field %s', name => {
    const parsed = models(
      ['class Post(models.Model):', `    ${name} = models.CharField(max_length=10)`].join('\n'),
    );
    expect(parsed[0]?.fields.map(f => f.name)).toContain(name);
  });

  it('reads a relation whose field is named in the project language', () => {
    const parsed = models(
      [
        'class Post(models.Model):',
        "    categoría = models.ForeignKey('shop.Category', on_delete=models.CASCADE)",
      ].join('\n'),
    );
    expect(parsed[0]?.relations.map(r => r.fieldName)).toContain('categoría');
  });

  it('reads a zero-argument method named in the project language', () => {
    const parsed = models(
      ['class Post(models.Model):', '    def título_corto(self):', "        return ''"].join('\n'),
    );
    expect(parsed[0]?.methods ?? []).toContain('título_corto');
  });
});

describe('a form declared in the project language', () => {
  it('detects the form class and its field', () => {
    const r = parseForms(
      ['class ArtículoForm(forms.Form):', '    título = forms.CharField()'].join('\n'),
      { filePath: 'tienda/forms.py' },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.map(f => f.name)).toContain('ArtículoForm');
    expect(r.value[0]?.fields.map(f => f.name)).toContain('título');
  });
});

// A reader that accepts Unicode must still refuse what Python refuses.
describe('and what is still not a declaration', () => {
  it('does not take a class name starting with a digit', () => {
    expect(
      models('class 2Fast(models.Model):\n    x = models.CharField()').map(m => m.name),
    ).not.toContain('2Fast');
  });
});
