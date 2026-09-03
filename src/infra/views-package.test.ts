/**
 * Two apps that split their views into packages both survive the scan. They did
 * not: the view index is keyed '<app>.<name>' and both keys came out
 * `views.index`, so one app's view vanished — its template then had no view,
 * which means a false orphan badge and nothing for Live Mode to bind.
 */
import { describe, it, expect } from 'vitest';
import { Scanner } from './scanner';
import { InMemoryFileSystem } from './file-system';
import type { Project } from '$infra/types/project';

async function scan(files: Record<string, string>): Promise<Project> {
  const fs = new InMemoryFileSystem();
  let v = 1;
  for (const [path, src] of Object.entries(files)) fs.addFile(path, src, v++);
  const emitterFactory = () =>
    ({
      event: () => ({ dispose: () => undefined }),
      fire: () => undefined,
      dispose: () => undefined,
    }) as unknown as import('vscode').EventEmitter<Project>;
  return new Scanner({ fs, emitterFactory }).scan(['/ws']);
}

const FILES = {
  '/ws/apps/shop/views/orders.py':
    "def index(request):\n    return render(request, 'shop/orders.html', {})\n",
  '/ws/apps/blog/views/posts.py':
    "def index(request):\n    return render(request, 'blog/posts.html', {})\n",
};

describe('two apps with a views/ package', () => {
  it('keeps both views', async () => {
    const views = (await scan(FILES)).views.all();
    expect(views.map(v => v.templateName).sort()).toEqual(['blog/posts.html', 'shop/orders.html']);
  });

  it('keys them by their own app', async () => {
    const p = await scan(FILES);
    expect(p.views.byKey('shop.index')?.templateName).toBe('shop/orders.html');
    expect(p.views.byKey('blog.index')?.templateName).toBe('blog/posts.html');
  });

  it('leaves nothing under the sub-package name', async () => {
    expect((await scan(FILES)).views.byKey('views.index')).toBeUndefined();
  });
});
