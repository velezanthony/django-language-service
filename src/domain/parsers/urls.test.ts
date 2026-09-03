import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { measureScaling } from '../../test-support/scaling';
import { parseUrls } from './urls';

const f = (rel: string) => readFileSync(join(__dirname, '__fixtures__', rel), 'utf8');

describe('parseUrls', () => {
  it('happy path — basic urls (no app_name)', () => {
    const source = f('urls/basic.py');
    const result = parseUrls(source, { filePath: 'myapp/urls.py' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const urls = result.value;
    expect(urls.length).toBe(4);

    const index = urls.find(u => u.name === 'index');
    expect(index).toBeDefined();
    expect(index?.kind).toBe('url');
    expect(index?.pattern).toBe('');
    expect(index?.viewName).toBe('views.index');
    expect(index?.filePath).toBe('myapp/urls.py');

    const detail = urls.find(u => u.name === 'product-detail');
    expect(detail).toBeDefined();
    expect(detail?.pattern).toBe('products/<int:pk>/');
    expect(detail?.viewName).toBe('views.product_detail');
  });

  it('happy path — with app_name namespace', () => {
    const source = f('urls/with-app-name.py');
    const result = parseUrls(source, { filePath: 'shop/urls.py' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const urls = result.value;
    // 3 path() + 1 re_path() = 4
    expect(urls.length).toBe(4);

    // All names should be prefixed with 'shop:'
    expect(urls.every(u => u.name.startsWith('shop:'))).toBe(true);

    const productDetail = urls.find(u => u.name === 'shop:product-detail');
    expect(productDetail).toBeDefined();
    expect(productDetail?.viewName).toBe('views.ProductDetailView.as_view()');

    // re_path entry
    const search = urls.find(u => u.name === 'shop:search');
    expect(search).toBeDefined();
    expect(search?.pattern).toBe(r`^search/$`);
  });

  it('empty input → empty array', () => {
    const result = parseUrls('');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([]);
  });

  it('whitespace-only input → empty array', () => {
    const result = parseUrls('   \n   \t  ');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([]);
  });

  it('malformed — no name= kwarg → skipped', () => {
    const source = `
from django.urls import path
from . import views
urlpatterns = [
    path('about/', views.about),
]`;
    const result = parseUrls(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([]);
  });

  describe('multi-line calls (Black-formatted)', () => {
    it('path() split across multiple lines produces an entry', () => {
      const source = `from django.urls import path
from . import views

urlpatterns = [
    path(
        "articles/<int:pk>/",
        views.ArticleDetail.as_view(),
        name="article-detail",
    ),
]`;
      const result = parseUrls(source, { filePath: 'articles/urls.py' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.length).toBe(1);
      const u = result.value[0]!;
      expect(u.name).toBe('article-detail');
      expect(u.pattern).toBe('articles/<int:pk>/');
      expect(u.viewName).toBe('views.ArticleDetail.as_view()');
      // line is 0-based and points at the line where `path(` starts
      expect(u.line).toBe(4);
    });

    it('re_path() split across multiple lines produces an entry', () => {
      const source = `from django.urls import re_path
from . import views

urlpatterns = [
    re_path(
        r"^legacy/(?P<slug>[\\w-]+)/$",
        views.legacy_redirect,
        name="legacy",
    ),
]`;
      const result = parseUrls(source, { filePath: 'articles/urls.py' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.length).toBe(1);
      const u = result.value[0]!;
      expect(u.name).toBe('legacy');
      expect(u.viewName).toBe('views.legacy_redirect');
      expect(u.line).toBe(4);
    });

    it('mix of single-line and multi-line entries in the same file', () => {
      const source = `from django.urls import path, re_path
from . import views

app_name = 'blog'

urlpatterns = [
    path('', views.index, name='index'),
    path(
        'posts/<int:pk>/',
        views.PostDetail.as_view(),
        name='post-detail',
    ),
    re_path(r'^archive/$', views.archive, name='archive'),
]`;
      const result = parseUrls(source, { filePath: 'blog/urls.py' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const urls = result.value;
      expect(urls.length).toBe(3);
      expect(urls.map(u => u.name)).toEqual(['blog:index', 'blog:post-detail', 'blog:archive']);

      const detail = urls.find(u => u.name === 'blog:post-detail');
      expect(detail?.line).toBe(7);
      expect(detail?.viewName).toBe('views.PostDetail.as_view()');
    });

    it('name= kwarg on a different line than the path( opener', () => {
      const source = `from django.urls import path
from . import views

urlpatterns = [
    path('checkout/', views.checkout,
         name='checkout'),
]`;
      const result = parseUrls(source, { filePath: 'shop/urls.py' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.length).toBe(1);
      const u = result.value[0]!;
      expect(u.name).toBe('checkout');
      expect(u.pattern).toBe('checkout/');
      expect(u.line).toBe(4);
    });

    it('multi-line path without name= is still skipped', () => {
      const source = `from django.urls import path
from . import views

urlpatterns = [
    path(
        'about/',
        views.about,
    ),
    path('contact/', views.contact, name='contact'),
]`;
      const result = parseUrls(source, { filePath: 'pages/urls.py' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // The unnamed entry must not steal the name= of the NEXT call
      expect(result.value.length).toBe(1);
      expect(result.value[0]?.name).toBe('contact');
      expect(result.value[0]?.pattern).toBe('contact/');
    });
  });

  it('performance — stays linear as the file grows', () => {
    const line = `    path('products/<int:pk>/', views.product_detail, name='product-detail'),\n`;
    const { ratio } = measureScaling({
      prepare: size => `app_name = 'shop'\nurlpatterns = [\n${line.repeat(size)}]\n`,
      run: src => {
        parseUrls(src);
      },
      size: 120,
    });
    expect(ratio).toBeLessThan(2.5);
  });
});

// Template literal helper for raw strings in tests
function r(strings: TemplateStringsArray): string {
  return strings[0] ?? '';
}
