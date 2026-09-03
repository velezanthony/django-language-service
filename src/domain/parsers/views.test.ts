import { describe, it, expect } from 'vitest';
import { measureScaling } from '../../test-support/scaling';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseViews } from './views';
import { diagnoseTemplate } from '$domain/view-context/diagnose';
import { createModelGraph } from '$domain/view-context/model-graph';

const f = (rel: string) => readFileSync(join(__dirname, '__fixtures__', rel), 'utf8');

// ── FBV with render() — spec PARSEVIEWS ──────────────────────────────────────

describe('parseViews — FBV with render() context dict (spec PARSEVIEWS)', () => {
  const src = f('views/fbv-render.py');
  const result = parseViews(src, { filePath: 'catalogue/views.py' });

  it('returns ok:true', () => {
    expect(result.ok).toBe(true);
  });

  it('extracts 2 FBV views', () => {
    if (!result.ok) throw new Error('not ok');
    expect(result.value).toHaveLength(2);
  });

  it('product_list — kind, name, isClass:false, templateName', () => {
    if (!result.ok) throw new Error('not ok');
    const view = result.value[0]!;
    expect(view.kind).toBe('view');
    expect(view.name).toBe('product_list');
    expect(view.isClass).toBe(false);
    expect(view.templateName).toBe('catalogue/product_list.html');
  });

  it('product_list — contextKeys include products and category', () => {
    if (!result.ok) throw new Error('not ok');
    const view = result.value[0]!;
    expect(view.contextKeys).toContain('products');
    expect(view.contextKeys).toContain('category');
  });

  it('product_list — decorator login_required extracted', () => {
    if (!result.ok) throw new Error('not ok');
    const view = result.value[0]!;
    expect(view.decorators).toContain('login_required');
  });

  it('product_detail — templateName and contextKeys', () => {
    if (!result.ok) throw new Error('not ok');
    const view = result.value[1]!;
    expect(view.name).toBe('product_detail');
    expect(view.templateName).toBe('catalogue/product_detail.html');
    expect(view.contextKeys).toContain('product');
    expect(view.contextKeys).toContain('related');
  });

  it('filePath propagated from opts', () => {
    if (!result.ok) throw new Error('not ok');
    for (const view of result.value) {
      expect(view.filePath).toBe('catalogue/views.py');
    }
  });

  it('product_list — contextVars typed: products queryset, category scalar', () => {
    if (!result.ok) throw new Error('not ok');
    const view = result.value[0]!;
    expect(view.contextVars).toContainEqual({
      name: 'products',
      kind: 'queryset',
      typeRef: 'Product',
    });
    expect(view.contextVars).toContainEqual({ name: 'category', kind: 'scalar' });
  });

  it('product_detail — contextVars typed: product instance, related queryset', () => {
    if (!result.ok) throw new Error('not ok');
    const view = result.value[1]!;
    expect(view.contextVars).toContainEqual({
      name: 'product',
      kind: 'instance',
      typeRef: 'Product',
    });
    expect(view.contextVars).toContainEqual({
      name: 'related',
      kind: 'queryset',
      typeRef: 'Product',
    });
  });

  it('every contextKey has a matching contextVar entry', () => {
    if (!result.ok) throw new Error('not ok');
    for (const view of result.value) {
      const varNames = view.contextVars.map(v => v.name);
      for (const key of view.contextKeys) {
        expect(varNames).toContain(key);
      }
    }
  });
});

// ── FBV returning JsonResponse (no template) ──────────────────────────────────

describe('parseViews — FBV with JsonResponse (no template)', () => {
  const src = f('views/fbv-jsonresponse.py');
  const result = parseViews(src, { filePath: 'basket/views.py' });

  it('returns ok:true', () => {
    expect(result.ok).toBe(true);
  });

  it('extracts 2 FBV views', () => {
    if (!result.ok) throw new Error('not ok');
    expect(result.value).toHaveLength(2);
  });

  it('add_to_basket — templateName is null (no render call)', () => {
    if (!result.ok) throw new Error('not ok');
    expect(result.value[0]!.templateName).toBeNull();
  });

  it('add_to_basket — decorator require_POST extracted', () => {
    if (!result.ok) throw new Error('not ok');
    expect(result.value[0]!.decorators).toContain('require_POST');
  });
});

