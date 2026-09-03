/**
 * End-to-end guard for the case the field-type comparison used to miss:
 * an AlterField that changes only a kwarg. Real migration text in, timeline
 * diff and snapshots out.
 */
import { describe, it, expect } from 'vitest';
import { parseMigrations } from '$domain/parsers/migrations';
import { buildTimelineSteps, buildSnapshots, diffSchemas } from './diagram-migrations';
import type { Migration } from '$domain/types/migration';

const initial = `
from django.db import migrations, models

class Migration(migrations.Migration):
    initial = True
    dependencies = []
    operations = [
        migrations.CreateModel(
            name='Invoice',
            fields=[
                ('id', models.BigAutoField(primary_key=True, serialize=False)),
                ('total', models.DecimalField(max_digits=10, decimal_places=2)),
                ('code', models.CharField(max_length=20)),
            ],
        ),
    ]
`;

const widen = `
from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [('billing', '0001_initial')]
    operations = [
        migrations.AlterField(
            model_name='invoice',
            name='total',
            field=models.DecimalField(max_digits=12, decimal_places=4),
        ),
    ]
`;

const untouched = `
from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [('billing', '0002_widen_total')]
    operations = [
        migrations.AlterField(
            model_name='invoice',
            name='code',
            field=models.CharField(max_length=20),
        ),
    ]
`;

const parse = (src: string, name: string): Migration => {
  const r = parseMigrations(src, { filePath: `apps/billing/migrations/${name}.py` });
  if (!r.ok) throw new Error(`parse failed for ${name}`);
  const m = r.value[0];
  if (!m) throw new Error(`no migration parsed from ${name}`);
  return { ...m, appLabel: 'billing', name };
};

describe('field signature through the migration pipeline', () => {
  const migs = [
    parse(initial, '0001_initial'),
    parse(widen, '0002_widen_total'),
    parse(untouched, '0003_noop_alter'),
  ];

  it('carries decimal precision into the snapshot', () => {
    const snaps = buildSnapshots(migs);
    const invoice = snaps[0]!.models.find(m => m.name === 'Invoice')!;
    const total = invoice.fields.find(f => f.name === 'total')!;
    expect(total.attrs).toEqual(['max_digits=10', 'decimal_places=2']);
  });

  it('updates the snapshot when AlterField widens the precision', () => {
    const snaps = buildSnapshots(migs);
    const after = snaps[1]!.models.find(m => m.name === 'Invoice')!;
    const total = after.fields.find(f => f.name === 'total')!;
    expect(total.attrs).toEqual(['max_digits=12', 'decimal_places=4']);
  });

  // The regression: DecimalField -> DecimalField is type-identical, so the
  // fieldType-only comparison behind the tooltip saw two equal columns.
  it('reports the field as altered even though the type is unchanged', () => {
    const snaps = buildSnapshots(migs);
    const changed = diffSchemas(snaps[0]!.models, snaps[1]!.models).changedModels;
    expect(changed).toEqual([
      { key: 'billing.Invoice', added: [], removed: [], altered: ['total'] },
    ]);
  });

  it('does not invent a change when AlterField rewrites the same signature', () => {
    const snaps = buildSnapshots(migs);
    const cmp = diffSchemas(snaps[1]!.models, snaps[2]!.models);
    expect(cmp.changedModels).toEqual([]);
    expect(cmp.unchangedModels).toEqual(['billing.Invoice']);
  });

  // The timeline chips come from the operations, not from the replay: a
  // migration that declares AlterField says so even when the signature is
  // identical. That is the migration's own claim, kept as-is on purpose.
  it('still lists the op-derived chip for a no-op AlterField', () => {
    const steps = buildTimelineSteps(migs);
    expect(steps[2]!.opSummary).toEqual(['~ invoice.code']);
  });
});
