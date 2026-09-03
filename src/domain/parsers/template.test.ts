import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { parseTemplate } from './template';
import { measureScaling } from '../../test-support/scaling';

const f = (rel: string) => readFileSync(join(__dirname, '__fixtures__', rel), 'utf8');

describe('parseTemplate', () => {
  it('happy path — extends chain and blocks (spec PARSETEMPLATE)', () => {
    const source = f('templates/extends.html');
    const result = parseTemplate(source, { filePath: 'shop/templates/product_detail.html' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toHaveLength(1);
    const t = result.value[0]!;

    expect(t.kind).toBe('template');
    expect(t.extends).toBe('base/layout.html');
    expect(t.blocks).toContain('title');
    expect(t.blocks).toContain('content');
    expect(t.filePath).toBe('shop/templates/product_detail.html');
    expect(t.relativePath).toBe('shop/templates/product_detail.html');
  });

  it('includes with kwargs (spec PARSETEMPLATE)', () => {
    const source = f('templates/includes.html');
    const result = parseTemplate(source, { filePath: 'shop/templates/index.html' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const t = result.value[0]!;
    const includes = t.includes.filter(i => !i.target.startsWith('__'));

    // breadcrumb (no kwargs)
    const breadcrumb = includes.find(i => i.target === 'partials/breadcrumb.html');
    expect(breadcrumb).toBeDefined();
    expect(breadcrumb?.kwargs).toHaveLength(0);

    // product_card with kwargs
    const card = includes.find(i => i.target === 'partials/product_card.html');
    expect(card).toBeDefined();
    expect(card?.kwargs.some(k => k.name === 'product')).toBe(true);
    expect(card?.kwargs.some(k => k.name === 'show_price')).toBe(true);

    // footer with string-valued kwargs
    const footer = includes.find(i => i.target === 'partials/footer.html');
    expect(footer).toBeDefined();
    expect(footer?.kwargs.some(k => k.name === 'site_name' && k.expr === 'MyShop')).toBe(true);
  });

  it('URL refs encoded as sentinel __url__:<name> (spec PARSETEMPLATE-url-refs)', () => {
    const source = f('templates/urls.html');
    const result = parseTemplate(source);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const t = result.value[0]!;
    const urlRefs = t.includes.filter(i => i.target.startsWith('__url__:'));

    expect(urlRefs.length).toBeGreaterThanOrEqual(3);

    const shopIndex = urlRefs.find(i => i.target === '__url__:shop:index');
    expect(shopIndex).toBeDefined();

    const cartAdd = urlRefs.find(i => i.target === '__url__:cart:add');
    expect(cartAdd).toBeDefined();
  });

  it('static refs encoded as sentinel __static__:<path>', () => {
    const source = f('templates/static.html');
    const result = parseTemplate(source);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const t = result.value[0]!;
    const staticRefs = t.includes.filter(i => i.target.startsWith('__static__:'));

    expect(staticRefs.length).toBeGreaterThanOrEqual(3);

    const css = staticRefs.find(i => i.target === '__static__:css/main.css');
    expect(css).toBeDefined();

    const logo = staticRefs.find(i => i.target === '__static__:images/logo.png');
    expect(logo).toBeDefined();
  });

  it('base template — blocks extracted, no extends', () => {
    const source = f('templates/blocks.html');
    const result = parseTemplate(source, { filePath: 'templates/base.html' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const t = result.value[0]!;
    expect(t.extends).toBeUndefined();
    expect(t.blocks).toContain('title');
    expect(t.blocks).toContain('content');
    expect(t.blocks).toContain('header');
    expect(t.blocks).toContain('footer');
    expect(t.blocks).toContain('sidebar');
    expect(t.blocks).toContain('extra_head');
  });

  it('empty input → empty array', () => {
    const result = parseTemplate('');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([]);
  });

  it('whitespace-only → empty array', () => {
    const result = parseTemplate('   \n\t  ');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([]);
  });

  it('malformed extends (no closing %}) → no extends extracted', () => {
    const source = `{% extends "broken.html" \n{{ something }}`;
    const result = parseTemplate(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const t = result.value[0]!;
    expect(t.extends).toBeUndefined();
  });

  it('include with bare "only" (no with) is still captured', () => {
    const source = `{% include 'partials/sidebar.html' only %}`;
    const result = parseTemplate(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const t = result.value[0]!;
    const inc = t.includes.find(i => i.target === 'partials/sidebar.html');
    expect(inc).toBeDefined();
    expect(inc?.kwargs).toEqual([]);
  });

  it('include with "with ... only" keeps kwargs and does not parse only as kwarg', () => {
    const source = `{% include 'partials/card.html' with product=item show_price=True only %}`;
    const result = parseTemplate(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const t = result.value[0]!;
    const inc = t.includes.find(i => i.target === 'partials/card.html');
    expect(inc).toBeDefined();
    expect(inc?.kwargs.map(k => k.name)).toEqual(['product', 'show_price']);
  });

  it('regression: include without with/only still captured', () => {
    const source = `{% include "partials/footer.html" %}`;
    const result = parseTemplate(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const t = result.value[0]!;
    const inc = t.includes.find(i => i.target === 'partials/footer.html');
    expect(inc).toBeDefined();
    expect(inc?.kwargs).toEqual([]);
  });

  it('includes line numbers are 1-based', () => {
    const source = `line1\nline2\n{% include "partial.html" %}`;
    const result = parseTemplate(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const t = result.value[0]!;
    const inc = t.includes.find(i => i.target === 'partial.html');
    expect(inc?.line).toBe(3);
  });
});

describe('parseTemplate — scaling', () => {
  // `lineOf` was `source.substring(0, matchIndex).split('\n').length`: a copy
  // and a split of everything before the match, per match. On a template
  // dense with `{% url %}` / `{% static %}` refs that is quadratic in file
  // length, and `offsetMapper` — already used by three sibling parsers — has
  // been sitting in _shared the whole time.
  it('stays linear as references multiply', () => {
    const block =
      '<a href="{% url \'blog:index\' %}">x</a>\n' +
      '<img src="{% static \'img/a.png\' %}">\n' +
      '{% include "blog/card.html" %}\n';
    const { ratio } = measureScaling({
      prepare: size => block.repeat(size),
      run: src => {
        parseTemplate(src, { filePath: 'blog/templates/blog/x.html' });
      },
      size: 150,
    });
    expect(ratio).toBeLessThan(2.5);
  });
});
