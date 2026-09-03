import { describe, it, expect } from 'vitest';
import type { Project } from '$infra/types/project';
import {
  buildViewsPayload,
  buildLayoutsPayload,
  buildOrphansPayload,
  buildModelsPayload,
  buildSidebarPayload,
  extractTemplatePath,
} from './sidebar-data';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeIndex(items: any[], keyFn: (item: any) => string) {
  return {
    all: (): readonly any[] => items,

    byKey: (k: string): any => items.find(i => keyFn(i) === k),
    byProperty: (): readonly never[] => [],
    add: (): void => {
      /* no-op */
    },
    invalidate: (): void => {
      /* no-op */
    },
  };
}

function makeProject(overrides: Record<string, unknown> = {}): Project {
  const emptyIdx = makeIndex([], () => '');
  return {
    views: emptyIdx,
    templates: emptyIdx,
    models: emptyIdx,
    forms: emptyIdx,
    migrations: emptyIdx,
    urls: emptyIdx,
    helpers: emptyIdx,
    workspaceFingerprint: 'x',
    scannedAt: 0,
    ...overrides,
  } as unknown as Project;
}

// ── extractTemplatePath ───────────────────────────────────────────────────────

describe('extractTemplatePath', () => {
  it('extracts path after /templates/', () => {
    expect(extractTemplatePath('/workspace/myapp/templates/myapp/index.html')).toBe(
      'myapp/index.html',
    );
  });

  it('uses the LAST /templates/ segment', () => {
    expect(extractTemplatePath('/some/templates/sub/templates/partial.html')).toBe('partial.html');
  });

  it('returns null when no /templates/ segment', () => {
    expect(extractTemplatePath('/workspace/myapp/views.py')).toBeNull();
  });
});

// ── buildViewsPayload ─────────────────────────────────────────────────────────

describe('buildViewsPayload', () => {
  it('returns no-template when project is null', () => {
    const result = buildViewsPayload(null, null);
    expect(result.mode).toBe('no-template');
    expect(result.chainViews).toHaveLength(0);
  });

  it('returns no-template when activeFsPath is not under templates/', () => {
    const project = makeProject();
    const result = buildViewsPayload(project, null, '/workspace/views.py');
    expect(result.mode).toBe('no-template');
  });

  it('includes liveViewKey in result', () => {
    const result = buildViewsPayload(null, 'blog.my_view');
    expect(result.liveViewKey).toBe('blog.my_view');
  });

  it('gives each chain view the QUALIFIED key the scanner indexes by', () => {
    const templates = [
      {
        kind: 'template',
        filePath: '/ws/blog/templates/blog/list.html',
        relativePath: 'blog/list.html',
        includes: [],
        blocks: [],
      },
    ];
    const views = [
      {
        kind: 'view',
        name: 'post_list',
        filePath: '/ws/blog/views.py',
        line: 10,
        isClass: false,
        templateName: 'blog/list.html',
        contextKeys: [],
        contextVars: [],
        decorators: [],
      },
    ];
    const project = makeProject({
      views: makeIndex(views, (v: { name: string }) => v.name),
      templates: makeIndex(templates, (t: { relativePath: string }) => t.relativePath),
    });

    const result = buildViewsPayload(project, null, '/ws/blog/templates/blog/list.html');

    expect(result.mode).toBe('chain');
    expect(result.chainViews).toHaveLength(1);
    // Identity: qualified 'app.name' key (matches project.views.byKey).
    expect(result.chainViews[0]?.view.key).toBe('blog.post_list');
    // Display: bare name stays for the UI label.
    expect(result.chainViews[0]?.view.name).toBe('post_list');
  });

  it('disambiguates same-named views from different apps via key', () => {
    const templates = [
      {
        kind: 'template',
        filePath: '/ws/blog/templates/shared/page.html',
        relativePath: 'shared/page.html',
        includes: [],
        blocks: [],
      },
    ];
    const views = [
      {
        kind: 'view',
        name: 'index',
        filePath: '/ws/blog/views.py',
        line: 1,
        isClass: false,
        templateName: 'shared/page.html',
        contextKeys: [],
        contextVars: [],
        decorators: [],
      },
      {
        kind: 'view',
        name: 'index',
        filePath: '/ws/shop/views.py',
        line: 1,
        isClass: false,
        templateName: 'shared/page.html',
        contextKeys: [],
        contextVars: [],
        decorators: [],
      },
    ];
    const project = makeProject({
      views: makeIndex(views, (v: { name: string; filePath: string }) => `${v.filePath}:${v.name}`),
      templates: makeIndex(templates, (t: { relativePath: string }) => t.relativePath),
    });

    const result = buildViewsPayload(project, null, '/ws/blog/templates/shared/page.html');

    const keys = result.chainViews.map(c => c.view.key);
    expect(keys).toContain('blog.index');
    expect(keys).toContain('shop.index');
  });
});

