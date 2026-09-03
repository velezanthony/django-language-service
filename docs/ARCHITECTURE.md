# Architecture

Internal reference for contributors. Read this before touching `src/`.

`django-language-service` is a VS Code extension that indexes a Django project (models,
views, forms, urls, migrations, templates, template helpers) and serves language features
from that index: completion, hover, definition, diagnostics, folding, formatting, code
lenses, file decorations, a four-section sidebar and an ER-diagram webview.

Everything runs in two worlds:

- the **extension host** (Node, CommonJS bundle, `vscode` module available), and
- two **browser bundles** (Svelte 5 apps running inside VS Code webviews, no `vscode` module).

---

## 1. Layer map and the dependency rule

```
                          ┌──────────────────────────────────────────┐
                          │  src/extension.ts  (composition root)    │
                          └───────────────────┬──────────────────────┘
                                              │ builds + wires
        ┌─────────────────────────────────────┴──────────────────────────────┐
        │                                                                    │
        ▼                                                                    ▼
┌───────────────────────┐        ┌────────────────────────┐        ┌────────────────────┐
│  src/adapters         │───────▶│  src/infra             │───────▶│  src/domain        │
│  VS Code-facing       │        │  I/O + indexing        │        │  pure logic        │
│  imports `vscode`     │        │  `vscode` 3×, lazy     │        │  ZERO `vscode`     │
└──────────┬────────────┘        └────────────────────────┘        └────────────────────┘
           │                                  ▲
           │ uses $shared/logger              │  infra imports $domain, never the reverse
           ▼                                  │
┌───────────────────────┐                     │
│  src/shared           │  logger.ts (imports vscode) + protocol/ (import-free)
└──────────┬────────────┘
           │ typed message contracts (protocol only)
           ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  Browser bundles — separate esbuild targets, NOT in tsconfig.json            │
│  src/webview  (ER diagram app)        src/sidebar  (4 sidebar views)        │
└──────────────────────────────────────────────────────────────────────────────┘
```

### THE DEPENDENCY RULE

> `adapters → infra → domain`. Nothing points back up.
> Only `src/adapters` may import `vscode` freely.
> `src/domain` imports nothing outside `src/domain` in production code.

Verified with `rg` against the current tree, not assumed:

| Claim                                  | Check                                                               | Result    |
| -------------------------------------- | ------------------------------------------------------------------- | --------- |
| Domain never imports `vscode`          | `rg "from 'vscode'\|require\('vscode'\)" src/domain`                | 0 matches |
| Domain never imports another layer     | `rg "from '\$(infra\|adapters\|shared)" src/domain -g '!*.test.ts'` | 0 matches |
| Infra never imports up                 | `rg "from '\$(adapters\|shared)" src/infra -g '!*.test.ts'`         | 0 matches |
| Webview/sidebar never import `$shared` | `rg "\$shared" src/webview src/sidebar -g '!*.md'`                  | 0 matches |

The `-g` exclusions are load-bearing, not cosmetic: tests legitimately cross layers to drive the
real Scanner (`domain/diagram/docs-payload.test.ts` imports `$infra`,
`infra/scanner-url-conf-views.test.ts` imports `$adapters`). Drop the exclusion and the command
reports those, which is why it must be written this way to mean what the row claims. Domain's
only other non-`$domain` imports are test-only (`vitest`, `node:fs`, `node:path`). Every
occurrence of the word "vscode" under `src/domain` is a doc-comment asserting the purity rule.

Two things that are **not** what they look like:

- **`$shared` is not a neutral layer.** `src/shared/logger.ts` imports `vscode` eagerly. Only
  `src/shared/protocol/*` is import-free and safe on both sides. `$shared` is aliased for the
  extension host only. The webview bundles alias `$protocol` → `src/shared/protocol` instead —
  narrowed from `$shared` precisely because `$shared` also reaches `logger.ts`, and one
  `import { logError } from '$shared/logger'` in a `.svelte` file breaks that bundle at load time
  with check-types, svelte-check and the unit suite all green. Nothing was importing it; the alias
  was a loaded gun on the table. `src/architecture.test.ts` now fails on any `$shared` import from
  a browser bundle, so the narrowing cannot be quietly undone.
- **Four known boundary leaks**, all reaching into domain by deep relative path because
  `webviewAlias` defines no `$domain`:
  - `src/webview/lib/composables/layout.ts:1` → `domain/diagram/diagram-layout`
  - `src/webview/lib/helpers/diff-rows.ts:11` → `domain/parsers/_shared/field-attrs`
  - `src/webview/lib/helpers/mount-diff-tooltip.ts:4` → same module
  - `src/webview/lib/components/organisms/DiffTooltip.svelte:10` → same module

  `tsconfig.webview.json` names only one of them in its `include` —
  `src/domain/diagram/diagram-layout.ts`. `field-attrs.ts` enters the webview program purely as a
  followed relative import, declared nowhere, which is why the leak is easy to miss when reading
  the config. This started as one exception and has been copied three times, which is the argument
  for fixing it rather than documenting it: add a proper `$domain` webview alias in `esbuild.js`,
  `tsconfig.webview.json` and `vitest.config.ts` at the same time, and delete the relative paths.

### What enforces this mechanically

`src/architecture.test.ts` is a unit test, so `npm test` goes red the moment one of three facts
stops holding: `src/domain` imports no `vscode`; `src/domain` imports no `node:fs` or `node:path`;
nothing bundled for a browser imports `$shared`, whose `logger.ts` opens with
`import * as vscode from 'vscode'` at module scope. The same file reads the alias table out of all
four declaration sites and asserts they agree. So a red `npm test` can mean "you crossed a layer"
rather than "you broke logic" — and adding a layer or an alias means extending that test in the
same commit, or the next contributor inherits a rule nothing checks.

Two things it still cannot see: the relative-path leaks into `src/domain` listed above (a
`$`-prefix check does not catch `../../../domain/...`), and anything a reviewer would call a layer
violation that is not one of those three facts.

`eslint.config.mjs` and `npm run lint` exist, but neither knows about layers. The config
deliberately restricts itself to intent errors a type-checker cannot express — `no-empty` with
`allowEmptyCatch: false`, `eqeqeq`, `no-console` — on the grounds that `tsconfig.json` already runs
the strict flags people install ESLint for. There is no import-boundary rule; crossing a layer is
caught by `src/architecture.test.ts`, not by the linter.

