# infra

Infrastructure layer — everything that touches the outside world: globbing and reading
files, indexing the results into an immutable `Project`, caching parses and watching for
changes.

**Dependency direction is infra → domain.** Infra imports `$domain/parsers`, `$domain/types`
and — for the cross-file resolution pass2 does — `$domain/view-context`, and never imports
`$adapters` or `$shared`. The contracts it implements are domain-owned: `Project`
(`$domain/contracts/project`) and `Index<T,K>` (`$domain/contracts/index-type`).
`types/project.ts` and `types/index-type.ts` are pure re-export shims kept so legacy
`$infra/types` imports keep compiling.

**vscode exception.** Infra touches `vscode` in exactly three places, all via a lazy
`require('vscode')` so unit tests run headless: `VsCodeFileSystem` in `vscode-file-system.ts`,
`VsCodeWatchAdapter` in `watcher.ts`, and the `EventEmitter` fallback in `scanner.ts`. Pass
`ScannerOpts.emitterFactory` to construct a Scanner outside the extension host.

## Modules

| File                    | Owns                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scanner.ts`            | The two-pass scan and the `Project` snapshot factory                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `index-impl.ts`         | `IndexImpl<T,K>` — the domain `Index` contract over a primary `Map` plus optional secondary indexes                                                                                                                                                                                                                                                                                                                                                                                                         |
| `cache.ts`              | `ParseCache` — bounded **LRU** keyed by path, guarded by mtime. Cap 2000 by default, grown by `ensureCapacity` to the file list the glob just returned plus a margin. `get` re-inserts; FIFO evicted the file being edited as readily as an untouched one, and a FIXED cap was worse than either eviction policy: a sequential sweep longer than the cache evicts each entry just before the next pass asks for it, so an unchanged project one file over the cap re-parsed every file in it                |
| `file-system.ts`        | The `FileSystem` port (`readFile`/`glob`/`stat`), with `NodeFileSystem` (fast-glob) and `InMemoryFileSystem` for tests                                                                                                                                                                                                                                                                                                                                                                                      |
| `vscode-file-system.ts` | The **production** `FileSystem`: `workspace.findFiles` + `workspace.fs`. Native search service instead of a JS directory walk — the difference is large when the workspace is a devcontainer bind mount — and it honours the user's `files.exclude`. One of the three files allowed to import `vscode`                                                                                                                                                                                                      |
| `glob-translate.ts`     | Pure helpers turning the port's absolute globs into `RelativePattern` base+pattern pairs and one brace-joined exclude                                                                                                                                                                                                                                                                                                                                                                                       |
| `exclude-paths.ts`      | The directories nothing ever looks inside, as one list rather than the scanner's glob array and the watcher's segment names reconciled by hand. `.*` is a wildcard for any dot-directory, because enumerating them by name meant the list knew `.venv` and `.tox` and happily scanned `.direnv`. A user's `excludePaths` replaces the ASSET roots (`static`, `media`) and not the tooling ones — a `.vscode/settings.json` any repository can carry used to put the scanner to work indexing `node_modules` |
| `watch-globs.ts`        | The watch scope, taken verbatim from the scanner's `INCLUDE_PATTERNS`, plus `isWatchablePath()` — the gate that stops a `.venv` write from triggering a full rescan                                                                                                                                                                                                                                                                                                                                         |
| `watcher.ts`            | `WatchAdapter` interface, `VsCodeWatchAdapter`, `DebouncedWatcher`                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `view-key.ts`           | Single source of truth for the qualified view key `'<app>.<name>'`                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `index.ts`              | Public barrel. Note the trap: this is the BARREL — `Index<T,K>` lives in `index-impl.ts`                                                                                                                                                                                                                                                                                                                                                                                                                    |

## Scan pipeline

`scan(roots)` runs pass1 then pass2, fires `onDidChange` and returns the frozen `Project`.

- **pass1** prefixes each root onto the `INCLUDE_PATTERNS` (models/views/forms/urls/
  migrations/helpers/templatetags `.py` plus `templates/**/*.{html,txt}`), globs them with the exclude
  globs `buildExcludeGlobs()` derives from `DEFAULT_EXCLUDE_SEGMENTS` (`exclude-paths.ts` — a
  `.*` dot-directory wildcard, venvs, `node_modules`, caches, `dist`, `static`, `media`, …) and
  parses through a **worker pool capped at 48 in flight**, **each file in its own try/catch** —
  one unreadable file costs that file, not the pass. `routeFile()` checks `/migrations/`
  **first** so migration files never collide with `models.py` on basename; unroutable files are
  skipped. A file is stat'd when the pass is structural or a batch named that path, and otherwise
  answered from the stats the last sweep remembered — everything downstream still keys on
  `(path, mtime)`. Anything over `MAX_PARSED_FILE_BYTES` is logged and skipped instead of read:
  every route reads the file whole and parses the string, so one generated migration or vendored
  bundle a template glob happens to reach is an unbounded allocation on the extension host.
  Results are cached only when the parse succeeds. All 7 parsers are injectable via
  `ScannerOpts.parsers`. A **content-only** rescan skips the glob and reuses the previous file
  list.
- **pass2** first resolves what no single file can answer: choice symbols imported from another
  module, base classes declared elsewhere, `AUTH_USER_MODEL` (its own glob over `settings.py` and
  `settings/*.py`, which `INCLUDE_PATTERNS` does not cover), view helpers defined outside the
  view's file, and views synthesised from `urls.py` entries. So pass1 is not the only pass that
  reads disk — a change to a settings module or a helper module reaches the project through
  pass2, not the glob. It then builds one `IndexImpl` per entity — keys: models/migrations
  `app.name`, views `viewKey(v)`, forms `qualifiedAppLabel(filePath).name`, templates
  `relativePath || filePath`, urls `u.name`, helpers `library.name`. That app label is qualified
  by the root's own folder name once a workspace has more than one root, because
  `'<app>.<name>'` is unique inside one Django project and not across two: a developer with an
  API and its admin open side by side has a `core` in each, and `core.index` from one silently
  overwrote `core.index` from the other. Secondary indexes exist only for models `appLabel`,
  migrations `appLabel` and helpers `library`. `byProperty()` **throws** on an unregistered
  property, deliberately, to prevent silent O(n) scans. Then `resolveTemplates` validates
  `extends`/`include` against the template index by suffix match — a `Set` of every
  segment-boundary suffix, built once per pass instead of a `.some()` per reference — and
  resolves `__url__:` refs (`__static__:` passes through); unresolved refs only warn, entities
  are never dropped.

The snapshot is `Object.freeze`d and gets a new identity plus a fresh
`workspaceFingerprint` on every scan — that is what makes WeakMap memoization downstream correct.
`IndexImpl.all()` returns the **same frozen array** until the index changes, for the same
reason: it used to allocate a fresh copy per call, so any `WeakMap` keyed on it missed every
time and the memo silently never worked.

Passes are **serialised** through an internal promise chain. pass2 `clear()`s caches that a
concurrent pass2 would still be filling, and without the chain the older of two overlapping
scans could be the one that reached `emitter.fire` last.

## Invalidation

`VsCodeWatchAdapter` watches exactly `INCLUDE_PATTERNS` (see `buildWatchGlobs` in `watch-globs.ts`)
and normalizes paths to POSIX. It is NOT `**/*.py`: watching every Python file means every write
inside an in-workspace `.venv` or `site-packages` triggers a rescan, which is wasteful on a laptop
and painful in a devcontainer where the workspace is a bind mount.
`DebouncedWatcher` coalesces change/delete/create into one `Set` on a 200 ms timer and calls
`scanner.invalidateBatch(batch, { structural })`. It tracks **which** event fired: create and
delete change the set of files, a plain change does not, and the scanner cannot tell from a
path alone. `invalidateBatch` evicts those paths from the cache and queues a pass over the last
roots — correctness comes from the warm cache, and without `structural` the glob is skipped
entirely. Batches arriving mid-pass are coalesced into the next one. The returned promise is
no longer discarded: its rejection is the only signal a rescan died. If no scan has happened
yet the call returns without emitting.