// ── CBV extraction — spec PARSEVIEWS CBV ─────────────────────────────────────

describe('parseViews — CBV extraction (spec PARSEVIEWS CBV)', () => {
  const src = f('views/cbv.py');
  const result = parseViews(src, { filePath: 'catalogue/views.py' });

  it('returns ok:true', () => {
    expect(result.ok).toBe(true);
  });

  it('extracts 3 CBV views', () => {
    if (!result.ok) throw new Error('not ok');
    expect(result.value).toHaveLength(3);
  });

  it('ProductDetailView — isClass:true, templateName, modelRef', () => {
    if (!result.ok) throw new Error('not ok');
    const view = result.value[0]!;
    expect(view.isClass).toBe(true);
    expect(view.name).toBe('ProductDetailView');
    expect(view.templateName).toBe('catalogue/product_detail.html');
    expect(view.modelRef).toContain('Product');
  });

  it('CategoryListView — modelRef is Category', () => {
    if (!result.ok) throw new Error('not ok');
    const view = result.value[1]!;
    expect(view.name).toBe('CategoryListView');
    expect(view.modelRef).toBe('Category');
  });

  it('ProductCreateView — modelRef is Product', () => {
    if (!result.ok) throw new Error('not ok');
    const view = result.value[2]!;
    expect(view.name).toBe('ProductCreateView');
    expect(view.modelRef).toBe('Product');
  });

  it('ProductDetailView — contextVars carry context_object_name as instance', () => {
    if (!result.ok) throw new Error('not ok');
    const view = result.value[0]!;
    expect(view.contextVars).toContainEqual({
      name: 'product',
      kind: 'instance',
      typeRef: 'Product',
    });
  });

  it('CategoryListView — contextVars expose object_list queryset', () => {
    if (!result.ok) throw new Error('not ok');
    const view = result.value[1]!;
    expect(view.contextVars).toContainEqual({
      name: 'object_list',
      kind: 'queryset',
      typeRef: 'Category',
    });
  });

  it('ProductCreateView — detail-like CBV exposes object instance', () => {
    if (!result.ok) throw new Error('not ok');
    const view = result.value[2]!;
    expect(view.contextVars).toContainEqual({
      name: 'object',
      kind: 'instance',
      typeRef: 'Product',
    });
  });
});

// ── Empty input ────────────────────────────────────────────────────────────────

describe('parseViews — empty input (spec EMPTY-INPUT-INVARIANCE)', () => {
  it('returns ok:true with empty array for ""', () => {
    const result = parseViews('');
    expect(result).toEqual({ ok: true, value: [] });
  });

  it('returns ok:true with empty array for whitespace-only', () => {
    const result = parseViews('   \n\t  ');
    expect(result).toEqual({ ok: true, value: [] });
  });
});

// ── Malformed input ────────────────────────────────────────────────────────────

