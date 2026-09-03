import { describe, it, expect } from 'vitest';
import type { Template, View } from '$domain/types';
import { computeOrphanTemplates } from './orphan-logic';

// ── Factories ─────────────────────────────────────────────────────────────────

function tmpl(
  relativePath: string,
  opts?: { extends?: string; includes?: readonly string[] },
): Template {
  return {
    kind: 'template',
    filePath: `/ws/${relativePath}`,
    relativePath,
    ...(opts?.extends !== undefined ? { extends: opts.extends } : {}),
    includes: (opts?.includes ?? []).map(target => ({ target, line: 1, kwargs: [] })),
    blocks: [],
  };
}

function view(templateName: string | null): View {
  return {
    kind: 'view',
    name: 'some_view',
    filePath: '/ws/app/views.py',
    line: 1,
    isClass: false,
    templateName,
    contextKeys: [],
    contextVars: [],
    decorators: [],
  };
}

const rels = (ts: readonly Template[]): string[] => ts.map(t => t.relativePath).sort();

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('computeOrphanTemplates', () => {
  it('a parent layout extended by children is NOT an orphan (extends target semantics)', () => {
    const base = tmpl('shop/templates/shop/base.html');
    const detail = tmpl('shop/templates/shop/detail.html', { extends: 'shop/base.html' });
    const orphans = computeOrphanTemplates([base, detail], [view('shop/detail.html')]);

    // base is referenced via the extends TARGET; detail via the view
    expect(rels(orphans)).toEqual([]);
  });

  it('a child that extends a parent but is referenced by nothing IS an orphan', () => {
    const base = tmpl('app/templates/base.html');
    const child = tmpl('app/templates/orphan_child.html', { extends: 'base.html' });
    const orphans = computeOrphanTemplates([base, child], []);

    // Correct semantics: base is referenced (extends target), child is not.
    // The old bug marked the CHILD as referenced and the PARENT as orphan.
    expect(rels(orphans)).toEqual(['app/templates/orphan_child.html']);
  });

  it('include targets are referenced', () => {
    const partial = tmpl('app/templates/partials/nav.html');
    const page = tmpl('app/templates/home.html', { includes: ['partials/nav.html'] });
    const orphans = computeOrphanTemplates([partial, page], [view('home.html')]);

    expect(rels(orphans)).toEqual([]);
  });

  it('templates rendered by a view are referenced', () => {
    const page = tmpl('app/templates/about.html');
    const orphans = computeOrphanTemplates([page], [view('about.html')]);

    expect(rels(orphans)).toEqual([]);
  });

  it('a template with no references at all is an orphan', () => {
    const lonely = tmpl('app/templates/lonely.html');
    const orphans = computeOrphanTemplates([lonely], [view(null)]);

    expect(rels(orphans)).toEqual(['app/templates/lonely.html']);
  });

  it('matches on full relativePath as well as templates/-stripped path', () => {
    // extends target written exactly as the relativePath (no templates/ prefix)
    const base = tmpl('base.html');
    const child = tmpl('child.html', { extends: 'base.html' });
    const orphans = computeOrphanTemplates([base, child], [view('child.html')]);

    expect(rels(orphans)).toEqual([]);
  });
});

// Django's loader strips the template DIRECTORY, and which `templates/` segment
// that is depends on the configured roots. Only the LAST one was tried, so a
// directory that is itself called `templates` never matched its own reference.
describe('a directory called templates inside the template root', () => {
  const tpl = (relativePath: string, includes: string[] = []): Template => ({
    kind: 'template',
    filePath: `/ws/${relativePath}`,
    relativePath,
    includes: includes.map(target => ({ target, line: 1, kwargs: [] })),
    blocks: [],
  });

  const orphans = (templates: Template[]) =>
    computeOrphanTemplates(templates, []).map(t => t.relativePath);

  it('is not an orphan when something includes it', () => {
    expect(
      orphans([
        tpl('apps/a/templates/a/templates/email.html'),
        tpl('apps/a/templates/a/list.html', ['a/templates/email.html']),
      ]),
    ).toEqual(['apps/a/templates/a/list.html']);
  });

  it('still resolves the ordinary layout', () => {
    expect(
      orphans([
        tpl('apps/shop/templates/shop/card.html'),
        tpl('apps/shop/templates/shop/list.html', ['shop/card.html']),
      ]),
    ).toEqual(['apps/shop/templates/shop/list.html']);
  });

  it('and still reports one nothing references', () => {
    expect(orphans([tpl('templates/nobody.html')])).toEqual(['templates/nobody.html']);
  });
});
