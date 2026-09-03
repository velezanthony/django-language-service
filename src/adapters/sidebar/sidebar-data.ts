/**
 * Pure sidebar payload builders — no vscode import.
 *
 * Each builder takes a `Project` snapshot (or null when the scanner hasn't
 * finished yet) and returns a strongly-typed payload that
 * `SidebarWebviewProvider.setData` sends as
 * `webview.postMessage({ type: 'data', payload })`. There is no `section`
 * field on the wire — one bundle serves all four views and routes on the
 * `data-section` attribute the provider stamps on `<body>`.
 */

import type { Project } from '$infra/types';
import type { Template } from '$domain/types';
import { computeOrphanTemplates } from '$adapters/file-decoration/orphan-logic';
import { innermostLoadPath, templateLoadPaths } from '$domain/parsers/_shared/template-load-path';
import { viewKey } from '$infra/view-key';

// ── Section payload types ─────────────────────────────────────────────────────

export interface ViewLeaf {
  /** Qualified index key `'<app>.<name>'` — the identity used by
   *  `project.views.byKey()` and the Live Mode toggle. */
  readonly key: string;
  /** Bare view name — display only. */
  readonly name: string;
  /** 'fbv' = function-based, 'cbv' = class-based */
  readonly type: 'fbv' | 'cbv';
  readonly file: string;
  readonly line: number;
  readonly templateName: string | null;
}

export interface ViewsPayload {
  readonly mode: 'no-template' | 'chain';
  /** Active template path (only set in 'chain' mode) */
  readonly currentTemplatePath: string | null;
  readonly currentFileName: string | null;
  /** Views that can reach the active template */
  readonly chainViews: ReadonlyArray<{
    readonly view: ViewLeaf;
    readonly templateChain: readonly string[];
  }>;
  /** templatePath → absoluteFilePath, for click-to-open in webview */
  readonly templateFiles: Readonly<Record<string, string>>;
  /** Qualified key of the view with Live Mode active (matches ViewLeaf.key). */
  readonly liveViewKey: string | null;
}

export interface LayoutsPayload {
  readonly layouts: ReadonlyArray<{
    readonly templatePath: string;
    readonly file: string;
    readonly childCount: number;
  }>;
  readonly partials: ReadonlyArray<{
    readonly templatePath: string;
    readonly file: string;
    readonly includerCount: number;
  }>;
}

export interface OrphansPayload {
  readonly orphans: ReadonlyArray<{
    readonly templatePath: string;
    readonly file: string;
  }>;
  readonly totalTemplates: number;
}

export interface ModelLeaf {
  readonly name: string;
  readonly file: string;
  readonly line: number;
  readonly fieldCount: number;
}

export interface ModelsPayload {
  readonly totalModels: number;
  readonly totalApps: number;
  readonly topApps: ReadonlyArray<{ readonly app: string; readonly count: number }>;
  /** Models grouped by app, for the navigable tree (click → open models.py). */
  readonly apps: ReadonlyArray<{
    readonly app: string;
    readonly count: number;
    readonly models: ReadonlyArray<ModelLeaf>;
  }>;
}

export type SidebarSection = 'views' | 'layouts' | 'orphans' | 'models';

export type SidebarPayload =
  | { readonly section: 'views'; readonly data: ViewsPayload }
  | { readonly section: 'layouts'; readonly data: LayoutsPayload }
  | { readonly section: 'orphans'; readonly data: OrphansPayload }
  | { readonly section: 'models'; readonly data: ModelsPayload };

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extract the templates/-relative path from an absolute fs path.
 *  Returns null when the file isn't under any templates/ root. */
export function extractTemplatePath(fsPath: string): string | null {
  // An ABSOLUTE path, so the innermost root — see innermostLoadPath for why
  // this differs from the orphan reader, which is handed a relative one.
  return innermostLoadPath(fsPath);
}

