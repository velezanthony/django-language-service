import { describe, it, expect } from 'vitest';
import { parseMigrations } from '../parsers/migrations';
import { buildSnapshots } from './diagram-migrations';

// A.1.2 — snapshots must carry REAL field types (not 'Unknown') and the
// relations (FK/M2M/O2O) reconstructed from the replayed schema, so the diff
// tooltip shows real types and the canvas can draw historical relations.

const INITIAL = `
from django.db import migrations, models

class Migration(migrations.Migration):
    initial = True
    dependencies = []
    operations = [
        migrations.CreateModel(
            name='Post',
            fields=[
                ('id', models.AutoField(primary_key=True)),
                ('title', models.CharField(max_length=200)),
                ('author', models.ForeignKey(on_delete=models.CASCADE, to='auth.User')),
            ],
        ),
    ]
`;

const ADD = `
from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [('blog', '0001_initial')]
    operations = [
        migrations.AddField(
            model_name='post',
            name='body',
            field=models.TextField(),
        ),
    ]
`;

function snapshotsFor(...sources: string[]) {
  const migs = sources.flatMap((src, i) => {
    const r = parseMigrations(src, { filePath: `blog/migrations/000${i + 1}_m.py` });
    return r.ok ? r.value : [];
  });
  return buildSnapshots(migs);
}

describe('buildSnapshots — rich field types (A.1.2)', () => {
  it('CreateModel fields land in the snapshot with their REAL types', () => {
    const snaps = snapshotsFor(INITIAL);
    const post = snaps[0]?.models.find(m => m.name === 'Post');
    expect(post).toBeDefined();
    const byName = new Map(post!.fields.map(f => [f.name, f.fieldType]));
    expect(byName.get('title')).toBe('CharField');
    expect(byName.get('author')).toBe('ForeignKey');
    expect(byName.get('title')).not.toBe('Unknown');
  });

  it('AddField applies the real type to the later snapshot', () => {
    const snaps = snapshotsFor(INITIAL, ADD);
    const post = snaps[1]?.models.find(m => m.name === 'Post');
    const body = post?.fields.find(f => f.name === 'body');
    expect(body?.fieldType).toBe('TextField');
  });
});

describe('buildSnapshots — reconstructed relations (A.1.2)', () => {
  it('builds an FK relation from the replayed schema', () => {
    const snaps = snapshotsFor(INITIAL);
    const rels = snaps[0]?.relations ?? [];
    const fk = rels.find(r => r.fieldName === 'author');
    expect(fk).toBeDefined();
    expect(fk?.from).toBe('Post');
    expect(fk?.to).toBe('User');
    expect(fk?.type).toBe('FK');
  });
});