### Path aliases — declared in four places, must stay in sync

| Alias                                          | Target                                                               | Declared in                                                                                |
| ---------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `$domain/*`                                    | `src/domain/*`                                                       | `tsconfig.json`, `esbuild.js` (`extensionAlias`), `vitest.config.ts`                       |
| `$infra/*`                                     | `src/infra/*`                                                        | same three                                                                                 |
| `$adapters/*`                                  | `src/adapters/*`                                                     | same three                                                                                 |
| `$shared/*`                                    | `src/shared/*`                                                       | `tsconfig.json`, `esbuild.js` (`extensionAlias`), `vitest.config.ts` — extension host only |
| `$protocol`                                    | `src/shared/protocol`                                                | `esbuild.js` (`webviewAlias`), `tsconfig.webview.json`, `vitest.config.ts`                 |
| `$lib/*`                                       | `src/webview/lib/*`                                                  | same three                                                                                 |
| `$atoms`, `$icons`, `$molecules`, `$organisms` | `src/webview/lib/components/{atoms,atoms/icons,molecules,organisms}` | same three                                                                                 |

Adding or renaming an alias means editing **every** place above, or typecheck, bundle and tests
will disagree.

---

## 2. What lives in each layer

### `src/domain` — pure logic

No `vscode`, no `fs`, no `path` in production files. Parsers take a string and return a
`ParseResult`; analyzers take plain data and return plain data. This is what makes the unit
suite runnable in the `node` vitest environment with no extension host.

