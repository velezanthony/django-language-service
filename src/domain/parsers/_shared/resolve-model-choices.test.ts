import { describe, it, expect } from 'vitest';
import { parseModels } from '../models';
import { resolveModelChoices, unresolvedSymbolsOf } from './resolve-model-choices';

const SRC = [
  'from django.db import models',
  'from .enums import StockStatus, WAREHOUSE_TYPES',
  '',
  'class Item(models.Model):',
  '    status = models.CharField(max_length=20, choices=StockStatus.choices)',
  '    kind = models.CharField(max_length=20, choices=WAREHOUSE_TYPES)',
  '    title = models.CharField(max_length=50)',
  "    inline = models.CharField(max_length=2, choices=[('a', 'A')])",
].join('\n');

const model = () => {
  const r = parseModels(SRC, { filePath: '/w/apps/inventory/models.py' });
  if (!r.ok) throw new Error('parse failed');
  return r.value[0]!;
};

describe('unresolvedSymbolsOf', () => {
  it('lists only what still needs looking up', () => {
    expect([...unresolvedSymbolsOf(model())].sort()).toEqual(['StockStatus', 'WAREHOUSE_TYPES']);
  });

  it('is empty once nothing is outstanding', () => {
    const r = parseModels(
      'from django.db import models\nclass A(models.Model):\n    x = models.CharField(max_length=1)\n',
    );
    if (!r.ok) throw new Error('parse failed');
    expect(unresolvedSymbolsOf(r.value[0]!).size).toBe(0);
  });
});

describe('resolveModelChoices', () => {
  const lookup = (name: string) =>
    name === 'StockStatus'
      ? {
          values: [{ value: 'in_stock', label: 'In Stock' }],
          sourceModule: 'apps/inventory/enums.py',
        }
      : undefined;

  it('promotes a found symbol to resolved and records where it came from', () => {
    const out = resolveModelChoices(model(), lookup);
    const status = out.fields.find(f => f.name === 'status')!;
    expect(status.choices).toEqual({
      kind: 'resolved',
      symbolName: 'StockStatus',
      values: [{ value: 'in_stock', label: 'In Stock' }],
      sourceModule: 'apps/inventory/enums.py',
    });
  });

  it('leaves a symbol the lookup could not find as unresolved', () => {
    const out = resolveModelChoices(model(), lookup);
    expect(out.fields.find(f => f.name === 'kind')!.choices).toEqual({
      kind: 'unresolved',
      symbolName: 'WAREHOUSE_TYPES',
    });
  });

  it('does not disturb inline choices or plain fields', () => {
    const out = resolveModelChoices(model(), lookup);
    expect(out.fields.find(f => f.name === 'inline')!.choices?.kind).toBe('inline');
    expect(out.fields.find(f => f.name === 'title')!.choices).toBeUndefined();
  });

  // Rebuilding every model on every scan would churn the WeakMap-keyed caches
  // downstream (project-graph memoizes on Model identity).
  it('returns the SAME object when there is nothing to resolve', () => {
    const m = model();
    expect(resolveModelChoices(m, () => undefined)).toBe(m);
  });
});