// ── buildLayoutsPayload ───────────────────────────────────────────────────────

describe('buildLayoutsPayload', () => {
  it('returns empty when project is null', () => {
    const result = buildLayoutsPayload(null);
    expect(result.layouts).toHaveLength(0);
    expect(result.partials).toHaveLength(0);
  });

  it('lists templates that are extended', () => {
    const templates = [
      {
        kind: 'template',
        filePath: '/app/templates/base.html',
        relativePath: 'base.html',
        includes: [],
        blocks: [],
      },
      {
        kind: 'template',
        filePath: '/app/templates/home.html',
        relativePath: 'home.html',
        extends: 'base.html',
        includes: [],
        blocks: [],
      },
    ];
    const project = makeProject({
      templates: makeIndex(templates, (t: { relativePath: string }) => t.relativePath),
    });
    const result = buildLayoutsPayload(project);
    expect(result.layouts).toHaveLength(1);
    expect(result.layouts[0]?.templatePath).toBe('base.html');
    expect(result.layouts[0]?.childCount).toBe(1);
  });
});

// ── buildOrphansPayload ───────────────────────────────────────────────────────

describe('buildOrphansPayload', () => {
  it('returns empty when project is null', () => {
    const result = buildOrphansPayload(null);
    expect(result.orphans).toHaveLength(0);
    expect(result.totalTemplates).toBe(0);
  });

  it('detects orphan templates', () => {
    const templates = [
      {
        kind: 'template',
        filePath: '/app/templates/orphan.html',
        relativePath: 'orphan.html',
        includes: [],
        blocks: [],
      },
      {
        kind: 'template',
        filePath: '/app/templates/used.html',
        relativePath: 'used.html',
        includes: [],
        blocks: [],
      },
    ];
    const views = [
      {
        kind: 'view',
        name: 'HomeView',
        filePath: '/app/views.py',
        line: 1,
        isClass: true,
        templateName: 'used.html',
        contextKeys: [],
        contextVars: [],
        decorators: [],
      },
    ];
    const project = makeProject({
      views: makeIndex(views, (v: { name: string }) => v.name),
      templates: makeIndex(templates, (t: { relativePath: string }) => t.relativePath),
    });
    const result = buildOrphansPayload(project);
    expect(result.totalTemplates).toBe(2);
    expect(result.orphans).toHaveLength(1);
    expect(result.orphans[0]?.templatePath).toBe('orphan.html');
  });
});

// ── buildModelsPayload ────────────────────────────────────────────────────────

describe('buildModelsPayload', () => {
  it('returns empty when project is null', () => {
    const result = buildModelsPayload(null);
    expect(result.totalModels).toBe(0);
    expect(result.topApps).toHaveLength(0);
  });

  it('counts models per app and limits topApps to 5', () => {
    const models = [
      {
        kind: 'model',
        name: 'M1',
        appLabel: 'blog',
        filePath: '',
        line: 1,
        fields: [],
        relations: [],
        properties: [],
      },
      {
        kind: 'model',
        name: 'M2',
        appLabel: 'blog',
        filePath: '',
        line: 2,
        fields: [],
        relations: [],
        properties: [],
      },
      {
        kind: 'model',
        name: 'M3',
        appLabel: 'shop',
        filePath: '',
        line: 3,
        fields: [],
        relations: [],
        properties: [],
      },
    ];
    const project = makeProject({
      models: makeIndex(
        models,
        (m: { appLabel: string; name: string }) => `${m.appLabel}.${m.name}`,
      ),
    });
    const result = buildModelsPayload(project);
    expect(result.totalModels).toBe(3);
    expect(result.totalApps).toBe(2);
    expect(result.topApps[0]?.app).toBe('blog');
    expect(result.topApps[0]?.count).toBe(2);
  });
});

// ── buildSidebarPayload ───────────────────────────────────────────────────────

