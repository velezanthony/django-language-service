import { describe, it, expect } from 'vitest';
import { measureScaling } from '../../test-support/scaling';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseForms } from './forms';

const f = (rel: string) => readFileSync(join(__dirname, '__fixtures__', rel), 'utf8');

// ── Happy path ────────────────────────────────────────────────────────────────

describe('parseForms — plain forms fixture', () => {
  const src = f('forms/plain.py');
  const result = parseForms(src, { filePath: 'app/forms.py' });

  it('returns ok:true', () => {
    expect(result.ok).toBe(true);
  });

  it('extracts both plain Form classes', () => {
    if (!result.ok) throw new Error('not ok');
    expect(result.value).toHaveLength(2);
  });

  it('ContactForm has correct name, kind, filePath, line', () => {
    if (!result.ok) throw new Error('not ok');
    const form = result.value[0]!;
    expect(form.name).toBe('ContactForm');
    expect(form.kind).toBe('form');
    expect(form.filePath).toBe('app/forms.py');
    expect(form.line).toBe(6);
  });

  it('ContactForm has no modelRef (plain Form)', () => {
    if (!result.ok) throw new Error('not ok');
    expect(result.value[0]!.modelRef).toBeUndefined();
  });

  it('SearchForm is extracted correctly', () => {
    if (!result.ok) throw new Error('not ok');
    const form = result.value[1]!;
    expect(form.name).toBe('SearchForm');
    expect(form.modelRef).toBeUndefined();
  });
});

describe('parseForms — ModelForm fixture (spec PARSEFORMS)', () => {
  const src = f('forms/modelform.py');
  const result = parseForms(src, { filePath: 'shop/forms.py' });

  it('returns ok:true', () => {
    expect(result.ok).toBe(true);
  });

  it('extracts 3 ModelForm classes', () => {
    if (!result.ok) throw new Error('not ok');
    expect(result.value).toHaveLength(3);
  });

  it('ProductForm — name and modelRef extracted', () => {
    if (!result.ok) throw new Error('not ok');
    const form = result.value[0]!;
    expect(form.name).toBe('ProductForm');
    expect(form.modelRef).toBe('Product');
  });

  it('ReviewForm — modelRef is Review', () => {
    if (!result.ok) throw new Error('not ok');
    const form = result.value[1]!;
    expect(form.name).toBe('ReviewForm');
    expect(form.modelRef).toBe('Review');
  });

  it('AllFieldsForm — modelRef is Product (__all__ fields)', () => {
    if (!result.ok) throw new Error('not ok');
    const form = result.value[2]!;
    expect(form.name).toBe('AllFieldsForm');
    expect(form.modelRef).toBe('Product');
  });

  it('all forms have kind: form', () => {
    if (!result.ok) throw new Error('not ok');
    for (const form of result.value) {
      expect(form.kind).toBe('form');
    }
  });

  it('filePath propagated from opts', () => {
    if (!result.ok) throw new Error('not ok');
    for (const form of result.value) {
      expect(form.filePath).toBe('shop/forms.py');
    }
  });
});

// ── Declared fields + Meta.fields (Fase-6 part 2: form field completion) ─────

describe('parseForms — declared fields', () => {
  const src = f('forms/plain.py');
  const result = parseForms(src, { filePath: 'app/forms.py' });

  it('ContactForm — declared fields with types (multi-line defs included)', () => {
    if (!result.ok) throw new Error('not ok');
    expect(result.value[0]!.fields).toEqual([
      { name: 'email', fieldType: 'EmailField' },
      { name: 'subject', fieldType: 'CharField' },
      { name: 'message', fieldType: 'CharField' },
    ]);
  });

  it('SearchForm — query and category fields', () => {
    if (!result.ok) throw new Error('not ok');
    expect(result.value[1]!.fields.map(fl => fl.name)).toEqual(['query', 'category']);
  });

  it('plain forms have no metaFields', () => {
    if (!result.ok) throw new Error('not ok');
    for (const form of result.value) {
      expect(form.metaFields).toBeUndefined();
    }
  });
});

