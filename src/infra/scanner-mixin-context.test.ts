/**
 * Pass 2 follows a CBV's mixins into the file that defines them.
 *
 * `class V(StatsMixin, TemplateView)` inherits whatever StatsMixin's
 * get_context_data adds, and the view parser never opens mixins.py — so those
 * keys read as undefined in Live Mode.
 *
 * The second half is the noise guard: when the surface is provably partial the
 * view is flagged, because a missing key is then this tool's gap.
 */
import { describe, it, expect } from 'vitest';
import { Scanner } from './scanner';
import { InMemoryFileSystem } from './file-system';
import type { Project } from '$infra/types/project';
import type { View } from '$domain/types/view';

const MIXINS = `
class StatsMixin:
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['stats'] = compute()
        return context

class DeepMixin(StatsMixin):
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['deep'] = 1
        return context
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

async function viewOf(files: Record<string, string>, name: string): Promise<View> {
  const fs = new InMemoryFileSystem();
  let v = 1;
  for (const [path, src] of Object.entries(files)) fs.addFile(path, src, v++);
  const project = await makeScanner(fs).scan(['/ws']);
  const view = project.views.all().find(x => x.name === name);
  if (!view) throw new Error(`view ${name} missing`);
  return view;
}

const keysOf = async (files: Record<string, string>, name: string): Promise<string[]> =>
  [...(await viewOf(files, name)).contextKeys].sort();

describe('mixin defined in another file', () => {
  const files = {
    '/ws/apps/shop/mixins.py': MIXINS,
    '/ws/apps/shop/views.py': `
from django.views.generic import TemplateView
from .mixins import StatsMixin

class Dashboard(StatsMixin, TemplateView):
    template_name = 'shop/dashboard.html'

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['title'] = 'Dashboard'
        return context
`,
  };

  it('folds the mixin keys into the view context', async () => {
    expect(await keysOf(files, 'Dashboard')).toEqual(['stats', 'title']);
  });

  it('walks a mixin that extends another mixin', async () => {
    const deep = {
      ...files,
      '/ws/apps/shop/views.py': `
from django.views.generic import TemplateView
from .mixins import DeepMixin

class Dashboard(DeepMixin, TemplateView):
    template_name = 'shop/dashboard.html'
`,
    };
    expect(await keysOf(deep, 'Dashboard')).toEqual(['deep', 'stats']);
  });

  // Counting framework bases as misses would mark every CBV in the project
  // incomplete, which would silence the feature everywhere.
  it('does not treat a django base as a gap', async () => {
    expect((await viewOf(files, 'Dashboard')).contextIncomplete).toBeUndefined();
  });

  it('flags the view when a project mixin cannot be found', async () => {
    const broken = {
      '/ws/apps/shop/views.py': `
from django.views.generic import TemplateView
from .nowhere import GhostMixin

class Dashboard(GhostMixin, TemplateView):
    template_name = 'shop/dashboard.html'
`,
    };
    expect((await viewOf(broken, 'Dashboard')).contextIncomplete).toBe(true);
  });

  it('resolves a mixin defined in the view file itself', async () => {
    const sameFile = {
      '/ws/apps/shop/views.py': `
from django.views.generic import TemplateView

class LocalMixin:
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['local'] = 1
        return context

class Dashboard(LocalMixin, TemplateView):
    template_name = 'shop/dashboard.html'
`,
    };
    // The mixin is itself parsed as a CBV, so its keys are already on it; the
    // view inherits them through the same-file class body.
    const view = await viewOf(sameFile, 'Dashboard');
    expect(view.contextIncomplete).toBeUndefined();
  });
});

describe('the noise guard', () => {
  it('flags a view that merges a dict it cannot read', async () => {
    const files = {
      '/ws/apps/shop/views.py': `
def home(request):
    context = {'page': 'home'}
    context.update(request.session['prefs'])
    return render(request, 'shop/home.html', context)
`,
    };
    const view = await viewOf(files, 'home');
    expect(view.contextIncomplete).toBe(true);
    expect([...view.contextKeys]).toEqual(['page']);
  });

  it('flags a spread of something built elsewhere', async () => {
    const files = {
      '/ws/apps/shop/views.py': `
def home(request):
    context = {**get_defaults(), 'page': 'home'}
    return render(request, 'shop/home.html', context)
`,
    };
    expect((await viewOf(files, 'home')).contextIncomplete).toBe(true);
  });

  // A view whose context is fully read must NOT be flagged, or the guard
  // softens every diagnostic in the project and the feature stops meaning
  // anything.
  it('leaves a fully-read view unflagged', async () => {
    const files = {
      '/ws/apps/shop/views.py': `
def home(request):
    context = {'page': 'home'}
    context['extra'] = 1
    return render(request, 'shop/home.html', context)
`,
    };
    const view = await viewOf(files, 'home');
    expect(view.contextIncomplete).toBeUndefined();
    expect([...view.contextKeys].sort()).toEqual(['extra', 'page']);
  });

  it('clears the flag once the imported helper is found', async () => {
    const files = {
      '/ws/apps/shop/helpers.py': `
def build_ctx(request):
    return {
        'nav': 1,
    }
`,
      '/ws/apps/shop/views.py': `
from .helpers import build_ctx

def home(request):
    context = {'page': 'home'}
    context.update(build_ctx(request))
    return render(request, 'shop/home.html', context)
`,
    };
    const view = await viewOf(files, 'home');
    expect(view.contextIncomplete).toBeUndefined();
    expect([...view.contextKeys].sort()).toEqual(['nav', 'page']);
  });
});
