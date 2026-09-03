# Diagram browser harness

Runs the **real** `dist/diagram-app.js` — the same bundle the VS Code webview
loads — in a plain browser, against a synthetic payload. No extension host, no
Electron, no rebuild of a parallel copy.

It exists because the integration suite can prove the diagram BOOTS and no
more. `showModelDiagram command opens a webview panel without errors` is its
entire coverage of the feature, and that test has since been strengthened —
the webview posts `ready` as the last statement of its boot, so the suite now
asserts the Svelte app actually mounted rather than that a tab appeared. What
it still cannot see is what the canvas PAINTS: geometry, overlap, zone bounds,
edge routing. That has to be measured somewhere, and this is that somewhere.

## Use

```bash
npm run compile                       # the harness serves dist/, it does not build it
node scripts/diagram-harness/serve.mjs   # http://localhost:5599
```

Then open it, or drive it over CDP:

```bash
google-chrome --headless=new --remote-debugging-port=9333 \
  --user-data-dir=$(mktemp -d) http://localhost:5599/
```

## What is real and what is not

| Real                                           | Faked                                                                                  |
| ---------------------------------------------- | -------------------------------------------------------------------------------------- |
| `dist/diagram-app.js`, `dist/tailwind.css`     | `acquireVsCodeApi()` — in-memory state, `postMessage` collected in `window.__POSTED__` |
| Layout, zoom, pan, relation drawing, app zones | The VS Code theme tokens (approximated in `index.html`)                                |
| `window.__DIAGRAM_DATA__` contract             | The payload itself (`payload.js`, deterministic, 6 apps × 12 models)                   |

The payload is shaped to stress the app-zone overlay: enough models per app to
earn a zone, plus cross-app relations so the force layout interleaves clusters
and their bounding boxes overlap.

## Measuring

`getComputedStyle` **lies** inside `#canvas-content`. Once `sharpenZoom()` bakes
the zoom into the CSS `zoom` property, Chrome reports lengths divided by the
effective zoom — a 1px border reads back as `3.58px` at 26%. Only
`getBoundingClientRect()` reports real screen pixels.

For stroke widths, neither works: `getBoundingClientRect()` on an SVG `<line>`
returns the _fill_ box, which has zero height for a horizontal line. Probe with
`document.elementFromPoint()` one screen pixel at a time instead — the default
`pointer-events: visiblePainted` makes the stroke hit-testable, so counting hits
gives the painted thickness.

Two findings worth keeping, both measured here:

- `vector-effect: non-scaling-stroke` does **not** compensate for CSS `zoom`.
  At 26% the "non-scaling" stroke painted 2px against the plain stroke's 3px.
  Counter-scale by hand — see `lib/helpers/zoom-chrome.ts`.
- Chrome truncates borders to whole device pixels, so a 1px border inside a
  container at 26% zoom rounds away to nothing.

## Capturing the docs media

`capture-docs.mjs` drives this harness over CDP and writes the PNGs and GIF
frames used in the root README. It exercises the shipped bundle, so what ends
up in the docs is what the extension actually renders.

```bash
# Terminal 1 — serve the built bundle. PAYLOAD is optional; without it the
# committed fixture is used.
PAYLOAD=/tmp/payload-shop.js node scripts/diagram-harness/serve.mjs

# Terminal 2 — capture. <outDir> [prefix] [zoom]
node scripts/diagram-harness/capture-docs.mjs /tmp/media shop- 0.62

# Encode the frame directories
gifski --fps 10 --width 900 --quality 80 -o /tmp/media/focus.gif /tmp/media/shop-focus/*.png
```

The payload can be anything shaped like `window.__DIAGRAM_DATA__ = {...}`;
`buildDiagramPayload()` from `src/domain/diagram/diagram-serializer.ts` produces
it from parsed models, which is how the committed shots were made — real
Django models from `src/test-django-project`, not a mock.