describe('parseViews — malformed input (spec MALFORMED-INPUT-RESILIENCE)', () => {
  it('returns empty array for file with only imports', () => {
    const src = `
from django.shortcuts import render
from django.http import HttpResponse
`;
    const result = parseViews(src);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('recovers first valid view when second is malformed', () => {
    const src = `
def good_view(request):
    return render(request, 'good.html', {'key': 'val'})

class |||BrokenView(View
    pass
`;
    const result = parseViews(src);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBeGreaterThanOrEqual(1);
      expect(result.value[0]!.name).toBe('good_view');
    }
  });
});

// ── Performance ───────────────────────────────────────────────────────────────

describe('parseViews — performance (spec PERFORMANCE)', () => {
  it('stays linear as the file grows', () => {
    const { ratio } = measureScaling({
      prepare: size =>
        Array.from(
          { length: size },
          (_, i) =>
            `def view_${i}(request):\n    return render(request, 'app/view_${i}.html', {'item': item_${i}})\n\n`,
        ).join(''),
      run: src => {
        parseViews(src);
      },
    });
    expect(ratio).toBeLessThan(2.5);
  });
});

// ── Same-file helper resolution (legacy conditionalKeys/helperTypes port) ─────

describe('parseViews — same-file helper resolution (spec HELPER-KEYS)', () => {
  const SRC = `
def get_base_context(request):
    context = {
        'nav_items': nav,
        'site_name': 'Shop',
    }
    if request.user.is_staff:
        context.update(get_admin_context(request))
    return context

def get_admin_context(request):
    products = Product.objects.filter(managed=True)
    return {
        'is_admin': True,
        'managed_products': products,
    }

def home(request):
    context = get_base_context(request)
    context['page'] = 'home'
    return render(request, 'shop/home.html', context)

def about(request):
    context = {}
    context.update(get_base_context(request))
    return render(request, 'shop/about.html', context)
`;
  const result = parseViews(SRC, { filePath: 'shop/views.py' });
  const byName = (name: string) => {
    if (!result.ok) throw new Error('not ok');
    const v = result.value.find(x => x.name === name);
    if (!v) throw new Error(`view ${name} not found`);
    return v;
  };

  it('context = helper(request) assignment: direct helper keys land in contextKeys', () => {
    const home = byName('home');
    expect(home.contextKeys).toContain('nav_items');
    expect(home.contextKeys).toContain('site_name');
    expect(home.contextKeys).toContain('page');
  });

  it('context.update(helper(request)): direct helper keys land in contextKeys', () => {
    const about = byName('about');
    expect(about.contextKeys).toContain('nav_items');
    expect(about.contextKeys).toContain('site_name');
  });

  it('nested helper keys → contextVars with conditional:true, NOT in contextKeys', () => {
    const home = byName('home');
    expect(home.contextKeys).not.toContain('is_admin');
    const isAdmin = home.contextVars.find(v => v.name === 'is_admin');
    expect(isAdmin).toBeDefined();
    expect(isAdmin!.conditional).toBe(true);
    const managed = home.contextVars.find(v => v.name === 'managed_products');
    expect(managed?.conditional).toBe(true);
  });

  it('direct helper keys are NOT conditional', () => {
    const home = byName('home');
    const nav = home.contextVars.find(v => v.name === 'nav_items');
    expect(nav?.conditional).toBeUndefined();
  });

  it('types from helper chain: managed_products typed as Product queryset', () => {
    const home = byName('home');
    const managed = home.contextVars.find(v => v.name === 'managed_products');
    expect(managed).toMatchObject({ kind: 'queryset', typeRef: 'Product' });
  });

  it('unknown helper call is ignored without breaking the parse', () => {
    const res = parseViews(`
def broken(request):
    context = {}
    context.update(imported_from_elsewhere(request))
    context['ok'] = 1
    return render(request, 'b.html', context)
`);
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('not ok');
    const v = res.value[0]!;
    expect(v.contextKeys).toEqual(['ok']);
  });
});

// ── Conditional keys from if/else branches in the view body ──────────────────

describe('parseViews — conditional if-branch keys (spec CONDITIONAL-KEYS)', () => {
  it('key assigned only under if → contextVar conditional:true, still in contextKeys', () => {
    const res = parseViews(`
def dashboard(request):
    context = {}
    context['title'] = 'Dashboard'
    if request.user.is_staff:
        context['staff_tools'] = tools
    return render(request, 'dash.html', context)
`);
    if (!res.ok) throw new Error('not ok');
    const v = res.value[0]!;
    expect(v.contextKeys).toContain('staff_tools');
    expect(v.contextVars.find(x => x.name === 'staff_tools')?.conditional).toBe(true);
    expect(v.contextVars.find(x => x.name === 'title')?.conditional).toBeUndefined();
  });

  it('same key in both if and else branches → NOT conditional', () => {
    const res = parseViews(`
def landing(request):
    context = {}
    if request.user.is_authenticated:
        context['banner'] = 'welcome back'
    else:
        context['banner'] = 'sign up'
    return render(request, 'landing.html', context)
`);
    if (!res.ok) throw new Error('not ok');
    const v = res.value[0]!;
    expect(v.contextVars.find(x => x.name === 'banner')?.conditional).toBeUndefined();
  });
});

// ── End-to-end: parseViews → diagnoseTemplate treats conditional as info ─────

describe('parseViews → diagnoseTemplate E2E (conditional flows to info)', () => {
  it('a conditional key used in the template produces an info diagnostic', () => {
    const res = parseViews(`
def dashboard(request):
    context = {}
    context['title'] = 'Dash'
    if request.user.is_staff:
        context['staff_tools'] = tools
    return render(request, 'dash.html', context)
`);
    if (!res.ok) throw new Error('not ok');
    const view = res.value[0]!;

    const diags = diagnoseTemplate({
      templateSource: '{{ title }} {{ staff_tools }} {{ ghost }}',
      contextVars: view.contextVars,
      graph: createModelGraph([]),
    });

    const staff = diags.find(d => d.root === 'staff_tools');
    expect(staff).toMatchObject({ severity: 'info', code: 'conditional-variable' });
    const ghost = diags.find(d => d.root === 'ghost');
    expect(ghost).toMatchObject({ severity: 'warning', code: 'undefined-variable' });
    expect(diags.find(d => d.root === 'title')).toBeUndefined();
  });
});

// A Python 3 identifier is any XID_Start followed by XID_Continue — Unicode,
// not ASCII. `\w` in a JS regex without the `u` flag is [A-Za-z0-9_], so a view
// named in the author's own language was globbed, read, and parsed to nothing:
// no view, no context vars, no diagnostics, and no way to tell why.
describe('parseViews — a view name is a Python identifier, not an ASCII word', () => {
  const names = ['índice', 'usuário_detalhe', 'δοκιμή', '日本語', 'naïve2'];

  for (const name of names) {
    it(`finds the FBV \`${name}\``, () => {
      const res = parseViews(
        `def ${name}(request):\n    return render(request, 'x.html', {'a': 1})\n`,
        { filePath: 'app/views.py' },
      );
      if (!res.ok) throw new Error('not ok');
      expect(res.value.map(v => v.name)).toEqual([name]);
      expect(res.value[0]!.templateName).toBe('x.html');
      expect(res.value[0]!.contextKeys).toContain('a');
    });

    it(`finds the CBV \`${name}\``, () => {
      const res = parseViews(`class ${name}(ListView):\n    template_name = 'x.html'\n`, {
        filePath: 'app/views.py',
      });
      if (!res.ok) throw new Error('not ok');
      expect(res.value.map(v => v.name)).toEqual([name]);
      expect(res.value[0]!.isClass).toBe(true);
    });
  }

  it('keeps a non-ASCII decorator on the view it decorates', () => {
    const res = parseViews(`@requiere_sesión\ndef índice(request):\n    return render(request)\n`, {
      filePath: 'app/views.py',
    });
    if (!res.ok) throw new Error('not ok');
    expect(res.value[0]!.decorators).toEqual(['requiere_sesión']);
  });

  it('reads a non-ASCII `model =` on a CBV', () => {
    const res = parseViews(`class Lista(ListView):\n    model = Artículo\n`, {
      filePath: 'app/views.py',
    });
    if (!res.ok) throw new Error('not ok');
    expect(res.value[0]!.modelRef).toBe('Artículo');
  });

  it('does not invent a view out of a line that is not a def', () => {
    const res = parseViews(`defícil = 1\nclassy = 2\n`, { filePath: 'app/views.py' });
    if (!res.ok) throw new Error('not ok');
    expect(res.value).toEqual([]);
  });
});