| Directory           | Contents                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contracts/`        | `parser.ts` (`Parser`, `ParseResult`, `ParseError`, `ParserOpts`), `index-type.ts` (`Index<T,K>`), `project.ts` (`Project`) — the canonical shapes — and `fresh-regex.ts` (`freshRegex(re)`), the only sanctioned way to copy a `/g` pattern: `new RegExp(re.source, 'g')` reads as "keep g" and in fact drops every other flag, which silently changes what a `u` pattern matches                                                                                                                                                                                                                                                       |
| `types/`            | The entity types, one file each: `model.ts`, `field.ts`, `relation.ts`, `choice.ts`, `view.ts`, `form.ts`, `url.ts`, `migration.ts`, `helper.ts`, `template.ts`, `template-var.ts`, `context-var.ts`, plus the `index.ts` barrel                                                                                                                                                                                                                                                                                                                                                                                                         |
| `parsers/`          | `models.ts`, `views.ts`, `forms.ts`, `urls.ts`, `migrations.ts`, `helpers.ts`, `template.ts`, `template-variables.ts`, `url-references.ts` + `_shared/`, the shared parsing layer: token tables (`python-tokens.ts`, `html-tokens.ts`, `models-choice-indexes.ts`), the DTL reader pair (`dtl-lexer.ts`, `dtl-blanking.ts`), model helpers (`model-classes.ts`, `model-inheritance.ts`, `resolve-model-choices.ts`, `user-model.ts`, `choice-imports.ts`, `field-attrs.ts`, `meta-indexes.ts`, `property-block.ts`), template resolution (`template-search.ts`, `template-load-path.ts`) and the rewrite guards (`ink.ts`, `offsets.ts`) |
| `view-context/`     | The analysis engine: `chain-resolver.ts`, `context-inference.ts`, `context-vars.ts`, `context-keys.ts`, `class-context.ts`, `template-scope.ts`, `model-graph.ts`, `diagnose.ts`, `completion-entries.ts`, `describe-chain.ts`, `conditional-keys.ts`, `helper-keys.ts`, `find-similar.ts`, `url-conf-views.ts`, `types.ts`, plus the `index.ts` barrel — whose header states the order an adapter is meant to call them in (the graph once per `Project` snapshot, then per view, then per template request, then per dotted expression). `parsers/` and `include-pretty/` carry barrels too                                            |
| `diagram/`          | `diagram-serializer.ts`, `diagram-layout.ts`, `diagram-migrations.ts`, `diagram-exports.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `include-pretty/`   | `include-finder.ts`, `include-parser.ts`, `include-formatter.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `formatting/`       | `formatter.ts`, `dtl-parser.ts`, `patterns.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `folding/`          | `folding-ranges.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `comments/`         | `toggle-comment.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `dtl-tag-registry/` | `tag-registry.ts`, `diagnose-loads.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

Domain returns vscode-free data that adapters translate at the boundary:
`completion-entries.ts` produces plain entries the completion adapter maps to
`vscode.CompletionItem`; `diagnose.ts` returns 1-based line/col that the diagnostics adapter
converts to 0-based `vscode.Range`; `folding/folding-ranges.ts` mirrors
`vscode.FoldingRangeKind` without importing `vscode`.

### `src/infra` — I/O, indexing, watching

| File                                      | Role                                                                                                                                                                                                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `scanner.ts`                              | Two-pass workspace scan, the heart of the layer                                                                                                                                                                                                              |
| `index-impl.ts`                           | `IndexImpl<T,K>` — primary `Map<K,T>` + registered secondary indexes                                                                                                                                                                                         |
| `cache.ts`                                | `ParseCache` — bounded **LRU** keyed by path, mtime-guarded, default cap 2000. `get` re-inserts, so a read is what makes an entry recent. It was insertion-order FIFO, which above the cap evicted the file being edited as readily as one nobody had opened |
| `file-system.ts`                          | The `FileSystem` port (`readFile`, `glob`, `stat`) + `NodeFileSystem` + `InMemoryFileSystem`                                                                                                                                                                 |
| `watcher.ts`                              | `WatchAdapter` interface, `VsCodeWatchAdapter`, `DebouncedWatcher`                                                                                                                                                                                           |
| `view-key.ts`                             | Single source of truth for the qualified view key `<app>.<name>` (`appLabelFromPath`, `viewKey`)                                                                                                                                                             |
| `index.ts`                                | Public barrel — **not** the `Index<T,K>` implementation, which is `index-impl.ts`                                                                                                                                                                            |
| `types/project.ts`, `types/index-type.ts` | Pure re-export shims; the canonical definitions live in `$domain/contracts/*`                                                                                                                                                                                |
| `vscode-file-system.ts`                   | The **production** `FileSystem`: `workspace.findFiles` + `workspace.fs`                                                                                                                                                                                      |
| `glob-translate.ts`                       | Pure absolute-glob → `RelativePattern` base/pattern translation                                                                                                                                                                                              |
| `watch-globs.ts`                          | Watch scope (verbatim `INCLUDE_PATTERNS`) + the `isWatchablePath` gate                                                                                                                                                                                       |
| `exclude-paths.ts`                        | Single source of truth for skipped directories — `DEFAULT_EXCLUDE_SEGMENTS`, `buildExcludeGlobs`, `resolveExcludeSegments`. Shared by the scanner and the watcher, overridable via `djangoLanguageService.excludePaths`                                      |

**The vscode exception.** Infra touches `vscode` in exactly three places, all via lazy
`require('vscode')` so unit tests run headless:

- `src/infra/vscode-file-system.ts` — `VsCodeFileSystem` constructor. It takes its vscode
  slice by injection, so its tests pass a double instead of an extension host.
- `src/infra/watcher.ts:53` — `VsCodeWatchAdapter` constructor (plus type-only
  `import('vscode')` annotations at `:48` and `:60`).
- `src/infra/scanner.ts:271` — `EventEmitter` fallback when `ScannerOpts.emitterFactory` is not
  supplied. There is also a type-only `import type { EventEmitter, Event } from 'vscode'` at
  `src/infra/scanner.ts:16`.

Callers running outside the extension host **must** pass `emitterFactory`. Everything else in
infra is injectable: `ScannerOpts` takes `fs`, `cache`, `parsers` (a `Partial<ParserRegistry>`
merged over `DEFAULT_PARSERS`) and `logger` (`{ warn(msg) }`, defaults to a no-op — infra does
**not** use `$shared/logger`).

`IndexImpl.byProperty()` **throws** for a property that was not registered in the constructor.
That is deliberate: it prevents a silent O(n) scan in a hot path. If you add a new
`byProperty` lookup, you must also register that secondary index in `scanner.ts` pass 2.

### `src/adapters` — the VS Code surface

The only layer allowed to import `vscode` freely. Each subdirectory is one capability:

`_shared/`, `code-actions/`, `commands/`, `completion/`, `definition/`, `diagnostics/`,
`diagram/`, `document-link/`, `file-decoration/`, `folding/`, `formatting/`, `hover/`,
`script-filter/`, `sidebar/`, `status-bar/`, `tag-pair-highlight/`, `types/`.

`src/adapters/types/adapter.ts` defines the contract:

```ts
interface Adapter {
  readonly id: string;
  register(
    ctx: vscode.ExtensionContext,
    services: AdapterServices,
  ): vscode.Disposable;
}

interface AdapterServices {
  readonly getProject: () => Project; // required
  readonly getScanner?: () => Scanner; // only refresh-view-context uses it
  readonly onProjectChange?: vscode.Event<Project>;
}
```

Adapter files export a bare `register` function; `src/adapters/index.ts` wraps each with the
local helper `a(id, reg)` into the frozen `ADAPTERS` array — every provider wrapper, plus the
combined `commandsAdapter`, which sits fourth, immediately after `diagram/panel` whose
`showModelDiagram` registration it depends on. The list ends with the four sidebar sections.

`src/adapters/_shared/` holds the conventions every new adapter needs:

| File                       | What it gives you                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `command-helper.ts`        | `CMD_PREFIX = 'django-language-service'`, `cmdId(suffix)`, `registerCmd(id, handler)`                                                                                                                                                                                                                                                                             |
| `empty-project.ts`         | `EMPTY_PROJECT` — null-object seed built from empty `IndexImpl`s so `byKey()`/`all()` never need null checks                                                                                                                                                                                                                                                      |
| `project-graph.ts`         | `graphFor(project)` — memoizes the domain `ModelGraph` in a `WeakMap` keyed by `Project` identity. Never build a graph per keystroke                                                                                                                                                                                                                              |
| `live-mode.ts`             | Cross-adapter refresh pipeline, driven by internal commands (`setContext`, `refreshViewsSidebar`, `validateContext`, `clearContextDiagnostics`) rather than direct imports                                                                                                                                                                                        |
| `include-kwargs.ts`        | Shared `{% include %}` kwarg handling                                                                                                                                                                                                                                                                                                                             |
| `languages.ts`             | The shared `DocumentSelector` language ids — `DTL_LANGUAGE_IDS` / `DTL_SELECTOR` for anything that reads DTL (`html`, `django-html`, `django-txt`) and `HTML_ONLY_LANGUAGES` for the script/style filter. Centralised after the include CodeLens silently dropped `django-txt`                                                                                    |
| `template-resolve.ts`      | Cached template-path resolution + `clearTemplateResolveCache()`, which `extension.ts` drops on every scan so a newly created template resolves without waiting out the TTL                                                                                                                                                                                        |
| `tag-string-arg.ts`        | `firstStringArgAt(source, offset, tagNames)` — the reference under the CURSOR, located by offset against the lexer's tokens. Use this rather than searching a line: a line can carry two `{% url %}` tags, a tag can wrap, and one inside `{# … #}` is not a reference at all. First quoted argument only, on purpose — a `with` keyword value is not the subject |
| `markdown-escape.ts`       | `escapeMarkdown(text)` / `codeSpan(text)`. Every hover interpolates workspace text — a path, a view name, a `db_comment` — and none of them is markdown the user asked to render                                                                                                                                                                                  |
| `workspace-containment.ts` | `isInsideRoot` / `isInsideAnyRoot`, segment-aware, so `/ws-evil` is not inside `/ws`                                                                                                                                                                                                                                                                              |

`src/adapters/diagnostics/_shared/` holds the two conventions a reactive diagnostic needs.
`debounce.ts` exports `createScheduler` — a per-URI timer map, 300 ms by default, cancelling the
previous pending call for the same URI; without it a provider runs on every keystroke.
`diagnostic-range.ts` decides which column span to squiggle, split out of the adapter so it is
testable without a vscode runtime. Use both rather than computing range arithmetic inline in the
provider.

### `src/shared`

- `logger.ts` — singleton `Django Language Service` OutputChannel; exports `logInfo`, `logWarn`,
  `logError`, `showOutputChannel`, `getOutputChannel`. Imports `vscode`. Imported throughout
  `src/adapters` and by `extension.ts`.
- `protocol/` — `extension-to-webview.ts`, `webview-to-extension.ts`, `index.ts`. Deliberately
  **import-free** so it resolves under both `tsconfig.json` and `tsconfig.webview.json`.

---

## 3. Runtime flow

### Activation — `src/extension.ts`

```
activate(ctx)
  ├─ ctx.subscriptions.push(getOutputChannel())
  ├─ excludeSegments = resolveExcludeSegments(config 'djangoLanguageService.excludePaths')
  ├─ new Scanner({ fs: new VsCodeFileSystem(), cache: new ParseCache(),
  │                excludeSegments, logger: { warn: logWarn } })
  ├─ let latestProject = EMPTY_PROJECT
  ├─ scanner.onDidChange(p => latestProject = p)
  ├─ services = { getProject, getScanner, onProjectChange: scanner.onDidChange }
  ├─ for (adapter of ADAPTERS) try { adapter.register(ctx, services) }
  │                            catch { logError(`adapter ${id} register failed`) }
  ├─ new DebouncedWatcher(new VsCodeWatchAdapter(excludeSegments), scanner,
  │                       undefined, err => logError('rescan after file change failed', err))
  ├─ vscode.workspace.onDidChangeWorkspaceFolders(→ re-scan)
  └─ scanner.scan(workspaceFolders.map(f => f.uri.fsPath))
```

Registration is **error-isolated**: a throwing adapter is logged and skipped, activation
continues. Consequence for you: never assume a sibling adapter registered successfully.

### Registration order is load-bearing

`src/adapters/index.ts` documents three hard ordering constraints. Do not alphabetize the list.

1. `status-bar` **before** `diagnostics/*` — diagnostics push counts into the status-bar controller.
2. `file-decoration/include` **before** `diagnostics/include-pretty` — singleton dependency.
3. `diagram/panel` **before** `commandsAdapter` — the panel registers the `showModelDiagram` command.

### Scan pipeline — `src/infra/scanner.ts`

| Step                          | What happens                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scan(roots)`                 | pass1 → pass2 → `emitter.fire(project)` → return the frozen `Project`. Every pass goes through an internal promise chain, so two can never run at once — pass2 `clear()`s caches a concurrent pass2 would still be filling, and the older snapshot could win the race to `emitter.fire`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| pass1                         | Prefixes every root onto the `INCLUDE_PATTERNS` (`**/models.py`, `**/views.py`, `**/views/**/*.py`, `**/forms.py`, `**/urls.py`, `**/migrations/*.py`, `**/helpers.py`, `**/templatetags/*.py`, `**/templates/**/*.html`, `**/templates/**/*.txt`) and calls `fs.glob` with the globs `buildExcludeGlobs()` derives from `DEFAULT_EXCLUDE_SEGMENTS` (`src/infra/exclude-paths.ts` — the single source of truth, shared with the watcher). That list leads with a `.*` wildcard covering every dot-directory rather than naming them one by one, then virtualenvs, `site-packages`, `node_modules`, `__pycache__`, build output, coverage and the `static`/`media` asset roots. The user can replace it through `djangoLanguageService.excludePaths`. Files are parsed through a **worker pool capped at 48 in flight** (unbounded `Promise.all` made peak memory and descriptor count grow with the project), and **each file is wrapped in its own try/catch** — an unreadable file costs that file, never the pass. It used to reject the whole pass, so one EACCES left `latestProject` empty for the rest of the session. On a **content-only** rescan the glob is skipped entirely and the previous file list is reused |
| `routeFile(path)`             | Maps a path to one of 7 `RouteKind`s by basename. **`/migrations/` is checked first** so migration files never collide with `models.py` on basename alone. Unroutable files return `null` and are skipped                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `parseAndAccumulate`          | `fs.stat` for mtime → `ParseCache.get(path, mtime)`. Hit: push cached entities, no read. Miss: read through the `FileSystem` port, call the injected parser, and cache **only** when `res.ok` — failed parses are neither cached nor accumulated                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| pass2                         | Cross-file resolution, then one `IndexImpl` per entity type                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `resolveCrossFileChoices`     | Follows `from .enums import X` for choice symbols the parser could not resolve. `enums.py` is not in the include patterns, so only files an unresolved import actually names are opened, once per scan                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `resolveCrossFileInheritance` | Resolves abstract bases declared in another file, including modules pass 1 never globbed (`core/mixins.py`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `resolveSwappableUser`        | Reads `AUTH_USER_MODEL` from `**/settings.py` (or `settings/*.py`) and points `settings.AUTH_USER_MODEL` relations at it. Falls back to the sole `AbstractUser`/`AbstractBaseUser` subclass, and refuses to guess when several qualify                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `resolveCrossFileViewHelpers` | Folds in context keys from helper functions and CBV mixins defined in other files, following imports and base classes transitively (`MAX_MIXIN_DEPTH = 4`). Bases imported from `django.` are skipped — framework classes are not a gap                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `resolveTemplates`            | Validates `{% extends %}` / `{% include %}` against the template index by **suffix match** (`base.html` matches any key ending in `/base.html`), built once per pass as a `Set` of every segment-boundary suffix — it was a `.some()` over every key per reference, so O(templates × refs) on every scan and every save. Resolves `__url__:NAME` sentinels against the url index, passes `__static__:` sentinels through untouched. Unresolved refs only log a warning — entities are never dropped. The template index is then rebuilt from the resolved templates                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| freeze                        | `Object.freeze(project)` with `workspaceFingerprint` (`models:views:templates:Date.now()`) and `scannedAt`. **A new object identity per scan** — that is what makes `WeakMap`-keyed memoization (`graphFor`) correct                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

**Why these live in pass 2 and not in the parser.** A parser sees one file, so it
cannot follow an import. Doing the work here instead means the resolution re-runs
on _every_ scan, over entities that may have come from the mtime cache — so a
cached entity gets **corrected** rather than left stale when the file it depends
on changes. The cost is that those followed files (`enums.py`, `mixins.py`,
`settings.py`) sit outside the watch set: edits to them land on the next full
scan, not immediately. `helpers.py` and `templatetags/*.py` are **not** in that
group — both are include patterns, and `buildWatchGlobs()` returns the include
patterns verbatim, so they are watched like any other indexed module.

Index primary keys built in pass 2:

| Index        | Primary key                                   | Secondary indexes |
| ------------ | --------------------------------------------- | ----------------- |
| `models`     | `` `${appLabel}.${name}` ``                   | `appLabel`        |
| `views`      | `viewKey(v)` → `<app>.<name>`                 | —                 |
| `forms`      | `` `${appLabelFromPath(filePath)}.${name}` `` | —                 |
| `migrations` | `` `${appLabel}.${name}` ``                   | `appLabel`        |
| `templates`  | `relativePath \|\| filePath`                  | —                 |
| `urls`       | `u.name`                                      | —                 |
| `helpers`    | `` `${library}.${name}` ``                    | `library`         |

### Watch and invalidation — `src/infra/watcher.ts`

- `VsCodeWatchAdapter` creates one `FileSystemWatcher` per pattern from `buildWatchGlobs()` —
  the scanner's own `INCLUDE_PATTERNS`, never `**/*.py` — wires `onDidChange` / `onDidDelete` /
  `onDidCreate`, normalizes every `fsPath` to POSIX via `toPosix`, and drops any event failing
  `isWatchablePath()` so a `.venv` write can never reach `invalidateBatch`.
- `DebouncedWatcher` funnels all three event kinds into one `Set<string>`, restarts a **200 ms**
  timer on every event, then calls `scanner.invalidateBatch(batch, { structural })` once. It
  remembers **which** event fired: create and delete change the set of files (`structural: true`),
  a plain change does not. The scanner cannot tell from a path alone, and that distinction is
  what lets an ordinary save skip the re-glob. The returned promise is no longer `void`-ed —
  its rejection is the only signal a rescan died, and dropping it left the project silently
  frozen. `dispose()` sets a disposed flag, clears the timer, drains pending work and disposes
  all three subscriptions, so no event can fire after disposal.
- `scanner.invalidate(path)` just delegates to `invalidateBatch([path])`.
- `invalidateBatch(paths, opts)` evicts those paths from `ParseCache`, then queues a pass over
  `this._lastRoots`. Correctness comes from the warm cache: only the invalidated files are
  actually re-parsed. **Without `structural`** the glob is skipped and the previous file list is
  reused — it used to re-glob every include pattern and re-`stat` every indexed file on every save,
  and under Remote-SSH or a devcontainer each of those is a round trip. Batches that arrive while a
  pass is running are **coalesced** into the next one rather than each triggering their own.
  **If `_lastRoots` is empty** (no scan has completed yet) it returns immediately without
  emitting — watcher events fired before the first scan are dropped.

### Serving requests

Adapters call `services.getProject()` **inside their handlers**, never at registration time. An
adapter that captures the project at registration captures `EMPTY_PROJECT` forever. The
subscribers to `services.onProjectChange` are the four sidebar sections, `diagram/panel`,
`file-decoration/orphan`, the `context-vars` / `dtl-load` / `url-refs` / `include-pretty`
diagnostics, the `dtl-block-name` / `template-paths` / `static-files` completions — each drops a
cache the new snapshot invalidates — and `script-filter`. Only
`commands/refresh-view-context.ts` uses `services.getScanner`.

### Commands

`src/adapters/commands/index.ts` is a single `commandsAdapter` that fans out to 17 register
functions producing 15 command ids, combined via `vscode.Disposable.from`. The two counts differ
for two reasons: `toggle-live-for-view.ts` registers both `toggleLiveForView` and
`toggleLiveForViewOff`, and three of the 17 files — `clear-diagnostics.ts`,
`show-model-diagram.ts` and `validate-context.ts` — are deliberate no-ops whose real handlers are
registered by `diagnostics/context-vars.ts` and `diagram/panel.ts`; the stubs exist only so the
barrel can list every command without a duplicate-registration error. Ids are built with
`cmdId(suffix)` and registered with `registerCmd()`. The exceptions are in
`src/adapters/diagram/panel.ts`, which calls `vscode.commands.registerCommand` directly twice:
`:465` wires `showModelDiagram` to the panel lifecycle, `:472` the internal `diagramBooted` probe.

Repo-wide, `cmdId()` produces 20 command ids against the 15 in `package.json`, and every manifest
entry is backed by a real registration — there are no dead commands. The five **internal and
deliberately absent from `package.json`** are `codeLensToggleInclude`, `toggleLiveByName`,
`validateByName`, `refreshViewsSidebar` (registered by `src/adapters/sidebar/views.ts`, not by the
commands barrel) and `diagramBooted`. Don't "fix" that gap. Note `showLog` is **not** among them:
it is contributed, because the error toast offers it as an action.

---

## 4. The UI layer

Two independent Svelte 5 (runes) apps that share one component library, one alias set and one
Tailwind stylesheet.

| App                   | Entry                        | Root component                  | Output bundle                                      | Mount target    |
| --------------------- | ---------------------------- | ------------------------------- | -------------------------------------------------- | --------------- |
| ER diagram panel      | `src/webview/main.ts`        | `src/webview/App.svelte`        | `dist/diagram-app.js` (iife, browser, es2022)      | `#app`          |
| Sidebar (all 4 views) | `src/sidebar/sidebar-app.ts` | `src/sidebar/SidebarApp.svelte` | `dist/sidebar-app.js` (same options)               | `#sidebar-root` |
| Extension host        | `src/extension.ts`           | —                               | `dist/extension.js` (cjs, node, `vscode` external) | —               |

