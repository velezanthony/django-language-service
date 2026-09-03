/**
 * Pass 2 follows `from .enums import X` to resolve choices.
 *
 * The point of using the real Scanner here: `enums.py` is deliberately NOT in
 * INCLUDE_PATTERNS, so pass 1 never globs it. If resolution works, it is
 * because the import was read and the file opened on purpose.
 */
import { describe, it, expect } from 'vitest';
import { Scanner } from './scanner';
import { InMemoryFileSystem } from './file-system';
import type { Project } from '$infra/types/project';

const MODELS = `
from django.db import models
from .enums import StockStatus, WAREHOUSE_TYPES
from ..shared.enums import Grade

class Item(models.Model):
    status = models.CharField(max_length=20, choices=StockStatus.choices)
    warehouse = models.CharField(max_length=20, choices=WAREHOUSE_TYPES)
    grade = models.CharField(max_length=20, choices=Grade.choices)
    missing = models.CharField(max_length=20, choices=NowhereToBeFound)
`;

const ENUMS = `
from django.db import models

class StockStatus(models.TextChoices):
    IN_STOCK = 'in_stock', 'In Stock'
    OUT = 'out', 'Out of Stock'

WAREHOUSE_TYPES = [
    ('main', 'Main Warehouse'),
    ('satellite', 'Satellite'),
]
`;

const SHARED_ENUMS = `
from django.db import models

class Grade(models.TextChoices):
    A = 'a', 'Grade A'
`;

function makeScanner(fs: InMemoryFileSystem) {
  const emitterFactory = () => {
    const listeners: Array<(v: unknown) => void> = [];
    return {
      event: (cb: (v: unknown) => void) => {
        listeners.push(cb);
        return { dispose: () => undefined };
      },
      fire: (v: unknown) => {
        for (const l of listeners) l(v);
      },
      dispose: () => {
        listeners.length = 0;
      },
    } as unknown as import('vscode').EventEmitter<Project>;
  };
  return new Scanner({ fs, emitterFactory });
}

async function scanFixture() {
  const fs = new InMemoryFileSystem();
  fs.addFile('/ws/apps/inventory/models.py', MODELS, 1);
  fs.addFile('/ws/apps/inventory/enums.py', ENUMS, 2);
  fs.addFile('/ws/apps/shared/enums.py', SHARED_ENUMS, 3);

  const project = await makeScanner(fs).scan(['/ws']);
  const item = project.models.byKey('inventory.Item');
  if (!item) throw new Error('Item missing from index');
  return item;
}

const choicesOf = (item: Awaited<ReturnType<typeof scanFixture>>, name: string) =>
  item.fields.find(f => f.name === name)?.choices;

describe('Scanner pass 2 — cross-file choices', () => {
  it('resolves a TextChoices class from a sibling module', async () => {
    const c = choicesOf(await scanFixture(), 'status');
    expect(c?.kind).toBe('resolved');
    if (c?.kind !== 'resolved') throw new Error('expected resolved');
    expect(c.values.map(v => v.value)).toEqual(['in_stock', 'out']);
    expect(c.sourceModule).toBe('.enums');
  });

  it('resolves a module-level constant the same way', async () => {
    const c = choicesOf(await scanFixture(), 'warehouse');
    expect(c?.kind).toBe('resolved');
    if (c?.kind !== 'resolved') throw new Error('expected resolved');
    expect(c.values.map(v => v.value)).toEqual(['main', 'satellite']);
  });

  it('walks up a package for a `..` import', async () => {
    const c = choicesOf(await scanFixture(), 'grade');
    expect(c?.kind).toBe('resolved');
    if (c?.kind !== 'resolved') throw new Error('expected resolved');
    expect(c.values.map(v => v.value)).toEqual(['a']);
  });

  // Still honest when the symbol is imported from nowhere.
  it('leaves a symbol with no import behind as unresolved', async () => {
    const c = choicesOf(await scanFixture(), 'missing');
    expect(c).toEqual({ kind: 'unresolved', symbolName: 'NowhereToBeFound' });
  });
});
