# VS Code CDP harness — drive & screenshot a real VS Code, from a recipe

VS Code is an **Electron/Chromium** app, so it speaks the **Chrome DevTools
Protocol (CDP)**. This harness launches a real VS Code window with a debugging
port, connects over CDP, and drives it like a user — free mouse, left/right
click, drag, keyboard, palette commands — then captures screenshots and tears
down. No `scrot`/`gnome-screenshot`/`xdotool` needed (none work well under
Wayland anyway); everything happens inside the renderer via CDP.

> The chrome-devtools MCP does **not** work here: it always spawns its own
> Chrome and can't attach to an external port. We speak CDP a pelo.

## Architecture

- **`engine.mjs`** — the reusable engine. Never changes per project. No deps
  (Node 22+ ships global `fetch` + `WebSocket`).
- **`shots.json`** — a recipe that captures the marketing screenshots.
- **`docs-shots.json`** — the documentation media, including GIF `burst` sequences.
- **`validate.json`** — the richer recipe: feature-validation screenshots,
  a `settings` pre-seed block and its own `userDataDir`.
- **`verify-discard.json`** — a focused check that `discardEdits` leaves no file dirty.
- **`launch.sh`** — optional manual launcher (the engine can also launch itself).

Recipes are the only thing you edit per task.

## Run

From the repo root:

```bash
node scripts/vscode-cdp-harness/engine.mjs scripts/vscode-cdp-harness/shots.json
node scripts/vscode-cdp-harness/engine.mjs scripts/vscode-cdp-harness/validate.json
```

Any cwd works: every path in a recipe is resolved **relative to the recipe
file**, not to the shell. The engine attaches to an already-running debug VS
Code on the recipe's `port`, or launches one itself
(extensionDevelopmentPath + workspace) and kills it cleanly at the end.

## Recipe format

```jsonc
{
  "workspace": "../../src/test-django-project", // relative to THIS file
  "extensionPath": "../..", // default: the repo root
  "outDir": "out/shots", // screenshots land here
  "userDataDir": "/tmp/vscode-cdp-validate", // default: /tmp/vscode-cdp-<port>
  "settings": { "workbench.startupEditor": "none" }, // seeded into <userDataDir>/User/settings.json
  "port": 9222,
  "vscodeBin": "/optional/path/to/code", // else $VSCODE_BIN, else newest .vscode-test build, else `code`
  "settleMs": 3500, // wait after connect for the ext host to activate
  "continueOnError": true,
  "keepOpen": false, // true = leave VS Code running
  "actions": [/* see below */],
}
```

`vscodeBin` falls back to the **highest-versioned** binary under
`.vscode-test/`, whatever `@vscode/test-electron` has downloaded — there is no
version pin to go stale. On macOS it looks inside `Visual Studio Code.app`.

"Highest-versioned" is compared numerically, per part. It used to be a plain
`.sort()` of the paths, and string order puts `1.132.0` before `1.85.0`, so the
harness handed back the OLDER binary whenever two cached versions differed in
how many digits their minor had. The cache is cumulative, so a single leftover
`1.85.x` silently reverted every screenshot to it while the run reported
success.

### Actions

| `do`                         | fields                                                 | what it does                                                          |
| ---------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------- |
| `command`                    | `title`                                                | run a command-palette command by title                                |
| `openFile`                   | `query`                                                | Quick Open a file (use an **unambiguous** name)                       |
| `closeWelcome`               | —                                                      | Ctrl+W                                                                |
| `key`                        | `key`, `mods:[ctrl,shift,alt,meta]`                    | one keystroke / shortcut                                              |
| `type`                       | `text`                                                 | insert text (does NOT fire autocomplete)                              |
| `click`                      | `x,y` **or** `selector`/`text`, `button`, `clickCount` | real mouse click                                                      |
| `rightClick` / `doubleClick` | same targeting                                         | DOM context menus are clickable                                       |
| `move`                       | `x,y` or `selector`/`text`                             | move mouse (for genuine hover)                                        |
| `drag`                       | `from`, `to` (each `x,y` or `selector`/`text`)         | press-move-release                                                    |
| `scroll`                     | target + `deltaY`                                      | mouse wheel                                                           |
| `wait`                       | `ms`                                                   | pause (same as `after`, standalone)                                   |
| `hook`                       | `js`                                                   | escape hatch: run arbitrary JS via `Runtime.evaluate`                 |
| `screenshot`                 | `file`                                                 | PNG into `outDir`                                                     |
| `discardEdits`               | `rounds` (default 8)                                   | Revert File + Close, looped — leaves no editor dirty                  |
| `burst`                      | `dir`, `frames` (default 10), `every` (default 100 ms) | a numbered run of screenshots into `outDir/dir`, for assembling a GIF |

Every action takes an optional `after` (ms to wait) and `as` (label for logs).
Element targeting by `selector` (CSS) or `text` (aria-label/title/visible text);
text matching prefers the **smallest leaf** so a token wins over its container.

## Determinism gotchas (respect them or repeat them)

1. **Prefer idempotent commands over toggling clicks.** Clicking an activity-bar
   icon _toggles_ the sidebar — non-deterministic across runs. Use a focus
   command (`Focus on Views View`) that always _shows_ it.
2. **`insertText` does NOT trigger autocomplete** (no key events) — type a
   prefix, then run `editor.action.triggerSuggest`.
3. **Quick Open is fuzzy** — `valid-usage.html` also matches `INvalid-usage.html`.
   Use unambiguous names.
