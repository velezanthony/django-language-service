import { describe, it, expect } from 'vitest';
import { candidateModulePaths, collectChoiceSymbols, parseChoiceImports } from './choice-imports';

describe('parseChoiceImports', () => {
  const imports = (src: string) => Object.fromEntries(parseChoiceImports(src));

  it('maps each imported name to its module', () => {
    expect(imports('from .enums import StockStatus')).toEqual({ StockStatus: '.enums' });
  });

  it('handles several names on one line', () => {
    expect(imports('from .enums import A, B, C')).toEqual({
      A: '.enums',
      B: '.enums',
      C: '.enums',
    });
  });

  // The local name is what the field references, so that is the key.
  it('keys an aliased import by its local name', () => {
    expect(imports('from .enums import StockStatus as SS')).toEqual({ SS: '.enums' });
  });

  it('follows parenthesised multi-line imports', () => {
    const src = ['from .enums import (', '    Alpha,', '    Beta,', ')'].join('\n');
    expect(imports(src)).toEqual({ Alpha: '.enums', Beta: '.enums' });
  });

  it('keeps the dots so the resolver knows how far up to walk', () => {
    expect(imports('from ..common.enums import X')).toEqual({ X: '..common.enums' });
  });

  it('records absolute imports too', () => {
    expect(imports('from apps.shop.enums import Y')).toEqual({ Y: 'apps.shop.enums' });
  });

  it('ignores star and plain imports, which name nothing resolvable', () => {
    expect(imports('from .enums import *')).toEqual({});
    expect(imports('import os')).toEqual({});
  });
});

describe('candidateModulePaths', () => {
  const FROM = '/w/apps/inventory/models.py';

  it('resolves a sibling module', () => {
    expect(candidateModulePaths(FROM, '.enums')).toEqual([
      '/w/apps/inventory/enums.py',
      '/w/apps/inventory/enums/__init__.py',
    ]);
  });

  it('walks up one package per extra dot', () => {
    expect(candidateModulePaths(FROM, '..common.enums')[0]).toBe('/w/apps/common/enums.py');
  });

  it('resolves an absolute module against the workspace root', () => {
    expect(candidateModulePaths(FROM, 'apps.shop.enums', '/w')[0]).toBe('/w/apps/shop/enums.py');
  });

  it('gives up on an absolute module with no root to anchor it', () => {
    expect(candidateModulePaths(FROM, 'apps.shop.enums')).toEqual([]);
  });

  // `from . import enums` style, and anything that would escape the root.
  it('refuses to walk above the filesystem root', () => {
    expect(candidateModulePaths('/models.py', '.....deep.enums')).toEqual([]);
  });
});

describe('collectChoiceSymbols', () => {
  const SRC = [
    'from django.db import models',
    '',
    'class StockStatus(models.TextChoices):',
    "    IN_STOCK = 'in_stock', 'In Stock'",
    "    OUT = 'out', 'Out of Stock'",
    '',
    'WAREHOUSE_TYPES = [',
    "    ('main', 'Main Warehouse'),",
    "    ('satellite', 'Satellite'),",
    ']',
  ].join('\n');

  it('publishes TextChoices classes and module constants alike', () => {
    const symbols = collectChoiceSymbols(SRC);
    expect(symbols.get('StockStatus')?.map(c => c.value)).toEqual(['in_stock', 'out']);
    expect(symbols.get('WAREHOUSE_TYPES')?.map(c => c.value)).toEqual(['main', 'satellite']);
  });

  it('returns nothing for a module that defines no choices', () => {
    expect(collectChoiceSymbols('x = 1\n').size).toBe(0);
  });
});
