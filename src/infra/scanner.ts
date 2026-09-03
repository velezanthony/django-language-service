/**
 * Scanner — orchestrates the two-pass Django workspace scan.
 *
 * Pass 1: glob → route by basename → cache-or-parse → typed arrays → IndexImpl
 * Pass 2: cross-file resolution (choices, template links, URL refs)
 *
 * vscode import is LIMITED to EventEmitter and Event only; all other I/O goes
 * through the injected FileSystem port. `src/architecture.test.ts` holds the
 * wider version of that rule for the whole domain layer.
 *
 * This header used to carry "LOC budget: < 600". The file is well past that and
 * nothing ever measured it, so it was a number that only told the reader the
 * budget had been abandoned. A limit worth having is a limit something checks.
 */

import type { EventEmitter, Event } from 'vscode';
import { viewsFromUrlConf } from '$domain/view-context/url-conf-views';
import type { FileSystem } from './file-system';
import { ParseCache } from './cache';
import { buildExcludeGlobs, resolveExcludeSegments } from './exclude-paths';
import type { Choice } from '$domain/types/choice';
import {
  candidateModulePaths,
  collectChoiceSymbols,
  parseChoiceImports,
  parseImportBindings,
} from '$domain/parsers/_shared/choice-imports';
import type { ImportBinding } from '$domain/parsers/_shared/choice-imports';
import {
  resolveModelChoices,
  unresolvedSymbolsOf,
} from '$domain/parsers/_shared/resolve-model-choices';
import { applyInheritance } from '$domain/parsers/_shared/model-inheritance';
import { extractHelperBodies, resolveHelperKeys } from '$domain/view-context/helper-keys';
import { extractClassContexts } from '$domain/view-context/class-context';
/** Mixin chains are shallow in practice; the cap also terminates cycles. */
const MAX_MIXIN_DEPTH = 4;
import type { ClassContext } from '$domain/view-context/class-context';
import type { HelperBody } from '$domain/view-context/helper-keys';
import {
  isSwappableUserRef,
  parseAuthUserModel,
  findUserModelByBases,
  resolveSwappableUserRefs,
} from '$domain/parsers/_shared/user-model';
import { IndexImpl } from './index-impl';
import { appLabelFromPath, owningRoot, qualifiedAppLabel, viewKey } from './view-key';

import type { Project } from '$infra/types/project';
import type { Model } from '$domain/types/model';
import type { View } from '$domain/types/view';
import type { Form } from '$domain/types/form';
import type { Migration } from '$domain/types/migration';
import type { Template, IncludeRef } from '$domain/types/template';
import type { Url } from '$domain/types/url';
import type { Helper } from '$domain/types/helper';
import type { ParserOpts } from '$domain/contracts/parser';

import {
  parseModels,
  parseViews,
  parseForms,
  parseUrls,
  parseMigrations,
  parseHelpers,
  parseTemplate,
} from '$domain/parsers';

// ── Glob patterns ─────────────────────────────────────────────────────────────

/**
 * The only files this extension ever indexes.
 *
 * Exported because the file watcher MUST watch exactly this set and nothing
 * more: watching `**​/*.py` means every write inside an in-workspace `.venv`
 * or `site-packages` triggers a full rescan. That is merely wasteful on a
 * laptop and genuinely painful in a devcontainer, where the workspace is a
 * bind mount. See `watcher.ts` → `buildWatchGlobs`.
 */
export const INCLUDE_PATTERNS = [
  '**/models.py',
  '**/views.py',
  '**/views/**/*.py',
  '**/forms.py',
  '**/urls.py',
  '**/migrations/*.py',
  '**/helpers.py',
  // Django's own convention for custom tag libraries, and the only place it
  // loads them from. `{% load shop_tags %}` names this module.
  '**/templatetags/*.py',
  '**/templates/**/*.html',
  '**/templates/**/*.txt',
] as const;

// ── ParserRegistry ────────────────────────────────────────────────────────────

/**
 * All parsers the Scanner may call, typed to their actual function signatures.
 * Fully injectable for tests via ScannerOpts.parsers.
 */
export interface ParserRegistry {
  readonly models: typeof parseModels;
  readonly views: typeof parseViews;
  readonly forms: typeof parseForms;
  readonly urls: typeof parseUrls;
  readonly migrations: typeof parseMigrations;
  readonly helpers: typeof parseHelpers;
  readonly template: typeof parseTemplate;
}

const DEFAULT_PARSERS: ParserRegistry = {
  models: parseModels,
  views: parseViews,
  forms: parseForms,
  urls: parseUrls,
  migrations: parseMigrations,
  helpers: parseHelpers,
  template: parseTemplate,
};

// ── ScannerOpts ───────────────────────────────────────────────────────────────

/**
 * The largest file the scanner will read and parse, in bytes.
 *
 * Four megabytes is far above any hand-written `models.py`, `urls.py` or
 * template — the largest file in this repository's own Django fixture is three
 * orders of magnitude smaller — and far below the size at which reading a file
 * whole starts to matter on the extension host.
 */
export const MAX_PARSED_FILE_BYTES = 4_000_000;

export interface ScannerOpts {
  readonly fs: FileSystem;
  readonly cache?: ParseCache<unknown>;
  readonly parsers?: Partial<ParserRegistry>;
  readonly logger?: { warn(msg: string): void };
  /** Directory segments never scanned. Defaults to DEFAULT_EXCLUDE_SEGMENTS;
   *  the composition root passes the user's `djangoLanguageService.excludePaths`. */
  readonly excludeSegments?: readonly string[] | undefined;
  /** Injected EventEmitter factory — allows stubbing in tests without a vscode runtime. */
  readonly emitterFactory?: () => EventEmitter<Project>;
}

// ── Routing ───────────────────────────────────────────────────────────────────

/**
 * How many files pass1 has in flight at once.
 *
 * It used to be all of them: `Promise.all(files.map(…))` over the whole glob,
 * two I/O calls each, so peak memory and peak descriptor count grew with the
 * project instead of with the concurrency. A few dozen is enough to saturate a
 * disk, and the same number is what keeps a Remote-SSH round trip busy.
 */
