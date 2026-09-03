# Contributing

Django Language Service is a VS Code extension: Django Template Language support
plus an interactive ER diagram for your models. This document covers how to get
the project building, how to run each test layer, and the conventions the repo
expects.

---

## Prerequisites

| Tool    | Version                                      | Why                                                                                                                                          |
| ------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Node.js | 20+ for build/tests, 22+ for the CDP harness | `@types/node` is pinned to `^20.11.0`; `scripts/vscode-cdp-harness/engine.mjs` relies on global `fetch` and `WebSocket`, which need Node 22+ |
| npm     | ships with Node                              | the repo has a `package-lock.json`; use `npm ci` or `npm install`                                                                            |
| VS Code | `^1.85.0`                                    | declared in `engines.vscode`                                                                                                                 |

There is no `engines.node` field and no `.nvmrc` — pick a Node version from the
table above yourself, and know that CI runs on Node 24
(`.github/workflows/ci.yml`). Pick something else and the first sign of the
difference is a red pull request that reproduces nowhere locally.

On Linux, the integration suite and the CDP harness both
launch a real Electron window, so they need a display. CI runs the suite under
`xvfb-run` (see `.github/workflows/ci.yml`); locally it opens a real window.

Every package is a devDependency: the extension ships with **zero runtime dependencies**. `fast-glob` backs only `NodeFileSystem`, which tests use and esbuild tree-shakes out of `dist/extension.js` — production scanning goes through `VsCodeFileSystem` and the VS Code search service.

---

## Getting started

```bash
npm install          # or: make install
npm run compile      # one-off dev build (esbuild)
npm run build:css    # Tailwind stylesheet — esbuild does NOT do this
```

`npm install` is also what installs the pre-commit hook: the `prepare` script
runs `husky`, which points `core.hooksPath` at `.husky/_`. Git hooks are not
cloned, so on a fresh clone nothing runs until that first install — and until it
has run, `git commit` is unguarded. If you ever need to re-arm it by hand:

```bash
npx husky              # or just: npm install
git config --get core.hooksPath   # should print .husky/_
```

