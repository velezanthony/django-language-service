/**
 * Pass 2 folds in context keys from helper functions defined in ANOTHER file.
 *
 * `context.update(build_ctx(request))` where build_ctx is imported is a normal
 * way to share context between views. The parser never sees another file, so
 * every key that helper contributed read as undefined in Live Mode.
 */
import { describe, it, expect } from 'vitest';
import { Scanner } from './scanner';
import { InMemoryFileSystem } from './file-system';
import type { Project } from '$infra/types/project';

const HELPERS = `
def build_ctx(request):
    return {
        'nav_items': nav,
        'site_name': 'Shop',
    }

def unused_helper(request):
    return {
        'never_referenced': 1,
    }
`;

const VIEWS = `
from .helpers import build_ctx

def home(request):
    context = {'page': 'home'}
    context.update(build_ctx(request))
    return render(request, 'shop/home.html', context)
`;

function makeScanner(fs: InMemoryFileSystem) {
  const emitterFactory = () =>
    ({
      event: () => ({ dispose: () => undefined }),
      fire: () => undefined,
      dispose: () => undefined,
    }) as unknown as import('vscode').EventEmitter<Project>;
  return new Scanner({ fs, emitterFactory });
}

async function scan(files: Record<string, string>) {
  const fs = new InMemoryFileSystem();
  let v = 1;
  for (const [path, src] of Object.entries(files)) fs.addFile(path, src, v++);
  return (await makeScanner(fs).scan(['/ws'])).views;
}

const BASE = {
  '/ws/apps/shop/helpers.py': HELPERS,
  '/ws/apps/shop/views.py': VIEWS,
};

const keysOf = async (files: Record<string, string>, name: string): Promise<string[]> => {
  const views = await scan(files);
  const v = views.all().find(x => x.name === name);
  if (!v) throw new Error(`view ${name} missing`);
  return [...v.contextKeys].sort();
};

describe('cross-file context helper', () => {
  it('folds the imported helper keys into the view context', async () => {
    expect(await keysOf(BASE, 'home')).toEqual(['nav_items', 'page', 'site_name']);
  });

  it('exposes them as contextVars so Live Mode stops flagging them', async () => {
    const views = await scan(BASE);
    const home = views.all().find(v => v.name === 'home')!;
    const names = home.contextVars.map(c => c.name).sort();
    expect(names).toEqual(['nav_items', 'page', 'site_name']);
  });

  it('takes only the helper that was called', async () => {
    expect(await keysOf(BASE, 'home')).not.toContain('never_referenced');
  });

  // helpers.py is not in INCLUDE_PATTERNS — pass 1 never globs it, so it must
  // be opened deliberately by following the import.
  it('does not index the helper module as a view file', async () => {
    const views = await scan(BASE);
    expect(
      views
        .all()
        .map(v => v.name)
        .sort(),
    ).toEqual(['home']);
  });

  it('resolves an aliased import', async () => {
    const files = {
      ...BASE,
      '/ws/apps/shop/views.py': `
from .helpers import build_ctx as bc

def home(request):
    context = {'page': 'home'}
    context.update(bc(request))
    return render(request, 'shop/home.html', context)
`,
    };
    expect(await keysOf(files, 'home')).toEqual(['nav_items', 'page', 'site_name']);
  });

  it('leaves the view alone when the import cannot be found', async () => {
    const files = {
      '/ws/apps/shop/views.py': `
from .nowhere import build_ctx

def home(request):
    context = {'page': 'home'}
    context.update(build_ctx(request))
    return render(request, 'shop/home.html', context)
`,
    };
    expect(await keysOf(files, 'home')).toEqual(['page']);
  });

  it('still resolves a same-file helper without going near the filesystem', async () => {
    const files = {
      '/ws/apps/shop/views.py': `
def local_ctx(request):
    return {
        'local_key': 1,
    }

def home(request):
    context = {'page': 'home'}
    context.update(local_ctx(request))
    return render(request, 'shop/home.html', context)
`,
    };
    expect(await keysOf(files, 'home')).toEqual(['local_key', 'page']);
  });
});

// A context builder that dispatches to other builders is the normal shape:
//
//   context = get_base_context(request)      # in another module
//   …which does context.update(get_admin_context(request)) under an if/elif
//
// Taking only the imported helper's own dict dropped every key the branches
// contribute, so they were reported as undefined rather than as conditional.
describe('a cross-file helper that calls other helpers', () => {
  const files = {
    '/ws/apps/core/context.py': `
def get_base_context(request):
    context = {
        'site_name': 'Shop',
    }
    if request.user.is_superuser:
        context.update(get_admin_context(request))
    else:
        context.update(get_customer_context(request))
    return context

def get_admin_context(request):
    return {
        'all_products': 1,
    }

def get_customer_context(request):
    return {
        'order_count': 1,
    }
`,
    '/ws/apps/shop/views.py': `
from apps.core.context import get_base_context

def dashboard(request):
    context = get_base_context(request)
    context['page'] = 'dashboard'
    return render(request, 'shop/dashboard.html', context)
`,
  };

  const varsOf = async () => {
    const views = await scan(files);
    const v = views.all().find(x => x.name === 'dashboard');
    if (!v) throw new Error('view missing');
    return v;
  };

  it('keeps the helper own keys unconditional', async () => {
    const v = await varsOf();
    const plain = v.contextVars
      .filter(c => !c.conditional)
      .map(c => c.name)
      .sort();
    expect(plain).toEqual(['page', 'site_name']);
  });

  // The key IS in the context — just only down one branch. Reporting it as
  // undefined accuses the template of a mistake it did not make.
  it('marks keys from a branch as conditional, not missing', async () => {
    const v = await varsOf();
    const cond = v.contextVars
      .filter(c => c.conditional)
      .map(c => c.name)
      .sort();
    expect(cond).toEqual(['all_products', 'order_count']);
  });

  it('does not put conditional keys in contextKeys', async () => {
    const v = await varsOf();
    expect([...v.contextKeys].sort()).toEqual(['page', 'site_name']);
  });
});
