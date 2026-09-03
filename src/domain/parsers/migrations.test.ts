import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseMigrations } from './migrations';

const f = (rel: string) => readFileSync(join(__dirname, '__fixtures__', rel), 'utf8');

// ── Initial migration ──────────────────────────────────────────────────────────

describe('parseMigrations — 0001_initial (spec PARSEMIGRATIONS)', () => {
  const src = f('migrations/0001_initial.py');
  const result = parseMigrations(src, {
    filePath: 'catalogue/migrations/0001_initial.py',
  });

  it('returns ok:true', () => {
    expect(result.ok).toBe(true);
  });

  it('returns exactly 1 migration', () => {
    if (!result.ok) throw new Error('not ok');
    expect(result.value).toHaveLength(1);
  });

  it('name derived from filePath', () => {
    if (!result.ok) throw new Error('not ok');
    expect(result.value[0]!.name).toBe('0001_initial');
  });

  it('appLabel derived from filePath', () => {
    if (!result.ok) throw new Error('not ok');
    expect(result.value[0]!.appLabel).toBe('catalogue');
  });

  it('dependencies is empty', () => {
    if (!result.ok) throw new Error('not ok');
    expect(result.value[0]!.dependencies).toEqual([]);
  });

  it('2 CreateModel operations', () => {
    if (!result.ok) throw new Error('not ok');
    const ops = result.value[0]!.operations;
    expect(ops).toHaveLength(2);
    expect(ops[0]!.kind).toBe('CreateModel');
    expect(ops[0]!.modelName).toBe('Category');
    expect(ops[1]!.kind).toBe('CreateModel');
    expect(ops[1]!.modelName).toBe('Product');
  });

  it('kind is migration', () => {
    if (!result.ok) throw new Error('not ok');
    expect(result.value[0]!.kind).toBe('migration');
  });

  it('filePath propagated', () => {
    if (!result.ok) throw new Error('not ok');
    expect(result.value[0]!.filePath).toBe('catalogue/migrations/0001_initial.py');
  });
});

// ── Alter migration ────────────────────────────────────────────────────────────

describe('parseMigrations — 0002_alter (AddField + AlterField + RenameField)', () => {
  const src = f('migrations/0002_alter.py');
  const result = parseMigrations(src, {
    filePath: 'catalogue/migrations/0002_alter.py',
  });

  it('returns ok:true', () => {
    expect(result.ok).toBe(true);
  });

  it('dependencies normalized with dot separator', () => {
    if (!result.ok) throw new Error('not ok');
    const deps = result.value[0]!.dependencies;
    expect(deps).toContain('catalogue.0001_initial');
    expect(deps).toContain('core.0002_add_timestamps');
  });

  it('3 operations extracted', () => {
    if (!result.ok) throw new Error('not ok');
    expect(result.value[0]!.operations).toHaveLength(3);
  });

  it('AddField — modelName and fieldName', () => {
    if (!result.ok) throw new Error('not ok');
    const op = result.value[0]!.operations[0]!;
    expect(op.kind).toBe('AddField');
    expect(op.modelName).toBe('Product');
    expect(op.fieldName).toBe('description');
  });

  it('AlterField — modelName and fieldName', () => {
    if (!result.ok) throw new Error('not ok');
    const op = result.value[0]!.operations[1]!;
    expect(op.kind).toBe('AlterField');
    expect(op.modelName).toBe('Product');
    expect(op.fieldName).toBe('price');
  });

  it('RenameField — old_name as fieldName, new_name', () => {
    if (!result.ok) throw new Error('not ok');
    const op = result.value[0]!.operations[2]!;
    expect(op.kind).toBe('RenameField');
    expect(op.modelName).toBe('Category');
    expect(op.fieldName).toBe('slug');
    expect(op.newName).toBe('url_slug');
  });
});

// ── Unknown op — warn + skip ───────────────────────────────────────────────────

describe('parseMigrations — unknown_op (AddIndex warns and is skipped)', () => {
  it('calls onWarn for AddIndex and skips it', () => {
    const src = f('migrations/unknown_op.py');
    const onWarn = vi.fn();
    const result = parseMigrations(src, {
      filePath: 'catalogue/migrations/0003_index.py',
      onWarn,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // AddField is kept, AddIndex is skipped
    const ops = result.value[0]!.operations;
    expect(ops).toHaveLength(1);
    expect(ops[0]!.kind).toBe('AddField');

    // onWarn was called for AddIndex
    expect(onWarn).toHaveBeenCalledOnce();
    expect((onWarn.mock.calls[0]! as string[])[0]).toContain('AddIndex');
  });
});

// ── Empty input ────────────────────────────────────────────────────────────────

describe('parseMigrations — empty input (spec EMPTY-INPUT-INVARIANCE)', () => {
  it('returns ok:true with empty array for ""', () => {
    const result = parseMigrations('');
    expect(result).toEqual({ ok: true, value: [] });
  });

  it('returns ok:true with empty array for whitespace-only', () => {
    const result = parseMigrations('   \n\t  ');
    expect(result).toEqual({ ok: true, value: [] });
  });
});

// ── filePath derivation ────────────────────────────────────────────────────────

describe('parseMigrations — filePath derivation', () => {
  it('derives name from filePath basename', () => {
    const src = f('migrations/0001_initial.py');
    const result = parseMigrations(src, { filePath: 'shop/migrations/0042_add_stuff.py' });
    if (!result.ok) throw new Error('not ok');
    expect(result.value[0]!.name).toBe('0042_add_stuff');
    expect(result.value[0]!.appLabel).toBe('shop');
  });

  it('falls back to empty string when filePath is not provided', () => {
    const src = f('migrations/0001_initial.py');
    const result = parseMigrations(src);
    if (!result.ok) throw new Error('not ok');
    expect(result.value[0]!.name).toBe('');
    expect(result.value[0]!.appLabel).toBe('');
  });
});

// ── Malformed input ────────────────────────────────────────────────────────────

describe('parseMigrations — malformed input (spec MALFORMED-INPUT-RESILIENCE)', () => {
  it('returns ok:true with empty operations on file with no operations block', () => {
    const src = `
from django.db import migrations

class Migration(migrations.Migration):
    dependencies = []
`;
    const result = parseMigrations(src, { filePath: 'app/migrations/0001_init.py' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]!.operations).toEqual([]);
    }
  });
});