CSS:

- `dist/tailwind.css` is produced by the **Tailwind CLI**, not esbuild
  (`npm run build:css` → `tailwindcss -i src/webview/styles/tailwind.css -o dist/tailwind.css`).
  It is loaded by **both** the diagram panel and every sidebar view.
- `dist/sidebar-app.css` is esbuild-svelte's scoped CSS from the only `<style>` block in the UI
  layer (`src/sidebar/components/SidebarSection.svelte`).
- **Why the name matters.** esbuild names a bundle's extracted CSS after its JS outfile, so
  while Tailwind wrote `dist/diagram-app.css` the two were on a collision course: a `<style>`
  block in any diagram-bundle `.svelte` file makes esbuild emit `dist/diagram-app.css`, and in
  `npm run package` esbuild runs _after_ Tailwind. Nothing rendered wrong at the time — no
  diagram component had styles — which is exactly why it would have surprised whoever added
  the first one. Separate names remove the trap rather than documenting it.
- `npm run watch` / `make watch` does **not** regenerate CSS. New Tailwind classes require
  `npm run build:css` (`make css`).

### Diagram app — `src/webview/`

Data is **not** pushed by message. `src/adapters/diagram/panel.ts` serializes
`serializeDiagram(project)` into an inline `window.__DIAGRAM_DATA__` script and rewrites
`webview.html` wholesale on every scan **while the panel is open and visible** — a render owed to a
hidden panel is flagged `renderOwed` and deferred until it comes back;
`lib/composables/diagram-data.ts` (`loadDiagramData()`)
reads that global and returns an empty skeleton if it is absent.

