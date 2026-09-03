/**
 * `path('about/', TemplateView.as_view(template_name='pages/about.html'))` is
 * ordinary Django, and there is no function in views.py to find. Nothing linked
 * that template to anything: the sidebar called it an orphan and Live Mode had
 * no view to bind it to — on a template that is very much in use.
 */
import { describe, it, expect } from 'vitest';
import { Scanner } from './scanner';
import { InMemoryFileSystem } from './file-system';
import { computeOrphanTemplates } from '$adapters/file-decoration/orphan-logic';
import type { Project } from '$infra/types/project';

const URLS = `
from django.urls import path
from django.views.generic import TemplateView, RedirectView
from . import views

urlpatterns = [
    path('', views.home, name='home'),
    path('about/', TemplateView.as_view(template_name='pages/about.html'), name='about'),
    path('tos/', TemplateView.as_view(
        template_name='pages/tos.html',
        extra_context={'title': 'Terms', 'updated': '2026'},
    ), name='tos'),
    path('go/', RedirectView.as_view(url='/'), name='go'),
]
`;

const FILES = {
  '/ws/config/urls.py': URLS,
  '/ws/apps/shop/views.py':
    "def home(request):\n    return render(request, 'pages/home.html', {})\n",
  '/ws/templates/pages/about.html': '<h1>About</h1>',
  '/ws/templates/pages/tos.html': '<h1>{{ title }}</h1>',
  '/ws/templates/pages/home.html': '<h1>Home</h1>',
};

async function scan(): Promise<Project> {
  const fs = new InMemoryFileSystem();
  let v = 1;
  for (const [path, src] of Object.entries(FILES)) fs.addFile(path, src, v++);
  const emitterFactory = () =>
    ({
      event: () => ({ dispose: () => undefined }),
      fire: () => undefined,
      dispose: () => undefined,
    }) as unknown as import('vscode').EventEmitter<Project>;
  return new Scanner({ fs, emitterFactory }).scan(['/ws']);
}

describe('a URL conf that renders a template itself', () => {
  it('produces a view for it', async () => {
    const views = (await scan()).views.all();
    expect(views.map(v => v.templateName).sort()).toEqual([
      'pages/about.html',
      'pages/home.html',
      'pages/tos.html',
    ]);
  });

  it('names it after the URL', async () => {
    const v = (await scan()).views.all().find(x => x.templateName === 'pages/about.html');
    expect(v?.name).toBe('about');
  });

  // ContextMixin.get_context_data does kwargs.setdefault("view", self).
  it('gives it the context a TemplateView actually has', async () => {
    const v = (await scan()).views.all().find(x => x.templateName === 'pages/tos.html');
    expect([...v!.contextKeys].sort()).toEqual(['title', 'updated', 'view']);
  });

  it('stops the template being reported as an orphan', async () => {
    const p = await scan();
    const orphans = computeOrphanTemplates(p.templates.all(), p.views.all()).map(t =>
      t.relativePath.split('/').pop(),
    );
    expect(orphans).not.toContain('about.html');
    expect(orphans).not.toContain('tos.html');
  });

  it('invents nothing for a view that renders no template', async () => {
    const views = (await scan()).views.all();
    expect(views.map(v => v.name)).not.toContain('go');
  });
});

describe('URL names the old regex got wrong', () => {
  const names = async () =>
    (await scan()).urls
      .all()
      .map(u => u.name)
      .sort();

  // `name\s*=` also matches the tail of `template_name=`.
  it('does not register a URL under its template path', async () => {
    expect(await names()).toContain('about');
    expect(await names()).not.toContain('pages/about.html');
  });

  // The view group only allowed `as_view()` with EMPTY parens, so the whole
  // entry vanished and {% url %} called the name unknown.
  it('keeps a URL whose as_view() takes arguments', async () => {
    expect(await names()).toContain('go');
  });

  it('still reads the ordinary ones', async () => {
    expect(await names()).toEqual(['about', 'go', 'home', 'tos']);
  });
});