/**
 * A scanned template, addressed the way the rest of the project addresses it.
 *
 * There are TWO vocabularies in play and they do not overlap. The scanner
 * stores absolute paths (`Template.relativePath` holds the same value as
 * `filePath` — the field name predates the decision). Everything that REFERS
 * to a template — `{% extends %}`, `{% include %}`, `view.templateName` —
 * writes a Django load path such as `shop/base.html`. Comparing a stored path
 * to a reference matches nothing, which is precisely what broke the Views
 * chain, the Layouts click targets and, before them, the Orphans panel.
 *
 * So: every template gets ONE canonical id (its load path), and a reference is
 * translated into that id before anything is compared.
 */
interface TemplateIndex {
  /** Canonical id → the template it names. */
  readonly byId: ReadonlyMap<string, Template>;
  /** The canonical id a reference names, or null when nothing scanned answers
   *  to it — a layout from Django itself or from an installed package. */
  resolve(reference: string): string | null;
  /** id → the ids of the templates that name it, by extends or include.
   *  Derived from the same walk, and cached with it: it depends on the scan,
   *  never on which file happens to be open. */
  readonly referencedBy: ReadonlyMap<string, readonly string[]>;
}

/** The one id a template is known by: its load path, matching the Orphans panel. */
const canonicalId = (tmpl: Template): string =>
  innermostLoadPath(tmpl.filePath) ?? tmpl.relativePath;

/** Every spelling a reference could use for this template. The absolute path is
 *  included because a stored path is a legal way to name one internally, and
 *  every `templates/` root is tried because which one applies depends on
 *  settings this tool does not read. */
const referenceSpellings = (tmpl: Template): string[] => [
  tmpl.relativePath,
  tmpl.filePath,
  ...templateLoadPaths(tmpl.relativePath),
  ...templateLoadPaths(tmpl.filePath),
];

/**
 * One index per scan, not one per active-editor change.
 *
 * `buildViewsPayload` runs every time the user switches tab, and building the
 * index walks every template twice. Measured on a synthetic project: 2.5 ms at
 * 400 templates, 6.1 at 1600, 17.8 at 3400 — linear, and paid again on every
 * Alt-Tab.
 *
 * `IndexImpl.all()` returns a frozen array that is the SAME object until the
 * index changes, so identity is the correct key: same scan → same index, new
 * scan → the entry for the old array is collected with it. This is the pattern
 * `adapters/_shared/project-graph.ts` uses for the model graph, and its header
 * gives the reason in four words: never build one per keystroke.
 */
const indexCache = new WeakMap<readonly Template[], TemplateIndex>();

function indexTemplates(templates: readonly Template[]): TemplateIndex {
  const memo = indexCache.get(templates);
  if (memo) return memo;

  const byId = new Map<string, Template>();
  const idBySpelling = new Map<string, string>();

  for (const tmpl of templates) {
    const id = canonicalId(tmpl);
    // First one wins on a collision: two roots can hold the same load path, and
    // silently swapping which file the row opens would be worse than picking one.
    if (!byId.has(id)) byId.set(id, tmpl);
    for (const spelling of referenceSpellings(tmpl)) {
      if (!idBySpelling.has(spelling)) idBySpelling.set(spelling, id);
    }
  }

  const resolve = (reference: string): string | null => idBySpelling.get(reference) ?? null;

  const referencedBy = new Map<string, string[]>();
  for (const tmpl of templates) {
    const from = canonicalId(tmpl);
    const references = [
      ...(tmpl.extends === undefined ? [] : [tmpl.extends]),
      ...tmpl.includes.map(inc => inc.target),
    ];
    for (const reference of references) {
      const to = resolve(reference);
      if (to === null || to === from) continue;
      const referrers = referencedBy.get(to) ?? [];
      if (!referrers.includes(from)) referrers.push(from);
      referencedBy.set(to, referrers);
    }
  }

  const index: TemplateIndex = { byId, resolve, referencedBy };
  indexCache.set(templates, index);
  return index;
}

/** The canonical id of the open file, or null when it is not a template.
 *  A scanned file is addressed by its index id; an unscanned one — a template
 *  the scanner has not reached yet — still gets its load path, so a view bound
 *  directly to it is found. */
function activeTemplateId(index: TemplateIndex, activeFsPath: string | undefined): string | null {
  if (!activeFsPath) return null;
  return index.resolve(activeFsPath.replace(/\\/g, '/')) ?? extractTemplatePath(activeFsPath);
}