See [Pre-commit hook](#pre-commit-hook) for what it does.

One other thing a fresh clone needs, once:

```bash
git config blame.ignoreRevsFile .git-blame-ignore-revs
```

`.git-blame-ignore-revs` lists the whole-tree Prettier reformat, and nothing
else. GitHub's blame view reads the file by itself; local `git blame` does not,
so until that command has run, every reformatted line is attributed to the
whitespace commit instead of to whoever wrote it.

Then run the extension in an Extension Development Host: press `F5` in VS Code
and pick the **Run Extension** launch configuration (`.vscode/launch.json`). It:

- opens `src/test-django-project` as the workspace (a real Django fixture project),
- passes `--extensionDevelopmentPath=${workspaceFolder}`,
- runs the default build task (`watch`) first, which is `npm run watch` behind
  the `$esbuild-watch` problem matcher, so the host waits for the bundle.

The `$esbuild-watch` matcher comes from the `connor4312.esbuild-problem-matchers`
extension. Recommended extensions live in `.vscode/extensions.json`:
`svelte.svelte-vscode` and `connor4312.esbuild-problem-matchers`.

---

## Commands

### npm scripts

| Script                | What it actually does                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prepare`             | `husky` — installs the pre-commit hook. npm runs it after every `npm install` / `npm ci`; you never call it directly                                                                                                                                                                                                                                                                                                                                                                    |
| `compile`             | `node esbuild.js` — builds all three bundles with sourcemaps                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `watch`               | `node esbuild.js --watch` — rebuilds all three bundles on change                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `check-types`         | `tsc --noEmit` twice: `tsconfig.json` (extension host) and `tsconfig.webview.json` (browser)                                                                                                                                                                                                                                                                                                                                                                                            |
| `check-svelte`        | `svelte-check --tsconfig tsconfig.svelte.json --threshold error`                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `build:css`           | `tailwindcss -i src/webview/styles/tailwind.css -o dist/tailwind.css`                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `build:css:prod`      | same, with `--minify`                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `package`             | `clean:dist` + `check-types` + `check-svelte` + `lint` + `format:check` + **`npm test`** + `build:css:prod` + `node esbuild.js --production` (minified, no sourcemaps). The test gate is deliberate: `vscode:prepublish` used to type-check and bundle without running a single test, so a release could ship red                                                                                                                                                                       |
| `lint`                | `eslint .` — whole tree. What it rejects, since the hook will reject it for you: `console.log` (only `console.error` and `console.warn` are allowed), `any`, an unused binding without a `_` prefix, `catch {}` that discards the reason, `let` where `const` would do, and `==`. Relaxed for `**/*.test.ts`, `src/test-support/**`, `src/integration-tests/**` and `scripts/**`, which log and measure on purpose. Formatting is not its job: `eslint-config-prettier` is applied last |
| `lint:fix`            | `eslint . --fix`                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `format`              | `prettier --write .` — whole tree                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `format:check`        | `prettier --check .` — whole tree, no writes. This is the CI gate                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `test`                | `vitest run` — unit tests, once                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `test:watch`          | `vitest` — unit tests in watch mode                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `compile:integration` | `tsc -p tsconfig.integration.json` → emits the Mocha suite to `out/`                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `test:integration`    | `compile` + `build:css` + `compile:integration` + `node out/src/integration-tests/run.js`                                                                                                                                                                                                                                                                                                                                                                                               |
| `vscode:prepublish`   | `npm run package` — vsce triggers this automatically                                                                                                                                                                                                                                                                                                                                                                                                                                    |

`node esbuild.js` produces exactly three outputs:

| Output                | Format                                  | Entry                        |
| --------------------- | --------------------------------------- | ---------------------------- |
| `dist/extension.js`   | CJS, platform `node`, `vscode` external | `src/extension.ts`           |
| `dist/diagram-app.js` | IIFE, platform `browser`, ES2022        | `src/webview/main.ts`        |
| `dist/sidebar-app.js` | IIFE, platform `browser`, ES2022        | `src/sidebar/sidebar-app.ts` |

`dist/sidebar-app.js` is a single bundle loaded into all four sidebar
`WebviewView`s (Views / Layouts / Orphans / Models); each instance picks its
section at runtime from a `data-section` attribute on `<body>`.

### Make targets

`make` (or `make help`) prints the whole self-documenting target list. The
targets are thin wrappers over the npm scripts, except these, which add value:

| Target        | What it adds                                                 |
| ------------- | ------------------------------------------------------------ |
| `make check`  | `check-types` **and** `check-svelte` in one go               |
| `make verify` | the pre-**merge** gate you run by hand: `check` + unit tests |
| `make vsix`   | `npx @vscode/vsce package`                                   |
| `make clean`  | `rm -rf dist out .vscode-test`                               |

Three things worth knowing:

- `@vscode/vsce` **is** a pinned devDependency now, so `make vsix` resolves from
  the lockfile instead of downloading an unpinned version over the network.
- `make verify` does **not** run the integration suite. Run
  `make test-integration` yourself before anything that matters — CI does.
- `make clean` deletes `.vscode-test`, which holds the downloaded VS Code
  binaries. The next `make test-integration` re-downloads them.

---

## Pre-commit hook

### Installing it

It installs itself. `npm install` (or `npm ci`) runs the `prepare` script, which
runs `husky`, which sets `core.hooksPath` to `.husky/_`. Git never clones hooks,
so **a fresh clone is unguarded until the first install** — that is the one step
you have to remember, and it is the step you were going to run anyway.

```bash
git clone …
cd django-language-service
npm install                        # arms the hook
git config --get core.hooksPath    # .husky/_
```

To turn it off for one session (a bisect, a scripted batch of commits), set
`HUSKY=0` in the environment. That is deliberate and different from
`--no-verify`, which is forbidden — see [Conventional Commits](#conventional-commits).

### What it does

`.husky/pre-commit` runs exactly one thing: `lint-staged`, configured in
`lint-staged.config.mjs`.

| Staged file                           | Runs                                                      |
| ------------------------------------- | --------------------------------------------------------- |
| `*.{ts,mts,js,mjs,cjs,svelte}`        | `eslint --fix --no-warn-ignored`, then `prettier --write` |
| `*.{json,jsonc,md,css,html,yml,yaml}` | `prettier --write --ignore-unknown`                       |

Both run in **fix** mode and both are handed the staged paths explicitly.
Anything they rewrite is re-staged, so the commit contains the fixed version.
ESLint runs first: `eslint-config-prettier` leaves ESLint with no formatting
opinion, so Prettier gets the last word and the result is what
`npm run format:check` will accept.

### What it deliberately does not do

Not `check-types`, not `check-svelte`, not `npm test`, and not the whole-tree
`eslint .` / `prettier --check .`. Those five need the whole tree to mean
anything, and they cost what they cost:

| Gate           | Whole tree | This hook, staged files only    |
| -------------- | ---------- | ------------------------------- |
| `check-types`  | 6.0 s      | —                               |
| `check-svelte` | 5.9 s      | —                               |
| `lint`         | 7.5 s      | ~2.0 s (1 file) / 2.7 s (20)    |
| `format:check` | 11.0 s     | ~0.5 s (1 file) / 1.6 s (20)    |
| `test`         | 24.1 s     | —                               |
| **total**      | **54.5 s** | **1.5 s (1 file) / 2.8 s (20)** |

Measured on an 8-core Linux box under moderate load; treat them as an order of
magnitude, not a benchmark. Most of the hook's cost is fixed process start-up —
ESLint spends ~1.9 s booting the flat config and typescript-eslint before it
reads a line, and only ~40 ms per additional file after that. That is why a
twenty-file commit costs less than twice a one-file commit.

The reasoning is not about purity. **A hook the developer wants to skip is a
hook that gets skipped**, and this repo forbids `--no-verify`, so the hook is
only allowed to cost what a developer will not resent. A commit that stages
nothing lint-staged recognises exits immediately.

### When it steps aside

The hook exits 0 without running anything if a `MERGE_HEAD`, `CHERRY_PICK_HEAD`
or `REVERT_HEAD` marker is present, or if a rebase is in progress
(`rebase-merge` / `rebase-apply`). Two reasons:

- lint-staged stashes the working tree to isolate the index; a stash taken
  mid-merge drops the merge state.
- Those commits replay content you did not type. A rebase that reformats
  somebody's commit as it replays it is a rebase that produces conflicts on the
  next one.

Git already routes the conflict-free merge commit to `pre-merge-commit`, which
this repo does not define, so that case never reaches the hook at all. The guard
covers the conflicted merge (which ends in a plain `git commit`) and
`commit --amend` under an interactive rebase.

Two more cases that are handled rather than failed: a commit that only **deletes**
files runs no task at all (lint-staged filters the index with
`--diff-filter=ACMR`), and a staged file that ESLint or Prettier is configured to
ignore is skipped quietly (`--no-warn-ignored`, `.prettierignore`). The only way
this hook fails is a real lint error in a file you staged — or a missing
`node_modules`, and it says so in those words.

### One failure mode worth recognising

`lint-staged automatic backup is missing!` means something else ran `git stash`
while the hook was working. lint-staged backs the working tree up into
`refs/stash`, and `refs/stash` is **shared by every worktree of the repo** —
`git rev-parse --git-path refs/stash` resolves to the common `.git/`, not to the
per-worktree directory. So a `git stash` in a second `git worktree`, or in
another terminal, can displace the backup lint-staged is holding.

Nothing is lost when this happens: the working tree and the index are left as
they were and the commit is simply refused. Re-run the commit.

---

## Testing

### Unit tests — vitest

```bash
npm run test        # make test
npm run test:watch  # make test-watch
```

Unit tests are every file matching `src/**/*.test.ts`. Vitest excludes `node_modules`,
`dist`, `out`, `**/__fixtures__/**` and `src/integration-tests/**`. Default
environment is `node`, `testTimeout` 5000 ms, setup file `vitest.setup.ts`.

Coverage spans the pure layers and the UI:

- **Parsers** (`src/domain/parsers`) — models, views, forms, urls, templates,
  migrations, DTL tag/filter inventory, helper `register.tag`/`register.filter` scans.
- **Domain** — formatting, folding, comments, include-pretty, diagram
  serialization/layout, view-context inference.
- **Infra** (`src/infra`) — the generic `Index`, the parse cache, the `FileSystem`
  port (Node + in-memory), the scanner (including a scanner integration test over
  a fixture project), the debounced watcher, view keys.
- **jsdom opt-ins** — a file that needs a DOM says so in a docblock,
  `// @vitest-environment jsdom`, and nothing else does. That is the component
  mount tests (`src/webview/app-mount.test.ts`, `app-hostile.test.ts`,
  `main-mount.test.ts`, `src/sidebar/sidebar-app.test.ts`,
  `sections/sections.test.ts`, `components/tree-view.test.ts`) plus the
  composables that read a real DOM node or a real stylesheet
  (`src/webview/lib/composables/search-filter.test.ts`,
  `stylesheet-guard.test.ts`). Everything else runs under plain `node`.

#### Guarding a hot loop

Never assert a millisecond threshold. `measureScaling` in
`src/test-support/scaling.ts` processes the same total work as many small
batches and as one large batch, times the two alternately in equal-length
windows, and returns the RATIO: a linear implementation lands near 1, a
quadratic one near `factor`. Assert on that ratio. The absolute threshold this
helper replaced — `expect(elapsed).toBeLessThan(50)` — failed twice in one
afternoon at 123 ms and 127 ms with nothing changed, and would have passed a
threefold slowdown without a word: flaky and insensitive at once. Build the
input in `prepare`, which runs outside the timed region, and name a test whose
only subject is scaling `*.scaling.test.ts`.

Two pieces of test infrastructure are deliberate and fragile enough to be worth
reading before you touch them:

- `vitest.config.ts` compiles `.svelte` files with a **hand-written plugin**
  (`svelteTestCompile`), not `@sveltejs/vite-plugin-svelte`. The official plugin's
  current major requires vite 8, whose peer range wants `esbuild ^0.27`, while the
  extension build pins `esbuild ^0.24` — installing it leaves `npm install`
  permanently broken on ERESOLVE.
- The same config aliases the bare `svelte` specifier to
  `node_modules/svelte/src/index-client.js` and inlines `/^svelte(\/|$)/`.
  Without it, Node's resolver hands tests the SSR entry and `mount()` throws
  `lifecycle_function_unavailable`.
- `vitest.setup.ts` shims three APIs jsdom lacks, each guarded on existence:
  `Element.prototype.animate` (Svelte 5 `transition:slide`),
  `Element.prototype.scrollIntoView`, and `window.matchMedia` (the stub always
  returns `matches: false`, so the wide-toolbar branch renders).

#### Testing an adapter without VS Code

Adapters import `vscode`. `src/adapters/_shared/__fixtures__/vscode-double.ts`
stands in for it:

```ts
// Hoisted above every import below, so the adapter loads against the double.
vi.mock(
  'vscode',
  () => import('$adapters/_shared/__fixtures__/vscode-double.js'),
);
```

Then `register(ctx, services)` — **that argument order**, it is the commonest
mistake and it produces a provider that answers `undefined` to everything — and
`lastRegistered<T>()` hands you what it registered. `resetRegistered()` between
tests.

The project data is the other half of the harness, and it has a double too:
build it with `urlEntry` and `viewEntry` from
`src/adapters/_shared/__fixtures__/project-double.ts`, which sits on the real
`IndexImpl` so `byKey` resolves exactly as it does in production. A hand-written
`{ byKey: k => map.get(k) }` agrees with your test and with nothing else.

There are two kinds of adapter and they are driven differently:

- **Request/response** — hover, completion, definition, code actions. Build a
  `TextDocumentDouble(source, languageId, uri)`, ask it for a `Position` with
  `positionAt(offset)`, and call the provider. `Position`/`Range`/`Location`
  arithmetic is real, and `Location` normalises a `Position` to an empty range
  the way the real constructor documents.
- **Reactive** — diagnostics, the script/style filter. These answer no request:
  they subscribe to workspace events and write into a collection. Fire
  `documentEvents.open/change/save/close`, then read
  `diagnosticCollections.get(name)`. A collection **throws** on a write after
  `dispose()`, so "the pending timer never ran" is something you assert rather
  than assume.

**Add the class you need when it is missing.** The double is not complete, and
an absent class does not fail loudly: `new vscode.Diagnostic(...)` throws inside
the provider's own `try/catch`, which logs and returns `undefined` — a silent
zero. Two tests this session went green against providers that were returning
nothing at all, and in both cases the thing that caught it was a CONTROL: an
assertion that the provider DOES answer in the ordinary case. Write that one
first. A red run whose control is also red is a broken harness, not a defect.

### Integration tests — @vscode/test-electron

```bash
npm run test:integration   # make test-integration
```

This chains `npm run compile` → `npm run build:css` → `npm run compile:integration` →
`node out/src/integration-tests/run.js`. The stylesheet is in there because the
webviews the suite opens link the built `dist/tailwind.css`, and a missing one is
a passing test with an unstyled panel behind it.

It is **not** part of `npm test`, and it is not part of `npm run package` either —
it needs a display. CI runs it under `xvfb-run`; locally it opens a real window.

`src/integration-tests/run.ts` downloads (or reuses) a VS Code build — pinned to
an exact `1.132.0`, not `stable`. On `stable` a release of VS Code turns a green
suite red without a line of code changing, and the 334 MB the runner then goes
and fetches fails in a way indistinguishable from a failing test; bump the pin on
purpose. CI keys its `.vscode-test` cache on a hash of `run.ts`, so a bump
re-downloads the build once. The pin also means the suite says nothing about the
`^1.85.0` floor `engines.vscode` promises users. It opens
`src/test-django-project` as the workspace, and launches Electron with
`--disable-extensions --disable-gpu --no-sandbox --disable-dev-shm-usage` and an
isolated `--user-data-dir=.vscode-test/test-user-data`, so it can run alongside
your normal VS Code. Before launching it `pkill`s leftover processes scoped to
this repo's `.vscode-test` directory — without that, a crashed prior run makes the
next invocation fail with _"Running extension tests from the command line is
currently only supported if no other instance of Code is running."_

The suite itself is one file, `src/integration-tests/suite/extension.test.ts`. The Mocha loader
uses `ui: 'tdd'`, `timeout: 30000` and `retries: 2` — the retries are deliberate,
because the fixture project holds a couple of hundred models, and activation and
scanner contention occasionally push timing-sensitive tests over their sleeps.

Two details that look like bugs but are not:

- A root-level `suiteSetup` warms the formatter **once** with a 60 s budget before
  any suite runs. On a cold Extension Host the first format call resolves without
  applying any edit, so it primes providers via
  `vscode.executeFormatDocumentProvider` and then polls `editor.action.formatDocument`
  until an edit actually lands.
- `src/test-django-project/.vscode/settings.json` pins `editor.defaultFormatter`
  to `velezanthony.django-language-service` for `[html]`, `[django-html]` and
  `[django-txt]`. This is **test-workspace-only**: the built-in
  html-language-features extension survives `--disable-extensions` and races our
  provider. A contract test reads that file and compares each pin against
  `${publisher}.${name}` from `package.json`, so renaming either fails loudly
  instead of leaving a ghost pin. The shipped extension does not claim
  `editor.defaultFormatter`.

Integration fixtures resolve from the **source** tree
(`src/integration-tests/fixtures/`), not from `out/` — `tsc` does not copy them
and does not need to.

### CI

`.github/workflows/ci.yml` runs on pushes to `main` and on every pull request:

```
npm ci → check-types → check-svelte → lint → format:check → npm test
       → xvfb-run npm run test:integration → vsce package
```

That order is the point. The repo's own checklist says _"main siempre verde"_, and
until this workflow existed nothing checked it: there was no CI, and
`vscode:prepublish` ran type-checks and a bundle **without executing a single
test**, so a release could ship red. `npm run package` now chains the tests too,
which means the last step also proves the VSIX only builds off a green tree.

### The documentation site

Every document at the repository root and under `docs/` is published to
[velezanthony.github.io/django-language-service](https://velezanthony.github.io/django-language-service/)
by `.github/workflows/docs.yml`, on a push to `main` that touches any of them.
Enabling it needs one thing done by hand, once: **Settings → Pages → Source →
GitHub Actions**.

**There is no local command, deliberately.** MkDocs is Python and this
repository is TypeScript, so the pipeline lives entirely in the workflow —
nothing in `package.json` references it, nothing in the tree is installed to
run it, and the versions are pinned in the workflow because that is the only
place that needs them. `--strict` is what makes that safe: a broken internal
link fails the build, so the deploy job never runs and nothing broken is
published.

Three things in `mkdocs.yml` are load-bearing and easy to undo by accident:

- **`site_url`.** MkDocs derives `sitemap.xml` from it. Remove it and the
  sitemap is still written, with relative URLs, inert and indistinguishable
  from a working one.
- **`docs_dir: .` with the `same-dir` plugin.** README, CHANGELOG and
  CONTRIBUTING have to stay at the repository root — GitHub renders README
  there, offers CONTRIBUTING when a PR is opened, and the Marketplace reads
  README from the root of the package. MkDocs will not otherwise accept a
  `docs_dir` that holds its own config file.
- **The GitHub slug algorithm in `markdown_extensions.toc`.** These documents
  render in both places and their cross-links are written for GitHub.
  `## \`{% include %}\` refactoring`anchors as`#-include--refactoring`there
and as`#include-refactoring` under Python-Markdown's default, so the
  README's own table of contents breaks on whichever target it was not written
  for.

### CDP harness — driving a real VS Code

`scripts/vscode-cdp-harness/` is a zero-dependency rig that launches a real VS
Code with `--remote-debugging-port`, attaches over the Chrome DevTools Protocol,
drives the renderer like a user (mouse, drag, scroll, keyboard, command palette,
Quick Open) and captures PNGs via `Page.captureScreenshot`. It is used for
feature validation and marketing screenshots, not as part of any test gate — no
npm script and no Makefile target references it.

Run it from the repo root:

```bash
node scripts/vscode-cdp-harness/engine.mjs scripts/vscode-cdp-harness/shots.json
```

The engine exits with code 2 if you pass no recipe. Four recipes exist:
`shots.json` (marketing shots), `docs-shots.json` (documentation media, including
GIF bursts), `validate.json` (feature validation, with a pre-seeded `settings`
block and its own `userDataDir`) and `verify-discard.json` (a focused check of
the `discardEdits` action).

The recipes run as-is from any checkout: `workspace`, `extensionPath` and
`outDir` are stored relative to the recipe file and resolved against its own
directory (`engine.mjs`, `resolve(dirname(recipePath), p)`). There is nothing to
edit before a run.

The engine first probes `http://127.0.0.1:<port>/json/version`: if a debug VS
Code is already listening it **attaches** (and skips teardown); otherwise it
spawns one detached and tears it down with a two-phase `pkill` by user-data-dir
(SIGTERM, 3.5 s, SIGKILL). `keepOpen: true` skips teardown entirely.

Supported recipe actions: `wait`, `key`, `type`, `command`, `openFile`,
`closeWelcome`, `discardEdits`, `move`, `click`, `rightClick`, `doubleClick`,
`drag`, `scroll`, `hook`, `screenshot`, `burst`. Each takes an optional `after`
(ms) and `as` (log label).
Pointer actions target literal `x`/`y` or a `selector`/`text` lookup — except
`move`, which only accepts `selector`/`text` (it always goes through the element
lookup and throws on literal coordinates); text
matching prefers the smallest visible leaf, so `text: "extends"` hits the token
rather than the editor container.

Caveats worth knowing up front:

- The VS Code binary is auto-resolved: both `engine.mjs` (`newestTestBinary`) and
  `launch.sh` scan `.vscode-test/` and take the newest build, whatever version
  `@vscode/test-electron` last downloaded. They differ after that: `engine.mjs`
  probes the macOS bundle layout as well as the Linux one and falls back to
  `code` on `PATH`, while `launch.sh` looks only for a file named `code` and
  exits with "VS Code binary not found" rather than falling back to anything.
  Windows' `code.exe` is probed by neither.
  Override with `vscodeBin` in the recipe, or with the `VSCODE_BIN` environment
  variable — which both `engine.mjs` and `launch.sh` honour.
- The chrome-devtools MCP cannot be used here: it always spawns its own Chrome
  and cannot attach to an external debugging port.

---

## Gotchas

These are the non-obvious ones. Read them before filing a "the build is broken" issue.

**There is an invisible character in the comments.** A glob written in prose
inside a block comment closes it, so wherever a comment spells one out — most of
`src/infra/` (`exclude-paths.ts`, `watch-globs.ts`, `watcher.ts`, `scanner.ts`,
`vscode-file-system.ts`), `src/domain/parsers/_shared/template-search.ts`,
`lint-staged.config.mjs`, `eslint.config.mjs` — there is a zero-width space
between the asterisks and the slash. `no-irregular-whitespace` runs with
`skipComments` and `skipStrings` so a comment may hold one and code may not.
Copy such a line into code and the lint error has no visible cause; "clean up"
the character and the comment terminates early, taking the next lines of prose
into the compiler.

**Tailwind is a separate pipeline.** `npm run compile` and `npm run watch` do
**not** regenerate `dist/tailwind.css`. `build:css`, `build:css:prod`,
`npm run package` and `npm run test:integration` do — the integration suite
builds the stylesheet because the webviews it opens link it. If you add a new
Tailwind utility class and the style doesn't show up, run `npm run build:css`
(`make css`).

**Tailwind writes `dist/tailwind.css`, and that name is load-bearing.** esbuild
names a bundle's extracted CSS after its JS outfile, so while Tailwind wrote
`dist/diagram-app.css` it was one `<style>` block away from being replaced: add
styles to any diagram-bundle component and esbuild emits `dist/diagram-app.css`,
which in `npm run package` runs _after_ Tailwind. Nothing rendered wrong at the
time — `SidebarSection.svelte` was the only `.svelte` file with a `<style>` block
and it belongs to the sidebar bundle — but "no component has styles yet" is not a
guarantee. The two outputs now have separate names, and both webviews link
`dist/tailwind.css`.

**A Python identifier is not `\w`.** `\w` is `[A-Za-z0-9_]`; Python 3 accepts
any XID_Start/XID_Continue, so `class Artículo`, `título = models.CharField()`
and `{% block contenido %}` are ordinary Django. A reader spelled with `\w` does
not misread those — it fails to match, and the declaration is simply never seen,
which every feature downstream then handles correctly and pointlessly. Use
`PY_IDENT` from `$domain/parsers/_shared/python-tokens`, and remember it needs
the `u` flag: the property escapes are a syntax error without it, not a silent
downgrade. Field TYPES (`models.CharField`) and Django's own constants
(`on_delete=models.CASCADE`) are Django's names, not the author's, and stay
ASCII on purpose.

**A quoted string ends at the quote that OPENED it.** `['"]([^'"]+)['"]` looks
right and is not: it forbids both quotes inside, then accepts either as the
close. `verbose_name = "User's profile"` reads back as `User` — it does not
fail, it returns a plausible wrong answer. Use `quotedAfter(prefix)` from
`python-tokens` for Python, alternate per delimiter for anything else, and see
`STRING_LITERAL_RE` in the same file for the shape.

**Copy a `/g` regex with `freshRegex(re)`, never `new RegExp(re.source, 'g')`.**
A module-level `/g` pattern carries `lastIndex` between calls, so copying it is
right — but `.source` carries no flags, and writing `'g'` does not keep g, it
drops everything else. While every pattern was ASCII that was invisible; the day
one needs `u`, the copy is a different pattern with the same source text and
still matches something. `fresh-regex.test.ts` fails the build if a raw
reconstruction reappears.

**Path aliases live in four places.** `esbuild.js` (`extensionAlias` /
`webviewAlias`), `tsconfig.json` `paths`, `tsconfig.webview.json` `paths`, and
`vitest.config.ts` `resolve.alias`. Change one, change all four.

**`tailwind.css` needs explicit `@source` globs.** Some HTML lives in TypeScript
template strings, which Tailwind v4's default scan would miss, so
`src/webview/styles/tailwind.css` declares `../*.ts`, `../**/*.svelte`,
`../../sidebar/**/*.svelte` and `../../sidebar/**/*.ts` by hand.

**`svelte.config.js` sets `verbatimModuleSyntax` inside svelte-preprocess.** Not
just in `tsconfig.svelte.json`. Without it, svelte-preprocess runs
`transpileModule` with default options and strips component imports that look
unused to TypeScript (`<ChildComponent />` is invisible to the TS layer),
producing a bundle that calls a component function it never imported.

**`npm run package` is a full gate.** It runs `check-types`, `check-svelte`,
`lint`, `format:check` and the unit suite before it builds anything, and
`vscode:prepublish` calls it — so nothing reaches a `.vsix` without passing all
five. Only the integration suite sits outside it.

**The pre-commit hook is not that gate, and is not meant to be.** It runs
`eslint --fix` and `prettier --write` on staged files only, in about a second.
It will not catch a type error, a failing test, or a lint error in a file you
did not stage. `make verify` and CI are still the things that say the tree is
green — see [Pre-commit hook](#pre-commit-hook).

**The `watch` task sources nvm explicitly.** `~/.bashrc` bails out early for
non-interactive shells, so neither a plain nor a login shell loads nvm; the task
in `.vscode/tasks.json` sources `~/.nvm/nvm.sh` when present so `npm` is on PATH
however VS Code was launched. The same task pins its interpreter to
`/usr/bin/bash`, which is a Linux assumption: on macOS bash lives at
`/bin/bash`, the task cannot start, and F5 dies at the pre-launch step without
ever opening a debug host — which reads as a broken repository rather than as one
hard-coded path.

**`scripts/extract-inventory.sh` is a one-off migration tool.** It takes an
`OLD_REPO_PATH` argument and dumps a Markdown capability inventory of the
_previous_ repo. It requires `jq` and `rg`. It is not part of the normal workflow.

---

## Commit and branch conventions

### Conventional Commits

```
<type>(<optional scope>): <imperative description>

[optional body]

[optional footer]
```

Types: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `perf`, `style`,
`build`, `ci`.

Rules:

- Imperative mood — "add", not "added" or "adds".
- One commit per coherent unit of work. Not a giant "WIP: many things", and not
  a commit per file either.
- One author per commit. No `Co-Authored-By` or attribution trailers.
- Do not use `--no-verify`. If a hook fails, fix the problem. The hook is built
  to make that possible: it only fails on a real lint error in a file you
  staged, and it stands down entirely during a merge or a rebase — see
  [Pre-commit hook](#pre-commit-hook).

Examples:

```
refactor(lexer): extract tokenizer to separate module
feat(parser): support block tags with arguments
fix(completion): handle empty template path
chore: add basic gitignore
```

### Branches

Trunk-based (GitHub Flow), not Git Flow. `main` is always green.

Format: `<type>/<intent-in-kebab-case>`, using the same type vocabulary as commits.

| Type        | When                                   | Example                        |
| ----------- | -------------------------------------- | ------------------------------ |
| `refactor/` | restructure without changing behaviour | `refactor/extract-lexer`       |
| `feat/`     | new functionality                      | `feat/add-template-completion` |
| `fix/`      | bug fix                                | `fix/parser-edge-case-newline` |
| `chore/`    | infra, CI, deps, config                | `chore/setup-ci`               |
| `docs/`     | documentation only                     | `docs/update-readme`           |
| `test/`     | tests only                             | `test/add-lexer-coverage`      |

Workflow:

1. Branch off `main`. Keep the branch short-lived — days, not weeks.
2. Stage by name (`git add <file>`), not `git add .`.
3. Run `make verify` before merging; run `make test-integration` too when you
   touched anything that runs inside the Extension Host.
4. Rebase onto `main` before merging, so history stays linear.
5. Merge fast-forward only, then delete the branch.

Naming communicates _intent_, not implementation.

---

## Project layout

Deeper architectural notes live in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
Quick map of the source tree:

| Path                       | What lives there                                                                                                                                                                                                                                                                                                                                          |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/extension.ts`         | activation entrypoint — constructs the scanner, runs the adapter registration loop, wires the debounced watcher, then kicks off the initial workspace scan                                                                                                                                                                                                |
| `src/domain/`              | pure, VS Code-free logic: `parsers/`, `formatting/`, `folding/`, `comments/`, `include-pretty/`, `dtl-tag-registry/`, `diagram/`, `view-context/`, `contracts/`, `types/`                                                                                                                                                                                 |
| `src/infra/`               | scanner, `Index`, parse cache, `FileSystem` port (Node + in-memory), debounced watcher — see `src/infra/README.md`                                                                                                                                                                                                                                        |
| `src/adapters/`            | every VS Code-facing provider: `code-actions/`, `commands/`, `completion/`, `hover/`, `definition/`, `diagnostics/`, `folding/`, `formatting/`, `document-link/`, `file-decoration/`, `script-filter/`, `status-bar/`, `tag-pair-highlight/`, `sidebar/`, `diagram/`, plus the `_shared/` and `types/` support directories — see `src/adapters/README.md` |
| `src/shared/`              | the output-channel logger and the typed extension↔webview `protocol/`                                                                                                                                                                                                                                                                                     |
| `src/webview/`             | Svelte diagram panel (`main.ts`, `App.svelte`, `lib/`, `styles/`) — see `src/webview/README.md`                                                                                                                                                                                                                                                           |
| `src/sidebar/`             | Svelte sidebar app shared by the four activity-bar views                                                                                                                                                                                                                                                                                                  |
| `src/integration-tests/`   | the Electron runner, the Mocha loader and the single integration suite                                                                                                                                                                                                                                                                                    |
| `src/test-support/`        | `scaling.ts` — the ratio-based performance assertion the parser, lexer and tag-pair tests import. Test-only; nothing in the extension imports it                                                                                                                                                                                                          |
| `src/test-django-project/` | the Django fixture workspace used by F5, the integration suite and the CDP harness                                                                                                                                                                                                                                                                        |
| `resources/`               | shipped assets: `icons/`, 7 `snippets/` bundles, 3 TextMate `syntaxes/`                                                                                                                                                                                                                                                                                   |
| `scripts/`                 | `vscode-cdp-harness/` (CDP automation), `diagram-harness/` (standalone diagram dev server, `npm run harness:diagram`) and `extract-inventory.sh` (one-off migration audit, points at the OLD repo)                                                                                                                                                        |

Build and config files at the root: `esbuild.js`, `svelte.config.js`,
`tailwind` input under `src/webview/styles/`, `tsconfig.json` (extension host),
`tsconfig.webview.json` (browser), `tsconfig.svelte.json`,
`tsconfig.integration.json`, `vitest.config.ts`, `vitest.setup.ts`, `Makefile`,
`.vscodeignore`, `package.nls.json`, `eslint.config.mjs`, `.prettierrc.json`,
`.prettierignore`, `lint-staged.config.mjs`, `.editorconfig`,
`.git-blame-ignore-revs` and `.husky/` (the pre-commit hook — `.husky/_` is
generated by `npm install` and self-ignored).

`.editorconfig` is not Prettier's understudy. It sets 2-space indent, LF, UTF-8,
trailing-whitespace trim and a final newline for the whole tree, and then turns
the trim off for Markdown — because Prettier's Markdown output relies on
trailing spaces, so an editor that trims them anyway rewrites line breaks in
these documents. That lands as a formatting diff in files you never meant to
touch, and `prettier --check .` in CI is what reports it.

`package.nls.json` holds the marketplace title and short description —
`package.json` references them via `%displayName%` and `%description%`. Every
other user-facing string (command titles, view names, setting descriptions) is
written inline in `package.json`.

`.vscodeignore` is a deny-list: what ships is `dist/**` (sourcemaps excluded),
`resources/**`, `language-configuration.json`, `package.nls.json`,
`package.json`, `LICENSE` and the two marketplace documents, `README.md` and
`CHANGELOG.md`. `CONTRIBUTING.md` is denied. Because it is a deny-list, **every
new root config file has to be added to it or it ships** — `eslint.config.mjs`
and `.prettierignore` reached the marketplace once for exactly that reason.
`.husky/**` and `lint-staged.config.mjs` are named there for the same reason;
`npx @vscode/vsce ls` prints the shipping list without building anything, and CI
builds the real `.vsix` on every push. Demo media directories (`docs/`, `images/`, `screenshots/`,
`media/`, `assets/`) are deliberately excluded from the `.vsix` — reference them
from the README by absolute `https://raw.githubusercontent.com/velezanthony/django-language-service/...`
URLs instead of bundling them.