`App.svelte` renders the DOM tree (Toolbar / Timeline / ContextMenu / Toast / `#canvas` /
`#tooltip` / legend), then in `onMount` dynamically imports `$lib/composables/diagram-boot` and
calls `installDiagram()`, which imperatively wires drag, viewport, tooltip, persistence,
search/filter, blast-radius, compare and export against the DOM that was just rendered.

Viewport state survives the HTML swap through the VS Code webview state API
(`lib/composables/persistence.ts`): `{ version, positions, compareIdx?, zoom, scrollLeft,
scrollTop }`, saved via `setState` (debounced 300 ms), invalidated by `LAYOUT_VERSION`.

Structure:

| Directory                  | Contents                                                                                                                                                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `lib/components/atoms`     | The leaf components, plus `icons/` (inline Material Symbols SVG wrappers around `Icon.svelte`)                                                                                                                                       |
| `lib/components/molecules` | Composed controls — toolbar groups, panels, legends                                                                                                                                                                                  |
| `lib/components/organisms` | Full regions — the canvas chrome, tooltips, overlays                                                                                                                                                                                 |
| `lib/composables`          | `diagram-boot`, `diagram-data`, `draw-relations`, `search-filter`, `blast-radius`, `compare-mode`, `timeline-mode`, `persistence`, `export-svg`, `layout`, `pan-hint`, `error-reporting`, `stylesheet-guard`, `use-box-visual-state` |
| `lib/helpers`              | Pure helpers (`drag`, `viewport`, `path-math`, `search`, `compare`, `exports`, `tooltip-controller`, `zoom-chrome`, `python-highlight`, …)                                                                                           |
| `lib/state`                | 9 runes modules named `*.svelte.ts` (`toolbar`, `positions`, `relations`, `timeline`, `toast`, `dropdowns`, `context-menu`, `box-flags`, `compare-diff`) consumed directly as `toolbar.X` — no store subscriptions                   |
| `lib/types`                | Shared view-model types — `box-data.ts`, `relations.ts`, `tooltip-data.ts`, `diff-tooltip-data.ts`                                                                                                                                   |
| `lib/actions`              | `draggable.ts`                                                                                                                                                                                                                       |
| `styles`                   | `tailwind.css` — the design system                                                                                                                                                                                                   |

