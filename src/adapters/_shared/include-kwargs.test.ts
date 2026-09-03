import { describe, it, expect } from 'vitest';
import { collectIncomingKwargs } from './include-kwargs';
import type { Template, IncludeRef } from '$domain/types/template';

function mkTemplate(filePath: string, relativePath: string, includes: IncludeRef[] = []): Template {
  return { kind: 'template', filePath, relativePath, includes, blocks: [] };
}

const inc = (target: string, kwargs: IncludeRef['kwargs'] = []): IncludeRef => ({
  target,
  line: 1,
  kwargs,
});

describe('collectIncomingKwargs', () => {
  const partial = mkTemplate('/ws/apps/blog/templates/blog/_card.html', 'blog/_card.html');
  const list = mkTemplate('/ws/apps/blog/templates/blog/list.html', 'blog/list.html', [
    inc('blog/_card.html', [{ name: 'item', expr: 'post' }]),
  ]);
  const detail = mkTemplate('/ws/apps/blog/templates/blog/detail.html', 'blog/detail.html', [
    inc('blog/_card.html', [
      { name: 'item', expr: 'post.author' },
      { name: 'flat', expr: "'x'" },
    ]),
  ]);

  it('collects kwargs from every parent that includes the active template', () => {
    const kwargs = collectIncomingKwargs(
      [partial, list, detail],
      '/ws/apps/blog/templates/blog/_card.html',
    );
    expect(kwargs).toHaveLength(3);
    expect(kwargs.map(k => k.name)).toEqual(['item', 'item', 'flat']);
  });

  it('suffix-matches short include targets against the relative path', () => {
    const parent = mkTemplate('/ws/templates/page.html', 'page.html', [
      inc('_card.html', [{ name: 'x', expr: 'obj' }]),
    ]);
    const kwargs = collectIncomingKwargs(
      [partial, parent],
      '/ws/apps/blog/templates/blog/_card.html',
    );
    expect(kwargs).toEqual([{ name: 'x', expr: 'obj' }]);
  });

  it('active document that is not a known template yields nothing', () => {
    expect(collectIncomingKwargs([partial, list], '/elsewhere/foo.html')).toEqual([]);
  });

  it('includes without kwargs and sentinel refs are ignored', () => {
    const parent = mkTemplate('/ws/templates/page.html', 'page.html', [
      inc('blog/_card.html'),
      inc('__url__:home', [{ name: 'n', expr: 'v' }]),
    ]);
    expect(
      collectIncomingKwargs([partial, parent], '/ws/apps/blog/templates/blog/_card.html'),
    ).toEqual([]);
  });
});
