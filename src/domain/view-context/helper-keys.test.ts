import { describe, it, expect } from 'vitest';
import { extractHelperBodies, resolveHelperKeys } from './helper-keys';

// ── extractHelperBodies — ported from legacy helper-parser tests ─────────────

describe('extractHelperBodies — dict-key extraction patterns', () => {
  it('return {...} dict literal (multi-line) → keys', () => {
    const bodies = extractHelperBodies(`
def get_base_context(request):
    return {
        'nav_items': build_nav(),
        'site_name': 'Shop',
    }
`);
    const base = bodies.get('get_base_context');
    expect(base).toBeDefined();
    expect(base!.keys).toContain('nav_items');
    expect(base!.keys).toContain('site_name');
  });

  it('return dict(key=val, ...) kwargs → keys', () => {
    const bodies = extractHelperBodies(`
def get_meta(request):
    return dict(title='Home', year=2026)
`);
    expect(bodies.get('get_meta')!.keys).toEqual(['title', 'year']);
  });

  it('var init dict + bracket assign + var.update({...}) → keys', () => {
    const bodies = extractHelperBodies(`
def build(request):
    data = {'a': 1}
    data['b'] = 2
    data.update({'c': 3})
    data.update(dict(d=4))
    return data
`);
    const b = bodies.get('build')!;
    expect([...b.keys].sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('var.update(func(...)) detected as nested helper call', () => {
    const bodies = extractHelperBodies(`
def get_base_context(request):
    ctx = {'nav': 1}
    if request.user.is_staff:
        ctx.update(get_admin_context(request))
    return ctx
`);
    const b = bodies.get('get_base_context')!;
    expect(b.helperCalls).toContain('get_admin_context');
    expect(b.keys).toContain('nav');
  });

  it('dict()/super() are never nested helper calls', () => {
    const bodies = extractHelperBodies(`
def build(request):
    ctx = {}
    ctx.update(dict(a=1))
    return ctx
`);
    expect(bodies.get('build')!.helperCalls).not.toContain('dict');
  });

  it('multiple defs extracted independently', () => {
    const bodies = extractHelperBodies(`
def one():
    return {'x': 1}

def two():
    return {'y': 2}
`);
    expect(bodies.get('one')!.keys).toEqual(['x']);
    expect(bodies.get('two')!.keys).toEqual(['y']);
  });

  it('empty source → empty map', () => {
    expect(extractHelperBodies('').size).toBe(0);
  });
});

// ── resolveHelperKeys — legacy resolveHelperCalls semantics ──────────────────

describe('resolveHelperKeys', () => {
  const SOURCE = `
def get_base_context(request):
    context = {
        'nav_items': nav,
        'site_name': 'Shop',
    }
    if request.user.is_staff:
        context.update(get_admin_context(request))
    elif request.user.is_authenticated:
        context.update(get_customer_context(request))
    return context

def get_admin_context(request):
    products = Product.objects.filter(managed=True)
    return {
        'is_admin': True,
        'managed_products': products,
    }

def get_customer_context(request):
    return {'wishlist': wishlist}
`;
  const bodies = extractHelperBodies(SOURCE);

  it('direct keys of the called helper → direct', () => {
    const r = resolveHelperKeys(['get_base_context'], bodies);
    expect(r.direct).toContain('nav_items');
    expect(r.direct).toContain('site_name');
  });

  it('keys from nested helper chains → conditional', () => {
    const r = resolveHelperKeys(['get_base_context'], bodies);
    expect(r.conditional).toContain('is_admin');
    expect(r.conditional).toContain('managed_products');
    expect(r.conditional).toContain('wishlist');
    expect(r.direct).not.toContain('is_admin');
  });

  it('unknown helper → empty result, no throw', () => {
    const r = resolveHelperKeys(['does_not_exist'], bodies);
    expect(r.direct).toEqual([]);
    expect(r.conditional).toEqual([]);
  });

  it('dotted call resolves via the bare method name', () => {
    const withMethod = extractHelperBodies(`
def to_dict(self):
    return {'header_links': links}
`);
    const r = resolveHelperKeys(['header.to_dict'], withMethod);
    expect(r.direct).toContain('header_links');
  });

  it('depth cap: keys beyond depth 3 are dropped', () => {
    const chain = extractHelperBodies(`
def a(request):
    ctx = {'ka': 1}
    ctx.update(b(request))
    return ctx

def b(request):
    ctx = {'kb': 1}
    ctx.update(c(request))
    return ctx

def c(request):
    ctx = {'kc': 1}
    ctx.update(d(request))
    return ctx

def d(request):
    ctx = {'kd': 1}
    ctx.update(e(request))
    return ctx

def e(request):
    return {'ke': 1}
`);
    const r = resolveHelperKeys(['a'], chain);
    expect(r.direct).toEqual(['ka']);
    expect(r.conditional).toEqual(expect.arrayContaining(['kb', 'kc', 'kd']));
    expect(r.conditional).not.toContain('ke');
  });

  it('cycles terminate via the depth cap', () => {
    const cyclic = extractHelperBodies(`
def a(request):
    ctx = {'ka': 1}
    ctx.update(b(request))
    return ctx

def b(request):
    ctx = {'kb': 1}
    ctx.update(a(request))
    return ctx
`);
    const r = resolveHelperKeys(['a'], cyclic);
    expect(r.direct).toEqual(['ka']);
    expect(r.conditional).toContain('kb');
  });

  it('types: return-dict values with model shapes are inferred', () => {
    const r = resolveHelperKeys(['get_admin_context'], bodies);
    expect(r.types.get('managed_products')).toMatchObject({
      kind: 'queryset',
      model: 'Product',
    });
  });

  it('types from nested helpers merge (view types win is caller concern)', () => {
    const r = resolveHelperKeys(['get_base_context'], bodies);
    expect(r.types.get('managed_products')).toMatchObject({ kind: 'queryset' });
  });
});