Each component level has a barrel `index.ts` of `export { default as X } from './X.svelte'`.
`icons/index.ts` is the real import surface for icons — an icon file added without touching the
barrel is invisible to `$icons` consumers.

### Sidebar app — `src/sidebar/`

**One bundle serves all four `WebviewView`s.** `SidebarWebviewProvider`
(`src/adapters/sidebar/_shared/webview-provider.ts`) emits
`<body data-section="views|layouts|orphans|models">`; `SidebarApp.svelte` reads
`document.body.getAttribute('data-section')` and mounts the matching component from
`src/sidebar/sections/` (`ViewsSection`, `LayoutsSection`, `OrphansSection`, `ModelsSection`).
An unknown or missing attribute renders a visible fallback.

Registered view ids (`src/adapters/sidebar/{views,layouts,orphans,models}.ts`, matching
`package.json` `contributes.views`):

| View id         | Adapter                           |
| --------------- | --------------------------------- |
| `djangoViews`   | `src/adapters/sidebar/views.ts`   |
| `djangoLayouts` | `src/adapters/sidebar/layouts.ts` |
| `djangoOrphans` | `src/adapters/sidebar/orphans.ts` |
| `djangoModels`  | `src/adapters/sidebar/models.ts`  |

The handshake is **pull-based**: `sidebar-app.ts` posts `{ type: 'ready' }` right after mount and
the provider flushes its cached `pendingPayload` in response. This replaced a fixed 50 ms
`setTimeout` that raced the cold mount when VS Code disposed and re-resolved a collapsed view,
leaving sections stuck on the loading skeleton. `acquireVsCodeApi()` is wrapped in a lazy
singleton (`src/sidebar/lib/vscode.ts`) because calling it twice per webview lifetime throws.

The other two files in that directory are the contract every section shares: `messages.ts` exports
`subscribeToData`, the single inbound `{ type: 'data' }` subscription — a section that adds its own
`message` listener instead loses the cached-payload replay the handshake exists to deliver, which
is how sections got stuck on the loading skeleton before — and `tree.ts` exports `TreeNodeData` /
`TreeIcon` / `TreeTrailingAction`, the node shape the shared `TreeView` and `TreeNode` consume.

### Message protocol — `src/shared/protocol/`

Extension → webview (`extension-to-webview.ts`) — sidebar only:

| Message                     | Payload                                                                                         |
| --------------------------- | ----------------------------------------------------------------------------------------------- |
| `{ type: 'data', payload }` | `SidebarViewsPayload \| SidebarLayoutsPayload \| SidebarOrphansPayload \| SidebarModelsPayload` |

The diagram panel receives **no** extension→webview messages; fresh data arrives by replacing
`webview.html`.

Webview → extension (`webview-to-extension.ts`):

| Source  | Message                                                                                                          |
| ------- | ---------------------------------------------------------------------------------------------------------------- |
| Sidebar | `{ type: 'ready' }`                                                                                              |
| Sidebar | `{ type: 'openModelDiagram' }`                                                                                   |
| Sidebar | `{ type: 'openFile', file, line }`                                                                               |
| Sidebar | `{ type: 'toggleLiveForView', viewKey }`                                                                         |
| Sidebar | `{ type: 'validateForView', viewKey }`                                                                           |
| Diagram | `{ type: 'ready' }` — posted once the diagram app mounts, so the host can tell a mounted app from an empty frame |
| Diagram | `{ type: 'refresh' }`                                                                                            |
| Diagram | `{ type: 'navigate', model }`                                                                                    |
| Diagram | `{ type: 'webviewError', message, filename?, line?, stack? }`                                                    |

`viewKey` is always the **qualified index key** `<app>.<name>` (`ViewLeaf.key`), never the display
name — it must round-trip through `project.views.byKey()`.

