/**
 * The tail of the Unicode class: migrations, URL parameters, typed chains.
 *
 * Two rounds closed the context readers and the declaration readers. These are
 * what is left, and one of them matters more than its size suggests: the
 * MIGRATION readers still use `\w`, while `models.py` no longer does. A parser
 * pair that disagrees about what a name is does not fail — it reports a
 * difference. The diagram compares migration state against model state, so a
 * project with `class Artículo` would have shown a model whose migrations
 * appear to be missing, which is a lie told confidently.
 */
import { describe, it, expect } from 'vitest';
import { parseMigrations } from './parsers/migrations';
import { parseUrls } from './parsers/urls';

describe('a migration naming a model in the project language', () => {
  const source = [
    'class Migration(migrations.Migration):',
    '    operations = [',
    '        migrations.CreateModel(',
    "            name='Artículo',",
    '            fields=[',
    "                ('título', models.CharField(max_length=10)),",
    '            ],',
    '        ),',
    '    ]',
  ].join('\n');

  it('reads the model name whole', () => {
    const r = parseMigrations(source, { filePath: 'tienda/migrations/0001_initial.py' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value[0]?.operations.map(o => o.modelName)).toContain('Artículo');
  });

  it('still reads an ASCII model name', () => {
    const ascii = source.replace('Artículo', 'Article').replace('título', 'title');
    const r = parseMigrations(ascii, { filePath: 'shop/migrations/0001_initial.py' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value[0]?.operations.map(o => o.modelName)).toContain('Article');
  });
});

describe('a url pattern with a parameter in the project language', () => {
  it('keeps the app namespace', () => {
    const r = parseUrls(
      ["app_name = 'tienda'", 'urlpatterns = [', "    path('x/', views.x, name='x'),", ']'].join(
        '\n',
      ),
      { filePath: 'tienda/urls.py' },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value[0]?.name).toBe('tienda:x');
  });

  it('keeps a parameter named in the project language', () => {
    const r = parseUrls(
      [
        'urlpatterns = [',
        "    path('artículos/<int:año>/', views.detail, name='detail'),",
        ']',
      ].join('\n'),
      { filePath: 'tienda/urls.py' },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value[0]?.pattern).toContain('año');
  });
});
