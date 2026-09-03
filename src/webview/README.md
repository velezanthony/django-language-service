# webview

The **ER model diagram** webview app (Svelte 5, runes). The sidebar is a _separate_ app in
`src/sidebar/`; the two only share this directory's component library, path aliases and
Tailwind stylesheet.

## Entry point and boot

`main.ts` mounts `App.svelte` into `#app`. `App.svelte` renders the whole tree (toolbar,
timeline, context menu, toast, `#canvas`, `#tooltip`, legend) and then, in `onMount`,
dynamically imports `lib/composables/diagram-boot` → `installDiagram()`, which imperatively
wires drag, viewport, tooltip, persistence, search/filter, blast-radius, compare and export
against the DOM that was just rendered.

**Data is not pushed by message.** `src/adapters/diagram/panel.ts` serializes the project
into an inline `window.__DIAGRAM_DATA__` script and rewrites the panel HTML wholesale on
every scan; `lib/composables/diagram-data.ts` reads that global (returning an empty skeleton
if it is absent). Viewport state survives the HTML swap through
`vscode.getState/setState` (`lib/composables/persistence.ts`, `LAYOUT_VERSION`).

Outbound messages are exactly four: `ready`, `refresh`, `navigate` and `webviewError` — typed
as `DiagramInbound` in `src/shared/protocol` (`WebviewToExtension` is that union with the
sidebar's, so an adapter switching on it is not exhaustive), reached from this bundle through
`$protocol`. Nothing flows extension → diagram.

`ready` is posted as the **last statement of `installDiagram()`**, so reaching it means the
whole boot ran. `webviewError` fires on a THROW, which left a bundle that failed to parse — or a
mount that quietly produced nothing — indistinguishable from a working panel: an empty frame, no
signal on either side. `verifyStylesheet` posts the same message for a failure that throws
nothing at all: `dist/tailwind.css` absent, every Tailwind class inert, the diagram a column of
naked divs, and the integration test asserting the panel opens without errors passing, because
from the extension host's side it did. The panel warns after 10s if `ready` never arrives, and
the integration suite asserts on it through the internal `diagramBooted` command instead of
checking that a tab with the right title exists (it does, either way).

## Layout

- `lib/components/{atoms,molecules,organisms}` — atomic design, one barrel `index.ts` per
  level; `atoms/icons` has its own barrel (see its README before adding an icon).
- `lib/composables/` — feature wiring installed by `diagram-boot`.
- `lib/helpers/` — pure helpers (drag math, viewport, exports, search, tooltip controller).
- `lib/state/*.svelte.ts` — runes `$state` modules consumed directly (no stores).
- `lib/actions/`, `lib/types/` — Svelte actions and shared payload types.
- `styles/tailwind.css` — the stylesheet for BOTH apps.

Aliases `$lib`, `$atoms`, `$icons`, `$molecules`, `$organisms` and `$protocol` must be kept in
sync in **three** places: `esbuild.js` (`webviewAlias`), `tsconfig.webview.json` and
`vitest.config.ts` — and `src/architecture.test.ts` asserts the three agree, so a table edited in
one place fails a test instead of a bundle. `$protocol` is narrow on purpose. It was `$shared`,
which also reaches `src/shared/logger.ts`, whose first line is
`import * as vscode from 'vscode'`: one such import from a `.svelte` file breaks the bundle at
load time with `check-types`, `svelte-check` and the unit suite all green.

## Build outputs

| Source                            | Output                | Built by                           |
| --------------------------------- | --------------------- | ---------------------------------- |
| `src/webview/main.ts`             | `dist/diagram-app.js` | esbuild (iife, browser, es2022)    |
| `src/sidebar/sidebar-app.ts`      | `dist/sidebar-app.js` | esbuild                            |
| `src/webview/styles/tailwind.css` | `dist/tailwind.css`   | `npm run build:css` (Tailwind CLI) |

`dist/tailwind.css` is shared — the sidebar views link it too. **`npm run watch` does not
rebuild CSS**: after adding new Tailwind classes, run `npm run build:css` yourself.

## Styling

Tailwind v4 `@theme static` tokens in `styles/tailwind.css` alias `--vscode-*` vars
(`--color-vsc-*`) and add diagram-semantic colors plus scales for typography, radius, motion,
elevation, z-index and accent opacity. Use those tokens: no arbitrary `z-[N]`, no
`rounded-[Npx]`, no raw `bg-vsc-link/[0.NN]`. The `@source` globs are mandatory — they also
cover `src/sidebar` and class strings inside TS template literals.

Mount contracts are covered by vitest + jsdom (`main-mount.test.ts`, `app-mount.test.ts`).