Note the current gap: `$shared/protocol` is imported only by the extension host
(`src/adapters/diagram/panel.ts` and `src/adapters/sidebar/_shared/webview-provider.ts`). No file
under `src/webview` or `src/sidebar` imports it; each section component re-declares its own local
wire type. The contract is hand-mirrored, not compiler-enforced. If you change a payload shape,
change both sides by hand.

### CSP and theming

Both HTML builders emit `default-src 'none'; style-src {cspSource} 'unsafe-inline';
script-src 'nonce-<random hex>'; img-src {cspSource} data:; font-src {cspSource}`, with the nonce
from `crypto.randomBytes(16).toString('hex')` and `localResourceRoots` limited to `dist/`. No
external fonts or images are possible. Both also hardcode `:root { color-scheme: dark; }`;
individual colors still resolve from `--vscode-*` vars.

`src/webview/styles/tailwind.css` is Tailwind v4 with an `@theme static` block: `--color-vsc-*`
tokens aliasing `--vscode-*` vars (with hex fallbacks), diagram-semantic colors (`--color-fk`,
`--color-m2m`, `--color-o2o`, `--color-danger`), a 4-stop type scale (meta 10 / label 11 / body
13 / heading 14px), radius `sm|md|lg|xl`, `--duration-fast` 150 ms / `--duration-slow` 400 ms,
elevation 1–3 and a named z-index scale (canvas 1–50, chrome 100, hint 150, tooltip 200/250,
popover 300, menu 500, help 1000, toast 10000). Use the named tokens: no arbitrary `z-[N]`, no
`rounded-[Npx]`, no raw `bg-vsc-link/[0.NN]` (use the accent ramp `subtle`/`soft`/`base`/`strong`).

**The accent-ramp rule is currently aspirational, and you should know that before you trust it.**
`rg -o 'bg-vsc-link/\[[0-9.]+\]|bg-vsc-link/[0-9]+' src/webview src/sidebar src/adapters` still
finds raw fills spread over more distinct opacities than the ramp has stops, in both bracketed
(`[0.05]` through `[0.28]`) and shorthand (`/5` `/10` `/15` `/20`) spellings — with the same value
written two ways in places (`[0.1]` and `[0.10]` and `/10`) — against a ramp of four stops, and
`strong` (35%) is reached for in `Button.svelte` alone. Only `0.08`, `0.14` and `0.22` land on a
stop at all. Snapping the rest is not a mechanical rename: it changes rendered opacity, so it is a
visual decision, not a cleanup. Until someone makes that decision deliberately, write new code
against the ramp and leave the existing values alone.

The `@source` globs in that file are mandatory (`../*.ts`, `../**/*.svelte`,
`../../sidebar/**/*.svelte`, `../../sidebar/**/*.ts`) — class strings live in TS template literals
and in the sidebar tree, both outside Tailwind's default scan.

---

## 5. Conventions

### Where does my change go?

| I want to…                                                               | Put it in                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parse new syntax out of a Python or template file                        | `src/domain/parsers/` (+ a `*.test.ts` next to it)                                                                                                                                                                                                                   |
| Add analysis over already-parsed data                                    | `src/domain/view-context/` (or the matching domain subdir)                                                                                                                                                                                                           |
| Add a new entity type to the index                                       | `src/domain/types/` + accumulate and index it in `src/infra/scanner.ts` pass 1/pass 2                                                                                                                                                                                |
| Read a new kind of file from disk                                        | Extend `INCLUDE_PATTERNS` + `routeFile()` in `src/infra/scanner.ts`                                                                                                                                                                                                  |
| Expose something to the editor (completion, hover, diagnostic, command…) | A new dir under `src/adapters/`, registered in `src/adapters/index.ts`                                                                                                                                                                                               |
| Add a command                                                            | `src/adapters/commands/<name>.ts`, wired into `src/adapters/commands/index.ts`, id via `cmdId()`, contributed in `package.json` unless it is internal                                                                                                                |
| Add UI to the diagram                                                    | `src/webview/lib/components/{atoms,molecules,organisms}` + its barrel                                                                                                                                                                                                |
| Add UI to the sidebar                                                    | `src/sidebar/sections/` for a new section — subscribe with `subscribeToData` (`src/sidebar/lib/messages.ts`) and render `TreeNodeData` (`src/sidebar/lib/tree.ts`) through the shared `SidebarSection` / `TreeView` / `LoadingSkeleton` in `src/sidebar/components/` |
| Change what crosses the webview boundary                                 | `src/shared/protocol/` **and** the hand-mirrored local type in the Svelte component                                                                                                                                                                                  |

### Hard rules

1. **Nothing in `src/domain` may import `vscode`, `node:fs`, `node:path`, `$infra`, `$adapters` or
   `$shared`** in production code. Test files may import `vitest`, `node:fs`, `node:path`.
2. **`src/infra` may import `$domain` only.** New `vscode` usage in infra must be a lazy
   `require('vscode')` behind an injectable seam, like `ScannerOpts.emitterFactory`.
3. **Only `src/adapters`, `src/extension.ts` and `src/shared/logger.ts` may import `vscode`
   eagerly.** The logger is the exception that explains rule 4: it is why the browser bundles
   alias `$protocol` rather than `$shared`, and why `src/architecture.test.ts` fails on a `$shared`
   import from either of them. Nothing outside `src/adapters` may import `$adapters`, except
   `extension.ts`.
4. **Adapter code must never import from `src/webview` or `src/sidebar`** — those are separate
   esbuild bundles, excluded from `tsconfig.json`. Talk to them through `$shared/protocol` only.
5. **Call `getProject()` inside handlers**, never at registration time.
6. **Do not reorder `ADAPTERS`** without checking the three ordering constraints above.
7. **Register secondary indexes before using `byProperty`** — `IndexImpl` throws otherwise, by design.
8. **Alias changes touch all declaration sites** (`tsconfig.json`, `tsconfig.webview.json`,
   `esbuild.js`, `vitest.config.ts`).
9. **`Project` is frozen and identity-significant.** Never mutate a snapshot; downstream
   memoization (`graphFor`) is keyed on object identity.

### Testing expectations