describe('buildSidebarPayload', () => {
  it('returns the correct section tag', () => {
    const r1 = buildSidebarPayload('models', null);
    expect(r1.section).toBe('models');

    const r2 = buildSidebarPayload('orphans', null);
    expect(r2.section).toBe('orphans');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The Orphans panel and the Explorer badge answer the same question.
//
// They did not. The panel had its own copy of the rule, and that copy compared
// each template's `relativePath` — which for a scanned template holds the
// ABSOLUTE path — against references written as load paths (`shop/base.html`).
// Nothing ever matched, so the panel called every template in the project an
// orphan: the layout three files extend, the partial six include, and the page
// a view renders, all listed alike. A panel that flags everything says nothing.
// ─────────────────────────────────────────────────────────────────────────────
describe('orphans agree with the orphan badge', () => {
  const template = (filePath: string, extendsPath?: string, includes: string[] = []) => ({
    kind: 'template' as const,
    filePath,
    relativePath: filePath,
    includes: includes.map(target => ({ target, line: 1, kwargs: [] })),
    blocks: [],
    ...(extendsPath !== undefined ? { extends: extendsPath } : {}),
  });

  const ROOT = '/ws/apps/shop/templates/shop';
  const templates = [
    template(`${ROOT}/base.html`),
    template(`${ROOT}/_card.html`),
    template(`${ROOT}/list.html`, 'shop/base.html', ['shop/_card.html']),
    template(`${ROOT}/unused.html`),
  ];
  const views = [
    {
      kind: 'view' as const,
      name: 'list',
      filePath: '/ws/apps/shop/views.py',
      line: 1,
      isClass: false,
      templateName: 'shop/list.html',
      contextKeys: [],
      contextVars: [],
      decorators: [],
    },
  ];

  const build = () =>
    buildOrphansPayload({
      templates: { all: () => templates },
      views: { all: () => views },
    } as never);

  it('lists only the template nothing references', () => {
    expect(build().orphans.map(o => o.templatePath)).toEqual(['shop/unused.html']);
  });

  it('does not call an extended layout an orphan', () => {
    expect(build().orphans.map(o => o.file)).not.toContain(`${ROOT}/base.html`);
  });

  it('does not call an included partial an orphan', () => {
    expect(build().orphans.map(o => o.file)).not.toContain(`${ROOT}/_card.html`);
  });

  it('does not call a rendered page an orphan', () => {
    expect(build().orphans.map(o => o.file)).not.toContain(`${ROOT}/list.html`);
  });

  it('still counts every template it scanned', () => {
    expect(build().totalTemplates).toBe(4);
  });

  it('gives each row a path the webview can open', () => {
    for (const row of build().orphans) expect(row.file.startsWith('/')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A SCANNED project, written the way the scanner writes one.
//
// `Template.relativePath` holds the ABSOLUTE path (the field name is a lie the
// type comment owns up to), while every reference a template or a view makes —
// `{% extends %}`, `{% include %}`, `render(..., 'x.html')` — is a Django LOAD
// path such as `shop/base.html`. Any builder that compares one against the
// other matches nothing. Every fixture below is shaped that way on purpose: a
// fixture whose `relativePath` is already a load path cannot catch the bug,
// which is how these two panels shipped broken.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = '/ws/apps/shop/templates/shop';

const tmpl = (
  filePath: string,
  opts: { extends?: string; includes?: string[] } = {},
): Record<string, unknown> => ({
  kind: 'template',
  filePath,
  relativePath: filePath,
  includes: (opts.includes ?? []).map(target => ({ target, line: 1, kwargs: [] })),
  blocks: [],
  ...(opts.extends !== undefined ? { extends: opts.extends } : {}),
});

const aView = (name: string, templateName: string | null): Record<string, unknown> => ({
  kind: 'view',
  name,
  filePath: '/ws/apps/shop/views.py',
  line: 7,
  isClass: false,
  templateName,
  contextKeys: [],
  contextVars: [],
  decorators: [],
});

function scannedProject(templates: unknown[], views: unknown[]): Project {
  return { templates: { all: () => templates }, views: { all: () => views } } as never;
}

// ─────────────────────────────────────────────────────────────────────────────
// The Views chain answers "which views can put THIS file on screen?".
//
// A view reaches a file through three kinds of edge, not one: it renders the
// file itself, it renders a child that `{% extends %}` it, or it renders an
// ancestor that `{% include %}`s it — transitively, any number of hops. Only
// the first worked, so opening a layout or a partial — the files a developer
// most often needs the answer for — showed an empty panel.
// ─────────────────────────────────────────────────────────────────────────────
describe('views chain reaches a view through every reference edge', () => {
  const templates = [
    tmpl(`${ROOT}/base.html`),
    tmpl(`${ROOT}/_badge.html`),
    tmpl(`${ROOT}/_card.html`, { includes: ['shop/_badge.html'] }),
    tmpl(`${ROOT}/list.html`, { extends: 'shop/base.html', includes: ['shop/_card.html'] }),
    tmpl(`${ROOT}/unreferenced.html`),
  ];
  const views = [aView('list', 'shop/list.html')];
  const project = scannedProject(templates, views);

  const keysFor = (fsPath: string): string[] =>
    buildViewsPayload(project, null, fsPath).chainViews.map(c => c.view.key);

  it('reaches the view that renders the open file directly', () => {
    expect(keysFor(`${ROOT}/list.html`)).toEqual(['shop.list']);
  });

  it('reaches the view through an {% extends %} when the open file is the parent', () => {
    expect(keysFor(`${ROOT}/base.html`)).toEqual(['shop.list']);
  });

  it('reaches the view through an {% include %} when the open file is the partial', () => {
    expect(keysFor(`${ROOT}/_card.html`)).toEqual(['shop.list']);
  });

  it('follows an include chain of any depth, not just one hop', () => {
    expect(keysFor(`${ROOT}/_badge.html`)).toEqual(['shop.list']);
  });

  it('reaches no view from a file nothing references', () => {
    expect(keysFor(`${ROOT}/unreferenced.html`)).toEqual([]);
  });

  it("walks from the view's own template down to the open file, in order", () => {
    const chain = buildViewsPayload(project, null, `${ROOT}/_badge.html`).chainViews[0]
      ?.templateChain;
    expect(chain?.[0]).toBe('shop/list.html');
    expect(chain?.at(-1)).toBe('shop/_badge.html');
  });

  it('ends every chain at the open file, whichever edge got there', () => {
    for (const open of ['list.html', 'base.html', '_card.html', '_badge.html']) {
      const payload = buildViewsPayload(project, null, `${ROOT}/${open}`);
      for (const entry of payload.chainViews) {
        expect(entry.templateChain.at(-1)).toBe(payload.currentTemplatePath);
      }
    }
  });

  // The webview looks each chain step up in `templateFiles` and only renders a
  // click target when it finds one. An empty map is a panel of dead rows.
  it('gives every step of every chain an absolute path the webview can open', () => {
    const scanned = new Set(templates.map(t => t['filePath'] as string));
    for (const open of ['list.html', 'base.html', '_card.html', '_badge.html']) {
      const payload = buildViewsPayload(project, null, `${ROOT}/${open}`);
      expect(payload.chainViews.length).toBeGreaterThan(0);
      for (const entry of payload.chainViews) {
        for (const step of entry.templateChain) {
          const file = payload.templateFiles[step];
          expect(file, `no file for chain step ${step} with ${open} open`).toBeDefined();
          expect(scanned.has(file!)).toBe(true);
        }
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// "No template open" and "a template is open that no view renders" are two
// different answers, and the panel has a different empty state for each. The
// builder collapsed both into mode 'no-template', so the second empty state —
// the one that tells the user their file may be dead code — could never render.
//
// The contract the webview reads (ViewsSection.svelte): `mode` says whether a
// TEMPLATE IS OPEN, not whether any view was found. In 'chain' mode
// `currentTemplatePath` and `currentFileName` are non-null, and an empty
// `chainViews` is the "nothing renders this" state.
// ─────────────────────────────────────────────────────────────────────────────
describe('views mode reports whether a template is open, not whether a view was found', () => {
  const templates = [tmpl(`${ROOT}/unreferenced.html`)];
  const project = scannedProject(templates, []);

  it('says no-template when no file is open', () => {
    const p = buildViewsPayload(project, null, undefined);
    expect(p.mode).toBe('no-template');
    expect(p.currentTemplatePath).toBeNull();
  });

  it('says no-template when the open file is not under a template root', () => {
    const p = buildViewsPayload(project, null, '/ws/apps/shop/views.py');
    expect(p.mode).toBe('no-template');
    expect(p.currentTemplatePath).toBeNull();
  });

  it('says chain — with an empty list — when a template is open that no view renders', () => {
    const p = buildViewsPayload(project, null, `${ROOT}/unreferenced.html`);
    expect(p.mode).toBe('chain');
    expect(p.chainViews).toHaveLength(0);
    // The webview types both of these as non-null in chain mode and prints
    // currentFileName in the "No view renders this template" hint.
    expect(p.currentTemplatePath).toBe('shop/unreferenced.html');
    expect(p.currentFileName).toBe('unreferenced.html');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A Layouts row is a click target. `file` must therefore be a path the editor
// can open — the same rule the Orphans panel was fixed to obey. It held a load
// path (`shop/base.html`) because the lookup map was keyed by each template's
// absolute path and queried with a reference, so every lookup missed and the
// `?? tp` fallback handed the reference straight through.
//
// The same miss also invented rows: an `{% extends %}` naming a layout that is
// not in the workspace at all — Django's own admin, a third-party package —
// became a row pointing at a file that does not exist.
// ─────────────────────────────────────────────────────────────────────────────
describe('layout and partial rows point at files that exist', () => {
  const templates = [
    tmpl(`${ROOT}/base.html`),
    tmpl(`${ROOT}/_card.html`),
    tmpl(`${ROOT}/list.html`, {
      extends: 'shop/base.html',
      includes: ['shop/_card.html', 'django/forms/errors.html'],
    }),
    tmpl(`${ROOT}/admin.html`, { extends: 'admin/base_site.html' }),
  ];
  const scanned = new Set(templates.map(t => t['filePath'] as string));
  const build = () => buildLayoutsPayload(scannedProject(templates, []));

  it('gives every layout row a scanned file, not the load path it was named by', () => {
    for (const row of build().layouts) expect(scanned.has(row.file)).toBe(true);
  });

  it('gives every partial row a scanned file, not the load path it was named by', () => {
    for (const row of build().partials) expect(scanned.has(row.file)).toBe(true);
  });

  it('offers no row for a layout that is not in the workspace', () => {
    expect(build().layouts.map(r => r.templatePath)).not.toContain('admin/base_site.html');
  });

  it('offers no row for a partial that is not in the workspace', () => {
    expect(build().partials.map(r => r.templatePath)).not.toContain('django/forms/errors.html');
  });

  it('still lists the layouts and partials that ARE in the workspace', () => {
    expect(build().layouts.map(r => r.templatePath)).toEqual(['shop/base.html']);
    expect(build().partials.map(r => r.templatePath)).toEqual(['shop/_card.html']);
  });

  it('counts every reference to a row it kept', () => {
    expect(build().layouts[0]?.childCount).toBe(1);
    expect(build().partials[0]?.includerCount).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The template index is built once per scan, not once per Alt-Tab.
//
// `buildViewsPayload` runs on every active-editor change, and it walks every
// template to build the reference index. Measured on a synthetic project: 2.5 ms
// at 400 templates, 6.1 at 1600, 17.8 at 3400 — linear, but paid again on every
// tab switch.
//
// `IndexImpl.all()` returns a frozen array that is the SAME object until the
// index changes, which is what makes identity the correct cache key. It is the
// pattern `adapters/_shared/project-graph.ts` already uses for the model graph,
// and its header says why: never build a graph per keystroke.
//
// Counted, not timed: a timing assertion here could not tell a defect from a
// busy machine, which is a mistake this repository has already made.
// ─────────────────────────────────────────────────────────────────────────────
describe('the template index is reused across calls on one scan', () => {
  const template = (name: string) =>
    ({
      kind: 'template' as const,
      filePath: `/ws/apps/shop/templates/shop/${name}`,
      relativePath: `/ws/apps/shop/templates/shop/${name}`,
      includes: [],
      blocks: [],
    }) as never;

  /** The templates array, plus a count of how many times it was walked. */
  const countingProject = (names: string[]) => {
    const list = Object.freeze(names.map(template));
    let walks = 0;
    const watched = new Proxy(list, {
      get(target, prop, receiver) {
        if (prop === Symbol.iterator) walks++;
        return Reflect.get(target, prop, receiver);
      },
    });
    return {
      walks: () => walks,
      project: {
        templates: { all: () => watched },
        views: { all: () => [] },
      } as never,
    };
  };

  it('walks the templates once for two payloads off the same scan', () => {
    const { project, walks } = countingProject(['a.html', 'b.html', 'c.html']);
    buildViewsPayload(project, null, '/ws/apps/shop/templates/shop/a.html');
    const afterFirst = walks();
    buildViewsPayload(project, null, '/ws/apps/shop/templates/shop/b.html');
    expect(walks()).toBe(afterFirst);
  });

  it('walks them again when a new scan hands over a new array', () => {
    const first = countingProject(['a.html']);
    const second = countingProject(['a.html', 'b.html']);
    buildViewsPayload(first.project, null, '/ws/apps/shop/templates/shop/a.html');
    buildViewsPayload(second.project, null, '/ws/apps/shop/templates/shop/a.html');
    expect(second.walks()).toBeGreaterThan(0);
  });

  it('still answers correctly from the cached index', () => {
    const { project } = countingProject(['a.html', 'b.html']);
    const payload = buildViewsPayload(project, null, '/ws/apps/shop/templates/shop/b.html');
    expect(payload.mode).toBe('chain');
    expect(payload.currentFileName).toBe('b.html');
  });
});