// ── Builders ──────────────────────────────────────────────────────────────────

export function buildViewsPayload(
  project: Project | null,
  liveViewKey: string | null,
  activeFsPath?: string,
): ViewsPayload {
  const noTemplate: ViewsPayload = {
    mode: 'no-template',
    currentTemplatePath: null,
    currentFileName: null,
    chainViews: [],
    templateFiles: {},
    liveViewKey,
  };

  if (!project) return noTemplate;

  const templates = project.templates.all();
  const index = indexTemplates(templates);
  const activeId = activeTemplateId(index, activeFsPath);
  if (activeId === null) return noTemplate;

  const chainTo = chainsFrom(activeId, index);

  const chainViews: ViewsPayload['chainViews'][number][] = [];
  const templateFiles: Record<string, string> = {};

  for (const view of project.views.all()) {
    if (!view.templateName) continue;
    // An unscanned template still answers to the name a view gave it, so a
    // view bound directly to a file the scanner has not indexed is not lost.
    const renderedId = index.resolve(view.templateName) ?? view.templateName;
    const templateChain = chainTo.get(renderedId);
    if (!templateChain) continue;

    for (const step of templateChain) {
      const file = index.byId.get(step)?.filePath;
      // Without this the webview has no path for the row and the click is dead.
      if (file !== undefined) templateFiles[step] = file;
    }

    chainViews.push({
      view: {
        key: viewKey(view),
        name: view.name,
        type: view.isClass ? 'cbv' : 'fbv',
        file: view.filePath,
        line: view.line,
        templateName: view.templateName,
      },
      templateChain,
    });
  }

  // Stable order: the webview highlights chainViews[0], and index order is
  // whatever the scanner happened to finish first.
  chainViews.sort((a, b) => a.view.key.localeCompare(b.view.key));

  const currentFileName = activeFsPath?.replace(/\\/g, '/').split('/').pop() ?? activeId;

  return {
    // 'chain' means A TEMPLATE IS OPEN — not that a view was found. The two are
    // different answers and the panel has a different empty state for each;
    // collapsing "nothing renders this file" into 'no-template' told the user
    // to open a template while they had one open, and left the "may be dead
    // code" hint unreachable.
    mode: 'chain',
    currentTemplatePath: activeId,
    currentFileName,
    chainViews,
    templateFiles,
    liveViewKey,
  };
}

/**
 * For every template that can put `activeId` on screen, the path it takes to
 * get there — starting at that template and ending at the open file.
 *
 * A view reaches a file through three kinds of edge and the panel must follow
 * all of them, transitively: the view renders the file, renders a child that
 * `{% extends %}` it, or renders an ancestor that `{% include %}`s it. Walking
 * only the direct binding left the two cases a developer opens a layout or a
 * partial to ask about.
 *
 * Breadth-first, so each template gets the SHORTEST route to the open file, and
 * `visited` keeps a cyclic include from looping.
 */
/**
 * Every template that reaches `activeId`, and the shortest route each takes.
 *
 * The reverse graph it walks lives on the index, because it is a fact about the
 * SCAN and not about which file is open — rebuilding it per active-editor
 * change is what cost 17.8 ms per Alt-Tab on a 3400-template project.
 */
function chainsFrom(activeId: string, index: TemplateIndex): Map<string, readonly string[]> {
  const chains = new Map<string, readonly string[]>([[activeId, [activeId]]]);
  const queue: string[] = [activeId];
  for (let at = 0; at < queue.length; at++) {
    const current = queue[at]!;
    const chain = chains.get(current)!;
    for (const referrer of index.referencedBy.get(current) ?? []) {
      if (chains.has(referrer)) continue;
      chains.set(referrer, [referrer, ...chain]);
      queue.push(referrer);
    }
  }
  return chains;
}