describe('parseForms — Meta.fields on ModelForms', () => {
  const src = f('forms/modelform.py');
  const result = parseForms(src, { filePath: 'shop/forms.py' });

  it('ProductForm — metaFields list, no declared fields', () => {
    if (!result.ok) throw new Error('not ok');
    const form = result.value[0]!;
    expect(form.fields).toEqual([]);
    expect(form.metaFields).toEqual(['name', 'price', 'description', 'category']);
  });

  it('ReviewForm — mixes declared fields with metaFields', () => {
    if (!result.ok) throw new Error('not ok');
    const form = result.value[1]!;
    expect(form.fields).toEqual([
      { name: 'rating', fieldType: 'IntegerField' },
      { name: 'body', fieldType: 'CharField' },
    ]);
    expect(form.metaFields).toEqual(['rating', 'body']);
  });

  it("AllFieldsForm — fields = '__all__' captured as ['__all__']", () => {
    if (!result.ok) throw new Error('not ok');
    expect(result.value[2]!.metaFields).toEqual(['__all__']);
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe('parseForms — empty input (spec EMPTY-INPUT-INVARIANCE)', () => {
  it('returns ok:true with empty array for ""', () => {
    const result = parseForms('');
    expect(result).toEqual({ ok: true, value: [] });
  });

  it('returns ok:true with empty array for whitespace-only', () => {
    const result = parseForms('   \n\t  ');
    expect(result).toEqual({ ok: true, value: [] });
  });
});

describe('parseForms — malformed input (spec MALFORMED-INPUT-RESILIENCE)', () => {
  it('returns ok:true on file with no form classes', () => {
    const src = `
from django.views import View

class MyView(View):
    def get(self, request):
        pass
`;
    const result = parseForms(src);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('recovers valid form before malformed class definition', () => {
    const src = `
class GoodForm(forms.Form):
    name = forms.CharField()

class |||MalformedClass(
    pass
`;
    const result = parseForms(src);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // At minimum GoodForm is captured
      expect(result.value.length).toBeGreaterThanOrEqual(1);
      expect(result.value[0]!.name).toBe('GoodForm');
    }
  });

  it('handles form class without Meta gracefully', () => {
    const src = `class SimpleForm(forms.ModelForm):
    name = forms.CharField()
`;
    const result = parseForms(src);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]!.name).toBe('SimpleForm');
      expect(result.value[0]!.modelRef).toBeUndefined();
    }
  });
});

// ── Indentation tolerance ─────────────────────────────────────────────────────

describe('parseForms — indentation tolerance', () => {
  it('parses a form indented with 2 spaces (declared fields + Meta)', () => {
    const src = [
      'from django import forms',
      '',
      'class NoteForm(forms.ModelForm):',
      '  extra = forms.CharField()',
      '',
      '  class Meta:',
      '    model = Note',
      '    fields = ["title", "body"]',
      '',
    ].join('\n');

    const result = parseForms(src, { filePath: 'notes/forms.py' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toHaveLength(1);
    const form = result.value[0]!;
    expect(form.fields).toEqual([{ name: 'extra', fieldType: 'CharField' }]);
    expect(form.modelRef).toBe('Note');
    expect(form.metaFields).toEqual(['title', 'body']);
  });

  it('parses a form indented with tabs (declared fields + Meta)', () => {
    const src = [
      'class TagForm(forms.ModelForm):',
      '\tlabel = forms.CharField()',
      '',
      '\tclass Meta:',
      '\t\tmodel = Tag',
      "\t\tfields = '__all__'",
      '',
    ].join('\n');

    const result = parseForms(src, { filePath: 'tags/forms.py' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toHaveLength(1);
    const form = result.value[0]!;
    expect(form.fields).toEqual([{ name: 'label', fieldType: 'CharField' }]);
    expect(form.modelRef).toBe('Tag');
    expect(form.metaFields).toEqual(['__all__']);
  });

  it('parses a file mixing 4-space and 2-space forms', () => {
    const src = [
      'class WideForm(forms.Form):',
      '    name = forms.CharField()',
      '',
      'class NarrowForm(forms.Form):',
      '  slug = forms.SlugField()',
      '',
    ].join('\n');

    const result = parseForms(src, { filePath: 'app/forms.py' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toHaveLength(2);
    expect(result.value[0]!.fields.map(fl => fl.name)).toEqual(['name']);
    expect(result.value[1]!.fields.map(fl => fl.name)).toEqual(['slug']);
  });
});

// ── Performance ───────────────────────────────────────────────────────────────

describe('parseForms — performance (spec PERFORMANCE)', () => {
  it('stays linear as the file grows', () => {
    const { ratio } = measureScaling({
      prepare: size =>
        Array.from(
          { length: size },
          (_, i) => `class GeneratedForm${i}(forms.Form):\n    name = forms.CharField()\n\n`,
        ).join(''),
      run: src => {
        parseForms(src);
      },
    });
    expect(ratio).toBeLessThan(2.5);
  });
});