const PASS1_CONCURRENCY = 48;

/** Shared empty set — a default argument must not allocate per call. */
const EMPTY_SET: ReadonlySet<string> = new Set<string>();

/** Run `work` over `items`, never more than `limit` at a time. */
async function pooled<T>(
  items: readonly T[],
  limit: number,
  work: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const worker = async (): Promise<void> => {
    for (let i = next++; i < items.length; i = next++) {
      await work(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/**
 * Bases Django ships and `applyInheritance` already merges from its own mirror
 * of them (see `DJANGO_BASES` in `_shared/model-inheritance.ts`).
 *
 * `models.Model` is on every model in every Django project, so pass 2's
 * cross-file inheritance step wanted it on every file — and "wanted" is what
 * decides whether the file is opened again to parse its imports. The import can
 * never resolve, because the class is in site-packages and the scanner does not
 * read site-packages; the read was pure cost, once per `models.py`, on every
 * pass. Naming them here is a duplication of that mirror, and the cheaper kind:
 * a name missing from this set costs one wasted read, not a wrong answer.
 */
const DJANGO_PROVIDED_BASES: ReadonlySet<string> = new Set([
  'Model',
  'AbstractBaseUser',
  'AbstractUser',
  'PermissionsMixin',
]);

type RouteKind = 'models' | 'views' | 'forms' | 'urls' | 'migrations' | 'helpers' | 'template';

function routeFile(filePath: string): RouteKind | null {
  const base = filePath.split('/').pop() ?? '';

  // migrations/*.py — check before models.py to avoid collision on basename alone
  if (base.endsWith('.py') && filePath.includes('/migrations/')) return 'migrations';

  if (base === 'models.py') return 'models';
  if (base === 'views.py') return 'views';
  if (base === 'forms.py') return 'forms';
  if (base === 'urls.py') return 'urls';
  if (base === 'helpers.py') return 'helpers';

  // templatetags/*.py — the library name is the module name, which deriveLibrary
  // takes from the basename. Checked before the views/ rule so an app that keeps
  // its tag library under a views package still routes as a helper.
  if (base.endsWith('.py') && filePath.includes('/templatetags/')) return 'helpers';

  // views/**/*.py — any .py under a views/ folder
  if (base.endsWith('.py') && /\/views\//.test(filePath)) return 'views';

  // templates/**/*.{html,txt}
  if (base.endsWith('.html') || base.endsWith('.txt')) return 'template';

  return null;
}

// ── Mutable project accumulator ───────────────────────────────────────────────

interface MutableAccumulator {
  models: Model[];
  views: View[];
  forms: Form[];
  migrations: Migration[];
  templates: Template[];
  urls: Url[];
  helpers: Helper[];
}

// appLabelFromPath / viewKey moved to ./view-key (shared with the sidebar
// payload builder + live-mode commands so the qualified key never drifts
// from what this scanner indexes by).

// ── Scanner ───────────────────────────────────────────────────────────────────

export class Scanner {
  private readonly fs: FileSystem;
  private readonly cache: ParseCache<unknown>;
  private readonly parsers: ParserRegistry;
  private readonly logger: { warn(msg: string): void };
  private readonly excludeGlobs: readonly string[];
  private readonly emitter: EventEmitter<Project>;

  /** vscode.Event<Project> — fires after every scan and every invalidateBatch. */
  readonly onDidChange: Event<Project>;

  constructor(opts: ScannerOpts) {
    this.fs = opts.fs;

    this.cache = (opts.cache ?? new ParseCache()) as ParseCache<unknown>;

    this.parsers = { ...DEFAULT_PARSERS, ...opts.parsers };
    this.logger = opts.logger ?? { warn: () => undefined };
    this.excludeGlobs = buildExcludeGlobs(resolveExcludeSegments(opts.excludeSegments));

    // EventEmitter: prefer injected factory (tests avoid vscode runtime dependency).
    // At runtime the extension host provides vscode, so we lazy-require it.
    if (opts.emitterFactory) {
      this.emitter = opts.emitterFactory();
    } else {
      // At runtime inside the VS Code extension host `vscode` is always available.
      // We use a dynamic import so the module can be loaded in unit-test environments
      // that mock or stub vscode. Callers that run outside the extension host MUST
      // supply emitterFactory.
      /* eslint-disable @typescript-eslint/no-require-imports */

      const VE = (require('vscode') as typeof import('vscode')).EventEmitter;
      /* eslint-enable @typescript-eslint/no-require-imports */
      this.emitter = new VE<Project>();
    }

    this.onDidChange = this.emitter.event;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Full scan: glob → parse (cached) → build indexes → cross-file resolve → emit.
   * Returns the immutable Project snapshot.
   */
  async scan(roots: readonly string[]): Promise<Project> {
    return this.enqueue(async () => {
      const acc = await this.pass1(roots);
      const project = await this.pass2(acc);
      this.emitter.fire(project);
      return project;
    });
  }

  /**
   * Invalidate a single path, re-parse it, and emit a new Project.
   *
   * Structural, and it has to be: a caller holding one path cannot tell a save
   * from a create, and `structural` defaults to false, so a file that did not
   * exist at the last glob could never enter the index through here — the pass
   * reused `_lastFiles`, which does not contain it, and the emitted Project was
   * the old one. Nothing caught it because the only production caller,
   * `DebouncedWatcher`, passes the flag itself and never comes through this
   * door. The next caller would have walked straight into it.
   *
   * Callers that KNOW the batch is content-only should say so by calling
   * `invalidateBatch(paths, { structural: false })`, which is what buys the
   * cheap pass.
   */
  async invalidate(path: string): Promise<void> {
    await this.invalidateBatch([path], { structural: true });
  }

  /**
   * Invalidate multiple paths in one batch, re-scan them, re-resolve, and emit once.
   */
  async invalidateBatch(
    paths: readonly string[],
    /**
     * `structural: true` when the batch includes a create or a delete, so the
     * file list has to be rebuilt. The watcher knows which of its three events
     * fired; the scanner cannot tell from a path alone.
     */
    opts: { readonly structural?: boolean } = {},
  ): Promise<void> {
    // Evict from cache
    for (const p of paths) {
      this.cache.invalidate(p);
    }

    // We re-scan from scratch with the same roots stored in the last scan.
    // Because the cache is warm for all untouched files, only the invalidated
    // paths will actually be parsed again.
    if (this._lastRoots.length === 0) return;

    for (const p of paths) this._pendingPaths.add(p);
    // Sticky until a pass consumes it: two batches can coalesce into one run,
    // and if either was structural that run must re-glob.
    if (opts.structural) this._pendingStructural = true;

    await this.enqueue(async () => {
      // Coalescing: a run that started after these paths were evicted has
      // already re-read them, because a pass re-parses everything stale over a
      // warm cache. Redundant queued runs would only repeat that work.
      if (this._pendingPaths.size === 0) return;
      const dirty = new Set(this._pendingPaths);
      this._pendingPaths.clear();
      const structural = this._pendingStructural;
      this._pendingStructural = false;

      const acc = await this.pass1(this._lastRoots, structural, dirty);
      const project = await this.pass2(acc);
      this.emitter.fire(project);
    });
  }

  // ── Private state ───────────────────────────────────────────────────────────

  private _lastRoots: readonly string[] = [];

  /**
   * Serialises every pass. The watcher fires `invalidateBatch` without
   * awaiting it, so batches genuinely arrive while a pass is running — and
   * pass2 `clear()`s caches that a concurrent pass2 is still filling, so two
   * in flight could corrupt each other's resolution and publish the older
   * snapshot last. There was no queue here; the watcher's comment said there
   * was.
   */
  private _queue: Promise<unknown> = Promise.resolve();

  /** Paths evicted but not yet covered by a completed pass. */
  private readonly _pendingPaths = new Set<string>();

  /** The globbed file list from the last structural pass — see pass1. */
  private _lastFiles: readonly string[] | undefined;

  /** A queued batch reported a create or delete. */
  private _pendingStructural = false;

  /**
   * The stat the last full sweep took of each file.
   *
   * The parse cache is keyed `(path, mtime)`, so consulting it needs the mtime
   * — which is the whole reason `parseAndAccumulate` stat'ed before it looked.
   * On an unchanged 2400-file project that was 2400 stats per save, and on
   * Remote-SSH or in a devcontainer every one of them is a network round trip.
   *
   * A content-only batch names the files that changed. For every OTHER file the
   * answer to `stat` is the answer the last sweep already got, so it is kept
   * here instead of asked for again. Rebuilt from scratch on every structural
   * pass, which is what `scan()` always is — so a file that changed without an
   * event is picked up there, not never.
   */
  private _lastStats = new Map<string, { readonly mtime: number; readonly size: number }>();

  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    // `then(work, work)` so one failed pass does not wedge the queue forever.
    const run = this._queue.then(work, work);
    this._queue = run.catch(() => undefined);
    return run;
  }

  // ── Pass 1: Glob + parse ────────────────────────────────────────────────────

  private async pass1(
    roots: readonly string[],
    /**
     * Whether the SET of files may have changed. False for a plain content
     * edit, which is the overwhelmingly common case: a save re-globbed nine
     * patterns across the workspace and re-`stat`ed every indexed file, and on
     * Remote-SSH or a devcontainer each of those is a round trip. Parsing was
     * already spared by the cache; walking never was.
     */
    structural = true,
    /**
     * The paths this pass was told about. Every other file is taken to be
     * unchanged, which is what lets its remembered stat stand in for a fresh
     * one. Empty on a full `scan()`, which is structural anyway.
     */
    dirty: ReadonlySet<string> = EMPTY_SET,
  ): Promise<MutableAccumulator> {
    this._lastRoots = roots;

    const acc: MutableAccumulator = {
      models: [],
      views: [],
      forms: [],
      migrations: [],
      templates: [],
      urls: [],
      helpers: [],
    };

    if (roots.length === 0) return acc;

    let files = this._lastFiles;
    if (structural || files === undefined) {
      // Build absolute patterns by prefixing each root
      const absolutePatterns = roots.flatMap(root => INCLUDE_PATTERNS.map(pat => `${root}/${pat}`));
      files = await this.fs.glob(absolutePatterns, this.excludeGlobs);
      this._lastFiles = files;
    }

    // A structural pass re-stats everything, so the remembered answers are
    // rebuilt rather than added to — otherwise deleted files stay in the map
    // forever and it grows with the session instead of with the project.
    if (structural) this._lastStats = new Map();

    // The working set is known the moment the glob returns, so size the cache
    // to it. A cache smaller than a sweep that visits every file in the same
    // order every time has a hit rate of zero, not a reduced one: an unchanged
    // project of 2050 files re-parsed all 2050 against the fixed cap of 2000.
    // The margin covers files appearing between scans without another resize.
    this.cache.ensureCapacity(Math.ceil(files.length * 1.2));

    await pooled(files, PASS1_CONCURRENCY, async filePath => {
      const kind = routeFile(filePath);
      if (!kind) return;

      try {
        await this.parseAndAccumulate(filePath, kind, acc, structural || dirty.has(filePath));
      } catch (err) {
        // A file can stop being readable for reasons that are none of our
        // business: no read permission, deleted between the glob and the read,
        // a mount that went away. Dropping that file is the correct cost.
        // Dropping the scan is not, and that is what an uncaught rejection
        // here did — pass1 rejected, onDidChange never fired, and every
        // feature in the extension stayed empty until the window was reloaded.
        this.logger.warn(`[scanner] ${filePath}: skipped, could not be read (${String(err)})`);
      }
    });

    return acc;
  }

  /**
   * The file's mtime and size — asked for, or remembered from the last sweep.
   *
   * `fresh` is true for a structural pass and for the paths a batch named. It
   * is the ONLY place the scanner is allowed to trust a remembered answer, and
   * it is the whole saving: everything downstream still keys on `(path, mtime)`
   * exactly as before.
   */
  private async statOf(
    filePath: string,
    fresh: boolean,
  ): Promise<{ readonly mtime: number; readonly size: number } | null> {
    if (!fresh) {
      const known = this._lastStats.get(filePath);
      if (known) return known;
    }
    const result = await this.fs.stat(filePath);
    if (result) this._lastStats.set(filePath, result);
    else this._lastStats.delete(filePath);
    return result;
  }

  private async parseAndAccumulate(
    filePath: string,
    kind: RouteKind,
    acc: MutableAccumulator,
    fresh: boolean,
  ): Promise<void> {
    const statResult = await this.statOf(filePath, fresh);
    const mtime = statResult?.mtime ?? 0;

    // The size was already in hand and thrown away. Every route below reads the
    // file whole and parses the string, so without a limit one runaway file —
    // a generated migration, a vendored bundle a template glob happens to
    // reach, a repository that is not ours — is an unbounded allocation and an
    // unbounded parse on the extension host.
    if (statResult !== null && statResult.size > MAX_PARSED_FILE_BYTES) {
      this.logger.warn(
        `[scanner] ${filePath}: skipped, ${statResult.size} bytes is over the ` +
          `${MAX_PARSED_FILE_BYTES}-byte limit for a parsed file`,
      );
      return;
    }

    const opts: ParserOpts = {
      filePath,
      onWarn: msg => this.logger.warn(`[scanner] ${filePath}: ${msg}`),
    };

    switch (kind) {
      case 'models': {
        const cached = this.cache.get(filePath, mtime) as Model[] | undefined;
        if (cached) {
          acc.models.push(...cached);
          return;
        }
        const src = await this.fs.readFile(filePath);
        const res = this.parsers.models(src, opts);
        if (res.ok) {
          this.cache.set(filePath, mtime, res.value);
          acc.models.push(...res.value);
        }
        break;
      }
      case 'views': {
        const cached = this.cache.get(filePath, mtime) as View[] | undefined;
        if (cached) {
          acc.views.push(...cached);
          return;
        }
        const src = await this.fs.readFile(filePath);
        const res = this.parsers.views(src, opts);
        if (res.ok) {
          this.cache.set(filePath, mtime, res.value);
          acc.views.push(...res.value);
        }
        break;
      }
      case 'forms': {
        const cached = this.cache.get(filePath, mtime) as Form[] | undefined;
        if (cached) {
          acc.forms.push(...cached);
          return;
        }
        const src = await this.fs.readFile(filePath);
        const res = this.parsers.forms(src, opts);
        if (res.ok) {
          this.cache.set(filePath, mtime, res.value);
          acc.forms.push(...res.value);
        }
        break;
      }
      case 'urls': {
        const cached = this.cache.get(filePath, mtime) as Url[] | undefined;
        if (cached) {
          acc.urls.push(...cached);
          return;
        }
        const src = await this.fs.readFile(filePath);
        const res = this.parsers.urls(src, opts);
        if (res.ok) {
          this.cache.set(filePath, mtime, res.value);
          acc.urls.push(...res.value);
        }
        break;
      }
      case 'migrations': {
        const cached = this.cache.get(filePath, mtime) as Migration[] | undefined;
        if (cached) {
          acc.migrations.push(...cached);
          return;
        }
        const src = await this.fs.readFile(filePath);
        const res = this.parsers.migrations(src, opts);
        if (res.ok) {
          this.cache.set(filePath, mtime, res.value);
          acc.migrations.push(...res.value);
        }
        break;
      }
      case 'helpers': {
        const cached = this.cache.get(filePath, mtime) as Helper[] | undefined;
        if (cached) {
          acc.helpers.push(...cached);
          return;
        }
        const src = await this.fs.readFile(filePath);
        const res = this.parsers.helpers(src, opts);
        if (res.ok) {
          this.cache.set(filePath, mtime, res.value);
          acc.helpers.push(...res.value);
        }
        break;
      }
      case 'template': {
        const cached = this.cache.get(filePath, mtime) as Template[] | undefined;
        if (cached) {
          acc.templates.push(...cached);
          return;
        }
        const src = await this.fs.readFile(filePath);
        const res = this.parsers.template(src, opts);
        if (res.ok) {
          this.cache.set(filePath, mtime, res.value);
          acc.templates.push(...res.value);
        }
        break;
      }
    }
  }

  // ── Pass 2: Cross-file resolution ───────────────────────────────────────────

  /**
   * Follow `from .enums import X` for choices the parser could not resolve.
   *
   * Models resolve cross-file by global name lookup, but choice symbols have no
   * such index — `enums.py` is not in INCLUDE_PATTERNS, so pass 1 never read it.
   * Only files an unresolved import actually names get opened, and each is read
   * once per scan.
   *
   * Caveat: those files are outside the watch set, so edits to them show up on
   * the next full scan, not immediately.
   */
  private async resolveCrossFileChoices(models: Model[], roots: readonly string[]): Promise<void> {
    const symbolsByFile = new Map<string, Map<string, readonly Choice[]> | null>();

    const readSymbols = async (path: string): Promise<Map<string, readonly Choice[]> | null> => {
      const cached = symbolsByFile.get(path);
      if (cached !== undefined) return cached;
      let symbols: Map<string, readonly Choice[]> | null = null;
      try {
        symbols = collectChoiceSymbols(await this.fs.readFile(path));
      } catch {
        symbols = null; // module does not exist at this candidate path
      }
      symbolsByFile.set(path, symbols);
      return symbols;
    };

    const importsByFile = new Map<string, Map<string, string>>();

    for (let i = 0; i < models.length; i++) {
      const model = models[i]!;
      const wanted = unresolvedSymbolsOf(model);
      if (wanted.size === 0) continue;

      let imports = importsByFile.get(model.filePath);
      if (!imports) {
        try {
          imports = parseChoiceImports(await this.fs.readFile(model.filePath));
        } catch {
          imports = new Map();
        }
        importsByFile.set(model.filePath, imports);
      }

      const found = new Map<string, { values: readonly Choice[]; sourceModule: string }>();
      for (const symbol of wanted) {
        const moduleRef = imports.get(symbol);
        if (!moduleRef) continue;
        for (const root of roots.length > 0 ? roots : [undefined]) {
          for (const candidate of candidateModulePaths(model.filePath, moduleRef, root)) {
            const symbols = await readSymbols(candidate);
            const values = symbols?.get(symbol);
            if (values) {
              found.set(symbol, { values, sourceModule: moduleRef });
              break;
            }
          }
          if (found.has(symbol)) break;
        }
      }

      if (found.size > 0) {
        models[i] = resolveModelChoices(model, name => found.get(name));
      }
    }
  }

  /**
   * Resolve abstract bases declared in another file.
   *
   * Unlike choice symbols, a base usually lives in a `models.py` — which pass 1
   * already read — so this is a name lookup, not an import walk. The import map
   * only disambiguates: two apps can both define `TimeStampedModel`, and
   * `from apps.core.models import TimeStampedModel` says which one is meant.
   */
  /** Every path a module reference could resolve to, relative and root-anchored. */
  private modulePathsFor(fromFile: string, moduleRef: string): string[] {
    const roots = this._lastRoots.length > 0 ? this._lastRoots : [undefined];
    return roots.flatMap(root => candidateModulePaths(fromFile, moduleRef, root));
  }

  /**
   * Models declared in a file pass 1 never globbed — `core/mixins.py` and the
   * like. Read only when an unresolved base names it, cached per scan, and used
   * ONLY as an inheritance source: these do not join the project, so they get
   * no box and no watcher entry.
   */
  private readonly externalModelsCache = new Map<string, readonly Model[]>();
  /** Per-scan cache of class bodies read while following mixins. */
  private readonly classContextCache = new Map<string, ReadonlyMap<string, ClassContext> | null>();
  private readonly importsCache = new Map<string, ReadonlyMap<string, ImportBinding>>();

  private async readExternalModels(path: string): Promise<readonly Model[]> {
    const cached = this.externalModelsCache.get(path);
    if (cached) return cached;
    let parsed: readonly Model[] = [];
    try {
      const res = this.parsers.models(await this.fs.readFile(path), { filePath: path });
      if (res.ok) parsed = res.value;
    } catch {
      parsed = [];
    }
    this.externalModelsCache.set(path, parsed);
    return parsed;
  }

  private async resolveCrossFileInheritance(models: Model[]): Promise<void> {
    this.externalModelsCache.clear();
    const byName = new Map<string, Model[]>();
    for (const m of models) {
      const list = byName.get(m.name) ?? [];
      list.push(m);
      byName.set(m.name, list);
    }

    // Group by file: inheritance is applied per file, with its externals added.
    const byFile = new Map<string, Model[]>();
    for (const m of models) {
      const list = byFile.get(m.filePath) ?? [];
      list.push(m);
      byFile.set(m.filePath, list);
    }

    const importsCache = new Map<string, Map<string, string>>();

    for (const [filePath, fileModels] of byFile) {
      const local = new Set(fileModels.map(m => m.name));
      const wanted = new Set<string>();
      for (const m of fileModels) {
        for (const raw of m.bases ?? []) {
          const name = raw.trim().split('.').pop() ?? '';
          if (!name || local.has(name)) continue;
          // A base the workspace could not be holding is not worth opening a
          // file for. Shadowing still wins: if any model in the project is
          // actually called `AbstractUser`, that name goes back in.
          if (DJANGO_PROVIDED_BASES.has(name) && !byName.has(name)) continue;
          // Unknown names are wanted too: the base may live in a module pass 1
          // never globbed, like `core/mixins.py`.
          wanted.add(name);
        }
      }
      if (wanted.size === 0) continue;

      let imports = importsCache.get(filePath);
      if (!imports) {
        try {
          imports = parseChoiceImports(await this.fs.readFile(filePath));
        } catch {
          imports = new Map();
        }
        importsCache.set(filePath, imports);
      }

      const appLabel = appLabelFromPath(filePath, this._lastRoots);
      const externals: Model[] = [];
      for (const name of wanted) {
        const moduleRef = imports.get(name);
        const paths = moduleRef ? this.modulePathsFor(filePath, moduleRef) : [];
        const candidates = byName.get(name);

        if (candidates) {
          // Prefer the module the file actually imports from, then the same app,
          // then whatever is left — the order model-graph resolves bare names in.
          const chosen =
            candidates.find(c => paths.includes(c.filePath)) ??
            candidates.find(c => c.appLabel === appLabel) ??
            candidates[0]!;
          externals.push(chosen);
          continue;
        }

        // Not among the globbed files. Follow the import — this is how a base
        // in `core/mixins.py` is reached, since only models.py is in
        // INCLUDE_PATTERNS.
        for (const candidate of paths) {
          const external = (await this.readExternalModels(candidate)).find(m => m.name === name);
          if (external) {
            externals.push(external);
            break;
          }
        }
      }

      // applyInheritance preserves order, so merged[i] is fileModels[i].
      // Only this file's models are written back; the externals were passed in
      // to be read from, and get their own turn when their file is processed.
      const merged = applyInheritance([...fileModels, ...externals]);
      for (let i = 0; i < fileModels.length; i++) {
        const updated = merged[i]!;
        if (updated === fileModels[i]) continue;
        const idx = models.indexOf(fileModels[i]!);
        if (idx >= 0) models[idx] = updated;
      }
    }
  }

  /**
   * Point `settings.AUTH_USER_MODEL` relations at the model it names.
   *
   * Django's docs tell you to write every relation to the user that way, so it
   * is the single most common FK target in a real project — and it is a
   * settings lookup, not a model name, so it matched nothing and the relation
   * was dropped entirely: no arrow in the diagram, no column in the exports.
   *
   * settings.py is not in INCLUDE_PATTERNS (nothing else needs it), so it is
   * globbed here on demand. Same caveat as the other pass-2 lookups: the file
   * is outside the watch set, so editing AUTH_USER_MODEL lands on the next full
   * scan.
   */
  private async resolveSwappableUser(models: Model[], roots: readonly string[]): Promise<void> {
    if (!models.some(m => m.relations.some(r => isSwappableUserRef(r.toModel)))) return;

    const keys = new Set(models.map(m => `${m.appLabel}.${m.name}`));
    let target: string | null = null;

    const patterns = roots.flatMap(root => [`${root}/**/settings.py`, `${root}/**/settings/*.py`]);
    const files = patterns.length > 0 ? await this.fs.glob(patterns, this.excludeGlobs) : [];
    for (const path of [...files].sort()) {
      try {
        const declared = parseAuthUserModel(await this.fs.readFile(path));
        if (declared) target = declared;
      } catch {
        /* unreadable settings module — fall through to the heuristic */
      }
    }

    // Unset, or set to a model outside the workspace (Django's own auth.User):
    // the bases heuristic is the only thing left, and it answers only when
    // exactly one model qualifies.
    if (target === null || !keys.has(target)) {
      const guess = findUserModelByBases(models);
      if (target === null && guess !== null) target = guess;
    }
    if (target === null || !keys.has(target)) return;

    const resolved = resolveSwappableUserRefs(models, target);
    for (let i = 0; i < models.length; i++) models[i] = resolved[i]!;
  }

  /**
   * Fold in context keys from helper functions defined in ANOTHER file.
   *
   * `context.update(build_ctx(request))` where build_ctx is imported is a
   * normal way to share context, and the parser cannot see across files — so
   * every key that helper contributed read as undefined in Live Mode.
   *
   * Re-run on every scan rather than cached with the View: the helper file is
   * outside the watch set, and recomputing here keeps a cached View correct
   * instead of stale. Cross-file helpers contribute KEYS only; their values
   * are not typed, so a dotted chain through one is simply not validated
   * rather than validated against a guess.
   */
  private async resolveCrossFileViewHelpers(
    views: View[],
    roots: readonly string[],
  ): Promise<void> {
    this.classContextCache.clear();
    this.importsCache.clear();
    const needsWork = views.some(
      v => (v.pendingHelpers?.length ?? 0) > 0 || (v.bases?.length ?? 0) > 0,
    );
    if (!needsWork) return;

    const bodiesByFile = new Map<string, ReadonlyMap<string, HelperBody> | null>();
    const readBodies = async (path: string): Promise<ReadonlyMap<string, HelperBody> | null> => {
      const cached = bodiesByFile.get(path);
      if (cached !== undefined) return cached;
      let bodies: ReadonlyMap<string, HelperBody> | null = null;
      try {
        bodies = extractHelperBodies(await this.fs.readFile(path));
      } catch {
        bodies = null; // module does not exist at this candidate path
      }
      bodiesByFile.set(path, bodies);
      return bodies;
    };

    const importsByFile = new Map<string, Map<string, ImportBinding>>();

    for (let i = 0; i < views.length; i++) {
      const view = views[i]!;
      const wanted = view.pendingHelpers ?? [];
      if (wanted.length === 0 && (view.bases?.length ?? 0) === 0) continue;

      let imports = importsByFile.get(view.filePath);
      if (!imports) {
        try {
          imports = parseImportBindings(await this.fs.readFile(view.filePath));
        } catch {
          imports = new Map();
        }
        importsByFile.set(view.filePath, imports);
      }

      const extra: string[] = [];
      // Keys arriving through a helper→helper hop. Those nested calls sit in
      // if/elif branches in practice, so they are NOT always in the context —
      // same rule the same-file path applies.
      const extraConditional: string[] = [];
      let missed = false;
      for (const name of wanted) {
        const binding = imports.get(name);
        // No import for it at all — a builtin, or defined somewhere we cannot
        // see. Either way the surface is not provably complete.
        if (!binding) {
          missed = true;
          continue;
        }
        let resolvedOne = false;
        for (const root of roots) {
          let done = false;
          for (const path of candidateModulePaths(view.filePath, binding.module, root)) {
            const bodies = await readBodies(path);
            // `import build_ctx as bc` — the module defines the ORIGINAL name.
            if (!bodies?.has(binding.original)) continue;
            // Resolve the whole chain, not just this helper's own dict: a
            // context builder that dispatches to other builders is the normal
            // shape, and taking only its top-level keys dropped every key the
            // branches contribute.
            const chain = resolveHelperKeys([binding.original], bodies);
            extra.push(...chain.direct);
            extraConditional.push(...chain.conditional);
            done = true;
            break;
          }
          if (done) {
            resolvedOne = true;
            break;
          }
        }
        if (!resolvedOne) missed = true;
      }

      // Mixin bases contribute their own get_context_data keys.
      const fromBases = await this.mixinContextKeys(view, imports, roots);
      extra.push(...fromBases.keys);
      if (fromBases.missed) missed = true;

      const contextKeys = [...new Set([...view.contextKeys, ...extra])];
      const known = new Set(view.contextVars.map(cv => cv.name));
      const unconditional = new Set(contextKeys);
      const contextVars = [
        ...view.contextVars,
        ...extra.filter(k => !known.has(k)).map(k => ({ name: k, kind: 'scalar' as const })),
        // Reported as "not always available" rather than undefined — the key
        // IS in the context, just only down one branch.
        ...[...new Set(extraConditional)]
          .filter(k => !known.has(k) && !unconditional.has(k))
          .map(k => ({ name: k, kind: 'scalar' as const, conditional: true as const })),
      ];
      const incomplete = view.contextIncomplete === true || missed;
      views[i] = {
        ...view,
        contextKeys,
        contextVars,
        ...(incomplete ? { contextIncomplete: true } : {}),
      };
    }
  }

  /**
   * Keys a CBV inherits from mixins defined elsewhere.
   *
   * `class V(StatsMixin, TemplateView)` gets whatever StatsMixin's
   * get_context_data adds, and the view parser never opens mixins.py. Bases
   * imported from `django.` are skipped outright: they are framework classes,
   * not a gap in our reading, and counting them as misses would mark every
   * single CBV incomplete.
   */
  private async mixinContextKeys(
    view: View,
    imports: ReadonlyMap<string, ImportBinding>,
    roots: readonly string[],
  ): Promise<{ keys: string[]; missed: boolean }> {
    const bases = view.bases ?? [];
    if (bases.length === 0) return { keys: [], missed: false };

    const keys: string[] = [];
    let missed = false;
    const seen = new Set<string>();

    /** Resolve `name` starting from `file`, whose imports are `scope`. */
    const visit = async (
      name: string,
      file: string,
      scope: ReadonlyMap<string, ImportBinding>,
      depth: number,
    ): Promise<void> => {
      const marker = `${file}#${name}`;
      if (depth > MAX_MIXIN_DEPTH || seen.has(marker)) return;
      seen.add(marker);

      // A base can live in the SAME module as the class that inherits it —
      // that is how a mixin file layers its own mixins. Look there first, so
      // the parent hop does not go looking through the view's imports for a
      // name the view never imported.
      const local = (await this.readClassContexts(file))?.get(name);
      if (local) {
        keys.push(...local.keys);
        if (local.unresolved) missed = true;
        for (const parent of local.bases) {
          await visit(parent.split('.').pop()!, file, scope, depth + 1);
        }
        return;
      }

      const binding = scope.get(name);
      // Framework base, or a name with no import to follow — not our gap.
      if (!binding || binding.module.startsWith('django')) return;

      for (const root of roots) {
        for (const path of candidateModulePaths(file, binding.module, root)) {
          const classes = await this.readClassContexts(path);
          const cls = classes?.get(binding.original);
          if (!cls) continue;
          keys.push(...cls.keys);
          if (cls.unresolved) missed = true;
          const nextScope = await this.readImports(path);
          for (const parent of cls.bases) {
            await visit(parent.split('.').pop()!, path, nextScope, depth + 1);
          }
          return;
        }
      }
      missed = true; // imported from the project, and still not found
    };

    for (const base of bases) {
      await visit(base.split('.').pop()!, view.filePath, imports, 0);
    }
    return { keys, missed };
  }

  private async readImports(path: string): Promise<ReadonlyMap<string, ImportBinding>> {
    const cached = this.importsCache.get(path);
    if (cached) return cached;
    let imports: Map<string, ImportBinding>;
    try {
      imports = parseImportBindings(await this.fs.readFile(path));
    } catch {
      imports = new Map();
    }
    this.importsCache.set(path, imports);
    return imports;
  }

  private async readClassContexts(path: string): Promise<ReadonlyMap<string, ClassContext> | null> {
    const cached = this.classContextCache.get(path);
    if (cached !== undefined) return cached;
    let classes: ReadonlyMap<string, ClassContext> | null = null;
    try {
      classes = extractClassContexts(await this.fs.readFile(path));
    } catch {
      classes = null;
    }
    this.classContextCache.set(path, classes);
    return classes;
  }

  /**
   * Qualify `Model.appLabel` by workspace root, and carry the relations with it.
   *
   * `Model.appLabel` is derived by the PARSER, from the file path and nothing
   * else, so it cannot know the workspace has two roots — an API and its admin
   * both have a `core`, and the model index is keyed `'<appLabel>.<name>'`, so
   * `core.Thing` from one root silently REPLACED `core.Thing` from the other.
   * Views were fixed by stamping the label here, where the roots are in hand;
   * this is the same fix on the half that was left.
   *
   * The relations have to move with it. `Relation.fromModel` is built by the
   * parser from the same label, and the diagram keeps only relations whose
   * `fromModel` is a known model key (`modelKeySet.has`) — leaving them behind
   * would have traded a lost model for every lost edge. An app-qualified
   * `toModel` ('core.Thing') is re-pointed at the copy in the relation's OWN
   * root, which is what a Django app label means inside one project. Bare and
   * `self` targets are left alone: they are resolved downstream against these
   * keys, and the same-app preference there already picks the right root.
   *
   * With one root — nearly every session — `qualifiedAppLabel` is the identity
   * and this whole method returns immediately.
   */
  private qualifyModelLabels(models: Model[]): void {
    const roots = this._lastRoots;
    if (roots.length < 2) return;

    // Per root: the key the parser stamped → the key the index will use.
    const byRoot = new Map<string, Map<string, string>>();
    for (const m of models) {
      const root = owningRoot(m.filePath, roots);
      let table = byRoot.get(root);
      if (!table) {
        table = new Map();
        byRoot.set(root, table);
      }
      table.set(`${m.appLabel}.${m.name}`, `${qualifiedAppLabel(m.filePath, roots)}.${m.name}`);
    }

    for (let i = 0; i < models.length; i++) {
      const model = models[i]!;
      const label = qualifiedAppLabel(model.filePath, roots);
      const table = byRoot.get(owningRoot(model.filePath, roots));
      const fromModel = `${label}.${model.name}`;
      if (label === model.appLabel && model.relations.every(r => !table?.has(r.toModel))) continue;

      models[i] = {
        ...model,
        appLabel: label,
        relations: model.relations.map(r => {
          const toModel = table?.get(r.toModel) ?? r.toModel;
          return r.fromModel === fromModel && r.toModel === toModel
            ? r
            : { ...r, fromModel, toModel };
        }),
      };
    }
  }

  private async pass2(acc: MutableAccumulator): Promise<Project> {
    await this.resolveCrossFileChoices(acc.models, this._lastRoots);
    await this.resolveCrossFileInheritance(acc.models);
    await this.resolveSwappableUser(acc.models, this._lastRoots);
    await this.resolveCrossFileViewHelpers(acc.views, this._lastRoots);
    acc.views.push(...viewsFromUrlConf(acc.urls));

    this.qualifyModelLabels(acc.models);

    // Stamp the app label while the roots are in hand. Every consumer of
    // `viewKey()` — the sidebar, the live-mode commands, the context-var
    // adapters — has to agree with the key this index is built on, and none of
    // them knows where the workspace starts.
    for (let i = 0; i < acc.views.length; i++) {
      const view = acc.views[i]!;
      acc.views[i] = { ...view, appLabel: qualifiedAppLabel(view.filePath, this._lastRoots) };
    }

    // Build indexes first
    const modelIndex = new IndexImpl<Model, string>(m => `${m.appLabel}.${m.name}`, ['appLabel']);
    for (const m of acc.models) modelIndex.add(m);

    const viewIndex = new IndexImpl<View, string>(v => viewKey(v));
    for (const v of acc.views) viewIndex.add(v);

    const formIndex = new IndexImpl<Form, string>(
      f => `${qualifiedAppLabel(f.filePath, this._lastRoots)}.${f.name}`,
    );
    for (const f of acc.forms) formIndex.add(f);

    const migrationIndex = new IndexImpl<Migration, string>(
      mg => `${mg.appLabel}.${mg.name}`,
      ['appLabel'],
    );
    for (const mg of acc.migrations) migrationIndex.add(mg);

    const templateIndex = new IndexImpl<Template, string>(t => t.relativePath || t.filePath);
    for (const t of acc.templates) templateIndex.add(t);

    const urlIndex = new IndexImpl<Url, string>(u => u.name);
    for (const u of acc.urls) urlIndex.add(u);

    const helperIndex = new IndexImpl<Helper, string>(h => `${h.library}.${h.name}`, ['library']);
    for (const h of acc.helpers) helperIndex.add(h);

    // ── Cross-file resolution ─────────────────────────────────────────────────

    // Build initial templateIndex for extends/includes resolution
    const resolvedTemplates = await this.resolveTemplates(acc.templates, templateIndex, urlIndex);

    // Rebuild templateIndex with resolved data
    const resolvedTemplateIndex = new IndexImpl<Template, string>(
      t => t.relativePath || t.filePath,
    );
    for (const t of resolvedTemplates) resolvedTemplateIndex.add(t);

    const fingerprint = `${acc.models.length}:${acc.views.length}:${acc.templates.length}:${Date.now()}`;

    const project: Project = Object.freeze({
      models: modelIndex,
      views: viewIndex,
      forms: formIndex,
      migrations: migrationIndex,
      templates: resolvedTemplateIndex,
      urls: urlIndex,
      helpers: helperIndex,
      workspaceFingerprint: fingerprint,
      scannedAt: Date.now(),
    });

    return project;
  }

  /**
   * Pass-2 template resolution:
   *
   *  1. URL sentinel refs (`__url__:NAME`) → look up urlIndex; warn if missing.
   *  2. Static sentinel refs (`__static__:PATH`) → pass through (validated in Fase 4).
   *  3. Regular includes → verify the target template exists in templateIndex; warn if not.
   *  4. extends ref → verify it exists in templateIndex; warn if not.
   *
   * Template lookup uses suffix matching because extends/includes store short paths
   * (e.g. "base.html") while the index key is the full absolute path.
   *
   * We do NOT deep-resolve extends chains — adapters/completions follow the index.
   */
  private async resolveTemplates(
    templates: readonly Template[],
    templateIndex: IndexImpl<Template, string>,
    urlIndex: IndexImpl<Url, string>,
  ): Promise<Template[]> {
    // Every name a template in this project can be referenced by, built ONCE.
    //
    // The lookup used to be a `.some()` over every key, per reference: with R
    // references across T templates that is O(T x R), and both grow with the
    // project, so it ran on every scan AND every save. The exact-match branch
    // in front of it could never take the load off, because `relativePath` is
    // an absolute path (see parseTemplate) and a `{% include %}` never is.
    //
    // Every path suffix that starts at a segment boundary, which is exactly
    // what `k === ref || k.endsWith('/' + ref)` accepted — same answers, built
    // once instead of re-tested per reference. Deliberately not narrowed to
    // `templateLoadPaths`: a project whose template root is not called
    // `templates/` (a `jinja2/` dir, a DIRS entry pointing anywhere) resolved
    // under the old rule, and tightening that here would turn working projects
    // into a wall of "not found" warnings.
    const referencableNames = new Set<string>();
    for (const t of templateIndex.all()) {
      const key = t.relativePath || t.filePath;
      referencableNames.add(key);
      for (let at = key.indexOf('/'); at !== -1; at = key.indexOf('/', at + 1)) {
        referencableNames.add(key.slice(at + 1));
      }
    }

    const findTemplate = (ref: string): boolean =>
      templateIndex.byKey(ref) !== undefined || referencableNames.has(ref);

    return templates.map(tmpl => {
      // ── Validate extends ────────────────────────────────────────────────────
      if (tmpl.extends && !findTemplate(tmpl.extends)) {
        this.logger.warn(
          `[scanner] template ${tmpl.filePath}: extends '${tmpl.extends}' not found in workspace`,
        );
      }

      // ── Resolve includes ─────────────────────────────────────────────────────
      const resolvedIncludes: IncludeRef[] = tmpl.includes.map(inc => {
        if (inc.target.startsWith('__url__:')) {
          const urlName = inc.target.slice('__url__:'.length);
          const found = urlIndex.byKey(urlName);
          if (!found) {
            this.logger.warn(
              `[scanner] template ${tmpl.filePath}: unresolved URL ref '${urlName}'`,
            );
          }
          return inc;
        }

        if (inc.target.startsWith('__static__:')) {
          // Static refs are validated against actual static files in Fase 4 — pass through.
          return inc;
        }

        // Regular include — verify target exists in template index (suffix match)
        if (!findTemplate(inc.target)) {
          this.logger.warn(
            `[scanner] template ${tmpl.filePath}: include '${inc.target}' not found in workspace`,
          );
        }
        return inc;
      });

      return {
        ...tmpl,
        includes: resolvedIncludes,
      };
    });
  }
}