export function buildLayoutsPayload(project: Project | null): LayoutsPayload {
  if (!project) return { layouts: [], partials: [] };

  const templates = project.templates.all();
  const index = indexTemplates(templates);

  // Counted against the canonical id, never against the reference as written.
  // The old lookup was keyed by each template's stored (absolute) path and
  // queried with a load path, so it missed every time and the `?? tp` fallback
  // put `shop/base.html` in a `file` field the webview opens as a filesystem
  // path — the click did nothing.
  const extendedBy = new Map<string, number>();
  const includedBy = new Map<string, number>();

  for (const tmpl of templates) {
    if (tmpl.extends !== undefined) count(extendedBy, index.resolve(tmpl.extends));
    for (const inc of tmpl.includes) count(includedBy, index.resolve(inc.target));
  }

  // A reference that resolves to nothing names a template outside the
  // workspace — Django's own admin, a template shipped by a package. It is a
  // real dependency but not a row: the row is a click target, and there is no
  // file here to open.
  const rows = <T>(
    counts: Map<string, number>,
    make: (templatePath: string, file: string, n: number) => T,
  ): T[] =>
    Array.from(counts.entries())
      .flatMap(([id, n]) => {
        const tmpl = index.byId.get(id);
        return tmpl === undefined ? [] : [{ id, file: tmpl.filePath, n }];
      })
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(row => make(row.id, row.file, row.n));

  return {
    layouts: rows(extendedBy, (templatePath, file, childCount) => ({
      templatePath,
      file,
      childCount,
    })),
    partials: rows(includedBy, (templatePath, file, includerCount) => ({
      templatePath,
      file,
      includerCount,
    })),
  };
}

/** Tally one reference against the template it resolved to, if it resolved. */
function count(counts: Map<string, number>, id: string | null): void {
  if (id === null) return;
  counts.set(id, (counts.get(id) ?? 0) + 1);
}

export function buildOrphansPayload(project: Project | null): OrphansPayload {
  if (!project) return { orphans: [], totalTemplates: 0 };

  const templates = project.templates.all();
  const views = project.views.all();

  // The same reader the Explorer badge uses, rather than a second copy of the
  // rule. The copy that lived here compared each template's `relativePath`
  // against the reference set — but for a scanned template that field holds the
  // ABSOLUTE path, while a reference is a load path like `shop/base.html`. The
  // two never matched, so the panel called EVERY template in the project an
  // orphan: a layout three files extend, a partial six include, and the page a
  // view renders, all flagged alike. `computeOrphanTemplates` compares against
  // every load path a reference could name, which is the question being asked.
  const orphans = computeOrphanTemplates(templates, views)
    .map(tmpl => ({
      templatePath: innermostLoadPath(tmpl.filePath) ?? tmpl.relativePath,
      file: tmpl.filePath,
    }))
    .sort((a, b) => a.templatePath.localeCompare(b.templatePath));

  return { orphans, totalTemplates: templates.length };
}

export function buildModelsPayload(project: Project | null): ModelsPayload {
  if (!project) return { totalModels: 0, totalApps: 0, topApps: [], apps: [] };

  const models = project.models.all();
  const byApp = new Map<string, ModelLeaf[]>();
  for (const m of models) {
    const app = m.appLabel ?? 'app';
    const arr = byApp.get(app) ?? [];
    arr.push({ name: m.name, file: m.filePath, line: m.line, fieldCount: m.fields.length });
    byApp.set(app, arr);
  }

  const apps = Array.from(byApp.entries())
    .map(([app, ms]) => ({
      app,
      count: ms.length,
      models: ms.slice().sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => b.count - a.count || a.app.localeCompare(b.app));

  const topApps = apps.slice(0, 5).map(a => ({ app: a.app, count: a.count }));

  return {
    totalModels: models.length,
    totalApps: byApp.size,
    topApps,
    apps,
  };
}

/** Build the typed payload for a given section. */
export function buildSidebarPayload(
  section: SidebarSection,
  project: Project | null,
  liveViewKey: string | null = null,
  activeFsPath?: string,
): SidebarPayload {
  switch (section) {
    case 'views':
      return { section, data: buildViewsPayload(project, liveViewKey, activeFsPath) };
    case 'layouts':
      return { section, data: buildLayoutsPayload(project) };
    case 'orphans':
      return { section, data: buildOrphansPayload(project) };
    case 'models':
      return { section, data: buildModelsPayload(project) };
  }
}