| Layer                        | Test style                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Environment                    |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `src/domain`                 | Pure unit tests, `*.test.ts` beside the source. No mocks needed — feed strings/data in, assert data out                                                                                                                                                                                                                                                                                                                                                                                | vitest `node`                  |
| `src/infra`                  | Unit tests with `InMemoryFileSystem`, injected `parsers`, injected `emitterFactory`, injected `logger`. See `scanner.test.ts`, `cache.test.ts`, `index-impl.test.ts`, `watcher.test.ts`, `file-system.test.ts`, `view-key.test.ts`                                                                                                                                                                                                                                                     | vitest `node`                  |
| `src/adapters`               | Anything that can be decided without an extension host has a unit test beside it: the helpers under `_shared/` and `diagnostics/_shared/`, plus the parts split out of providers for exactly that reason (`hover/segment-kinds`, `hover/cursor-anchored-range`, `diagram/boot-watchdog`, `diagram/inbound-message`, `script-filter/suppression-plan`, `file-decoration/orphan-logic`, `sidebar/sidebar-data`). What is left to the integration suite is the `register()` wiring itself | vitest `node` / extension host |
| `src/webview`, `src/sidebar` | Tests that need a document opt into jsdom with a `@vitest-environment jsdom` docblock — the four mount tests (`main-mount`, `app-mount`, `sidebar-app`, `sections`), the hostile-host test (`app-hostile`), the shared tree components (`tree-view`) and the two composables that read the DOM (`search-filter`, `stylesheet-guard`). Everything else under those trees is a pure helper test and stays in `node`                                                                      | vitest `jsdom`                 |

Vitest collects `src/**/*.test.ts` and excludes `node_modules`, `dist`, `out`,
`**/__fixtures__/**` and `src/integration-tests/**`. Default environment is `node`, timeout 5000 ms,
setup file `vitest.setup.ts` (shims `Element.prototype.animate`, `scrollIntoView` and
`window.matchMedia`, which jsdom lacks).

Svelte files in tests are compiled by a hand-rolled `svelteTestCompile()` plugin in
`vitest.config.ts` using `svelte/compiler` directly, **not** `@sveltejs/vite-plugin-svelte`: the
official plugin's current major requires vite 8, whose peer range wants esbuild `^0.27` while this
repo pins esbuild `^0.24`. The config also aliases bare `svelte` to
`node_modules/svelte/src/index-client.js`, otherwise Node resolves the SSR entry and `mount()`
throws `lifecycle_function_unavailable`.

Integration tests are one file, `src/integration-tests/suite/extension.test.ts`, run inside a
real Extension Host by
`src/integration-tests/run.ts` via `@vscode/test-electron`, with Mocha `ui: 'tdd'`,
`timeout: 30000` and `retries: 2`. The runner opens `src/test-django-project` as the workspace,
`pkill`s leftover `.vscode-test` processes first, and a root-level `suiteSetup` warms the
formatter once with a 60 s budget. It needs a display: CI supplies one via `xvfb-run -a`
(`.github/workflows/ci.yml`); a bare local run has to provide its own.

### Commands

```bash
npm run compile            # node esbuild.js — all three bundles, no CSS
npm run watch              # esbuild watch, all three contexts, NO CSS regen
npm run build:css          # tailwind → dist/tailwind.css  (make css)
npm run check-types        # tsc --noEmit -p tsconfig.json && -p tsconfig.webview.json
npm run check-svelte       # svelte-check --tsconfig tsconfig.svelte.json --threshold error
npm run test               # vitest run
npm run test:watch         # vitest
npm run test:integration   # compile + build:css + compile:integration + out/src/integration-tests/run.js
npm run package            # clean:dist + check-types + check-svelte + lint + format:check + unit tests + build:css:prod + esbuild --production
```

`make` with no target prints the self-documenting help. `make verify` (check-types +
check-svelte + unit tests) is what the Makefile calls the pre-commit gate, but the hook Git
actually runs is `.husky/pre-commit`, which execs lint-staged over the staged paths only:
`eslint --fix` then `prettier --write`, in that order because `eslint-config-prettier` switches off
every stylistic rule and leaves Prettier the last word. The whole-tree answer belongs to
`npm run package` and `.github/workflows/ci.yml`, which run check-types, check-svelte, lint,
format:check and the unit suite — so none of type errors, Svelte type errors, lint errors or
formatting drift can reach a `.vsix`. Only the integration suite sits outside `npm run package`;
CI runs it separately under `xvfb-run`.

### Typecheck boundaries

| tsconfig                    | Covers                                                                                               | Notes                                                                                                                                                                                                                                                                                      |
| --------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tsconfig.json`             | Extension host (`src/**/*.ts`)                                                                       | Node16 modules, ES2022, `types: [node, vscode]`. **Excludes** `src/webview`, `src/sidebar`, `src/integration-tests`. Strict extras on: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitReturns`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch` |
| `tsconfig.webview.json`     | `src/webview`, `src/sidebar`, `src/shared` + the single file `src/domain/diagram/diagram-layout.ts`  | ESNext/Bundler, `lib: [ES2022, DOM, DOM.Iterable]`, `types: []` — no node, no vscode                                                                                                                                                                                                       |
| `tsconfig.svelte.json`      | Extends `tsconfig.webview.json`, adds `verbatimModuleSyntax` + `isolatedModules`, includes `.svelte` | Used by `svelte-check`                                                                                                                                                                                                                                                                     |
| `tsconfig.integration.json` | `src/integration-tests/**/*.ts` → `out/`, `rootDir: .`                                               | Hence the runner path `out/src/integration-tests/run.js`                                                                                                                                                                                                                                   |

`svelte.config.js` sets `compilerOptions.runes = true` **and** forces `verbatimModuleSyntax` inside
svelte-preprocess's TypeScript options. Without the latter, `transpileModule` strips component
imports that look unused to TS (template usage is invisible to it) and the bundle throws
`X is not defined` at runtime.

### Shipping

Only `dist/**` (sourcemaps excluded), `resources/**`, `language-configuration.json`,
`package.nls.json`, `package.json`, `LICENSE` and the two marketplace documents (`README.md`,
`CHANGELOG.md`) go into the `.vsix`; `src/**`, `out/**`, `scripts/**`, `docs/**`,
`CONTRIBUTING.md`, `**/*.ts` and `**/*.map` are excluded by `.vscodeignore`. The only runtime dependency is
nothing: the extension ships with zero runtime dependencies. `fast-glob` is a devDependency backing only `NodeFileSystem`, which esbuild tree-shakes out of the bundle — production scanning uses `VsCodeFileSystem` (`workspace.findFiles` + `workspace.fs`). Marketplace-facing strings are localized through `package.nls.json`
(`%displayName%` / `%description%`).