4. **Text targeting is greedy** unless you pick the leaf: a container's
   `textContent` transitively contains every token. The engine sorts matches by
   area and takes the smallest — so click `text:"extends"` lands on the token,
   not mid-editor.
5. **Do it all in ONE run.** Separate CDP runs against the same window leak focus
   and panel state. Close the chat / secondary side bar at the start.
6. **Graceful teardown.** VS Code spawns its main process in its OWN session, so
   killing the launched child's group misses it and leaves a half-dead window
   ("window terminated unexpectedly" dialog). The engine `pkill -TERM`s by
   `user-data-dir`, waits, then `-KILL`s stragglers.
7. **`--no-sandbox` is mandatory** or Electron aborts (`chrome-sandbox` isn't
   root:4755 in the test-electron cache).
8. **VERIFY every PNG by eye.** A "clean" run silently produced the wrong frame
   more than once. Don't trust the log — look at the image.

## Example recipe

See `shots.json` — opens this extension on `src/test-django-project` and
captures the plugin sidebar, the load-diagnostics and a `{% extends %}` tag
hover. These are the README screenshots. The root `README.md` embeds them by absolute
`raw.githubusercontent.com` URL, which it must: `.vscodeignore` keeps `docs/`,
`images/`, `screenshots/`, `media/` and `assets/` out of the `.vsix`, so a
relative path would render as a broken image on the marketplace.

`out/` is gitignored — screenshots are build artefacts, not sources.

## Capturing the editor-side docs media

`docs-shots.json` is the recipe behind the completion, lint, formatting and
sidebar images in the root README. It drives a real Extension Development Host,
so the theme tokens and widget chrome are VS Code's own rather than an
approximation, and everything it types goes into the buffer and is never saved.

```bash
node scripts/vscode-cdp-harness/engine.mjs scripts/vscode-cdp-harness/docs-shots.json
gifski --fps 8 --width 1000 --quality 80 \
  -o out/docs/format.gif out/docs/format/*.png
```

Two things worth knowing before editing a recipe:

- **`Ctrl+Shift+P` opens the palette with `>` already in the box.** `runCommand`
  therefore selects-all and types `>title`; typing `> title` on top produced
  `>> title`, which matches nothing, so every command silently did nothing and
  the rest of the run played out against a window that was never set up.
- **Whatever has focus is where keystrokes land.** The secondary side bar and
  the panel can come back between steps, and a chat view will happily swallow a
  whole typed sample. Close both and click `.monaco-editor .view-lines` before
  any `type` action.

### Capturing a webview panel

The model diagram is a webview, and it behaves differently from the workbench:

- **Keyboard events reach it.** Focus the panel with a click, then its own
  shortcuts work — `F` to fit, `+` / `−` to zoom, arrows to pan. That is enough
  to frame a shot.
- **Mouse events do not.** A click on a box or a toolbar menu inside the webview
  produces no change: the panel is a separate frame and `Input.dispatchMouseEvent`
  on the workbench page does not cross into it. Reaching it needs the webview
  frame's own execution context, which this harness does not resolve yet — so
  tooltips and in-panel menus cannot be captured this way today.

`locate` has the same limitation: `document.querySelector` from the top frame
never sees inside the webview.

### Two capture traps

- **A veiled panel.** Holding a CDP connection to the webview target while
  screenshotting through the workbench page target composites the panel through
  a stale surface — the canvas comes out `rgb(108,108,108)` instead of
  `rgb(26,26,26)`, a white wash over the panel and nothing else. Drive the
  webview, detach, then capture.
- **Keystrokes need OS window focus.** `Input.insertText` resolves normally and
  inserts nothing when the window is behind another. The symptom is a frame
  sequence that deduplicates to a single frame, so always check:

  ```bash
  ffprobe -v error -count_frames -select_streams v:0 \
    -show_entries stream=nb_read_frames -of csv=p=0 file.gif
  ```

## Leaving files dirty

Recipes type into REAL files under `src/test-django-project`. A buffer left
dirty causes two failures that look like something else entirely:

- `View: Close All Editors` pops a **save prompt** and the run stalls on a modal
  nobody is watching — and if anything answers it, the repo gets written.
- Killing VS Code with dirty buffers lets **hot exit** restore them into the
  NEXT run, so a later recipe starts against a file it did not write.

So `engine.mjs` runs `discardEdits()` (Revert File → Ctrl+W, looped, then Close
All Editors) **unconditionally at teardown** — not from the recipe. The action
loop `break`s on the first error, so any cleanup a recipe declares for itself is
skipped exactly when it matters most: after a failure that left a file
half-typed. Recipes can still call `{ "do": "discardEdits" }` between phases.

`verify-discard.json` proves the guarantee. Every step is a `hook` that throws,
so exit 0 IS the assertion:

```bash
node scripts/vscode-cdp-harness/engine.mjs scripts/vscode-cdp-harness/verify-discard.json
git status --short src/test-django-project   # must print nothing
```

> Not yet run green end-to-end: this machine's `fs.inotify.max_user_instances`
> (128) was exhausted by the running editors, and VS Code exits with
> `inotify_init() failed` before the CDP port opens. The three primitives
> `discardEdits` composes are each already proven in the recipes here
> (`Revert File` in validate.json, `Ctrl+W` in `closeWelcome`, `View: Close All
Editors` in both), but the composition is unverified. Run the command above
> once a slot is free.
