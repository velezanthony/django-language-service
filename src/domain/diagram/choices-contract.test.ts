import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseModels } from '$domain/parsers/models';
import { buildDiagramPayload } from './diagram-serializer';

// End-to-end contract for `choices`, from Python source to the payload the
// webview receives. The unit tests on either side both passed while the tooltip
// showed "choices 0" for every field, because each side had its own FieldLine
// declaration and nothing compared them. This test spans the seam.
//
// ChoicesPopup.svelte reads `choices.kind` and `choices.values` — anything that
// does not carry a kind renders as 0.

const BLOG_MODELS = join(__dirname, '../../test-django-project/apps/blog/models.py');

function postFields() {
  const source = readFileSync(BLOG_MODELS, 'utf8');
  const parsed = parseModels(source, { filePath: 'apps/blog/models.py' });
  if (!parsed.ok) throw new Error('blog fixture failed to parse');

  const payload = buildDiagramPayload(parsed.value, [], []);
  const post = payload.tooltipData.find(b => b.name === 'Post');
  if (!post) throw new Error('Post missing from payload');
  return post.fields;
}

describe('choices survive the trip to the webview payload', () => {
  const field = (name: string) => {
    const f = postFields().find(x => x.name === name);
    if (!f) throw new Error(`field ${name} missing`);
    return f;
  };

  it('tags an inline literal as inline and keeps every value', () => {
    const c = field('featured_format').choices;
    expect(c?.kind).toBe('inline');
    expect(c && c.kind === 'inline' ? c.values.map(v => v.value) : []).toEqual([
      'standard',
      'gallery',
      'video',
    ]);
  });

  it('tags a resolved TextChoices reference and names the symbol', () => {
    const c = field('status').choices;
    expect(c?.kind).toBe('resolved');
    if (c?.kind !== 'resolved') throw new Error('expected resolved');
    expect(c.symbolName).toBe('PostStatus');
    expect(c.values.length).toBeGreaterThan(0);
  });

  it('resolves a bare IntegerChoices reference too', () => {
    const c = field('visibility').choices;
    expect(c?.kind).toBe('resolved');
    if (c?.kind !== 'resolved') throw new Error('expected resolved');
    expect(c.symbolName).toBe('PostVisibility');
    expect(c.values.length).toBeGreaterThan(0);
  });

  // The bug as the user saw it: every chip read 0.
  it('never hands the webview a shape that counts as zero', () => {
    for (const f of postFields()) {
      if (!f.choices) continue;
      const count = f.choices.kind === 'unresolved' ? 0 : f.choices.values.length;
      expect(count, `${f.name} rendered an empty chip`).toBeGreaterThan(0);
    }
  });

  it('leaves fields without choices alone', () => {
    expect(field('title').choices).toBeUndefined();
    expect(field('views').choices).toBeUndefined();
  });
});

describe('an unresolvable reference keeps the symbol instead of an empty list', () => {
  it('marks a cross-file reference unresolved and names it', () => {
    const parsed = parseModels(
      [
        'from django.db import models',
        'from .enums import StockStatus',
        'class Item(models.Model):',
        '    status = models.CharField(max_length=20, choices=StockStatus.choices)',
      ].join('\n'),
      { filePath: 'apps/shop/models.py' },
    );
    if (!parsed.ok) throw new Error('parse failed');

    const c = parsed.value[0]!.fields[0]!.choices;
    expect(c?.kind).toBe('unresolved');
    if (c?.kind !== 'unresolved') throw new Error('expected unresolved');
    // The scanner's cross-file pass needs this name to finish the job.
    expect(c.symbolName).toBe('StockStatus');
  });
});

// The tooltip shows a property's source on hover, so the source has to survive
// the trip. It used to stop at the parser, which kept only the name.
describe('property source reaches the payload', () => {
  const SRC = [
    'from django.db import models',
    '',
    'class Invoice(models.Model):',
    '    total = models.DecimalField(max_digits=8, decimal_places=2)',
    '',
    '    @property',
    '    def is_paid(self):',
    '        """Paid once it has a settlement date."""',
    '        return self.settled_at is not None',
    '',
    '    def not_a_property(self):',
    '        return 1',
  ].join('\n');

  const invoice = () => {
    const r = parseModels(SRC, { filePath: 'apps/billing/models.py' });
    if (!r.ok) throw new Error('parse failed');
    const payload = buildDiagramPayload(r.value, [], []);
    const box = payload.tooltipData.find(b => b.name === 'Invoice');
    if (!box) throw new Error('Invoice missing');
    return box;
  };

  it('keeps only real @property members', () => {
    expect(invoice().properties.map(p => p.name)).toEqual(['is_paid']);
  });

  it('carries the decorator, signature and body, dedented', () => {
    expect(invoice().properties[0]!.source).toBe(
      [
        '@property',
        'def is_paid(self):',
        '    """Paid once it has a settlement date."""',
        '    return self.settled_at is not None',
      ].join('\n'),
    );
  });
});
