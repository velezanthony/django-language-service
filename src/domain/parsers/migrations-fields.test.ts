import { describe, it, expect } from 'vitest';
import { parseMigrations } from './migrations';

// A.1 step 1 — CreateModel/AddField now carry field metadata (name, type,
// related model, on_delete). Ported from the OLD migration-parser so snapshots
// can be reconstructed with real field types + relations.

const SRC = `
from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [('auth', '0001_initial')]
    operations = [
        migrations.CreateModel(
            name='Post',
            fields=[
                ('id', models.AutoField(primary_key=True)),
                ('title', models.CharField(max_length=200)),
                ('author', models.ForeignKey(on_delete=models.CASCADE, to='auth.User')),
            ],
        ),
        migrations.AddField(
            model_name='post',
            name='slug',
            field=models.SlugField(max_length=50),
        ),
    ]
`;

describe('parseMigrations — field metadata (A.1)', () => {
  const result = parseMigrations(SRC, { filePath: 'blog/migrations/0002_post.py' });
  const ops = result.ok ? result.value[0]!.operations : [];

  it('CreateModel carries all its fields', () => {
    const create = ops.find(o => o.kind === 'CreateModel');
    expect(create?.fields).toBeDefined();
    expect(create?.fields?.map(f => f.name)).toEqual(['id', 'title', 'author']);
  });

  it('extracts scalar field type + attrs', () => {
    const create = ops.find(o => o.kind === 'CreateModel');
    const title = create?.fields?.find(f => f.name === 'title');
    expect(title?.fieldType).toBe('CharField');
    expect(title?.attrs).toContain('max_length=200');
  });

  it('extracts relation target + on_delete for ForeignKey', () => {
    const create = ops.find(o => o.kind === 'CreateModel');
    const author = create?.fields?.find(f => f.name === 'author');
    expect(author?.fieldType).toBe('ForeignKey');
    expect(author?.relatedModel).toBe('User');
    expect(author?.onDelete).toBe('CASCADE');
  });

  it('AddField carries the added field type', () => {
    const add = ops.find(o => o.kind === 'AddField');
    expect(add?.fieldName).toBe('slug');
    expect(add?.fields?.[0]?.fieldType).toBe('SlugField');
  });
});
