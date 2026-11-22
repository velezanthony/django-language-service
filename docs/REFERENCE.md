# Reference

Every command, keybinding and setting the extension contributes, plus what the
indexer looks at. The [README](../README.md) covers what the features do; this
page is the lookup table.

---

## Commands

All under the **Django Language Service** category.

| Title                                 | Command id                                              |
| ------------------------------------- | ------------------------------------------------------- |
| Toggle Template Comment               | `django-language-service.toggleComment`                 |
| Toggle HTML Props (Expand / Collapse) | `django-language-service.prettyInclude`                 |
| Collapse to Inline                    | `django-language-service.collapseInclude`               |
| Collapse All Includes                 | `django-language-service.collapseAllIncludesInDocument` |
| Expand All Includes                   | `django-language-service.expandAllIncludesInDocument`   |
| Pick View (Quick Pick)                | `django-language-service.pickView`                      |
| Validate Context Variables            | `django-language-service.validateContext`               |
| Enable Live Validation                | `django-language-service.toggleLiveForView`             |
| Disable Live Validation               | `django-language-service.toggleLiveForViewOff`          |
| Clear Diagnostics                     | `django-language-service.clearContextDiagnostics`       |
| Refresh View Context                  | `django-language-service.refreshViewContext`            |
| Show Model Diagram                    | `django-language-service.showModelDiagram`              |
| Focus Orphans & Debt Sidebar          | `django-language-service.focusDebtSidebar`              |
| Format Document                       | `django-language-service.formatDocument`                |
| Show Log                              | `django-language-service.showLog`                       |

`Enable Live Validation` is a radio toggle — running it on the live view turns Live Mode off. `Disable Live Validation` can never turn it on.

### Keybindings

| Shortcut (macOS)                | Command                 | When                                                  |
| ------------------------------- | ----------------------- | ----------------------------------------------------- |
| `Ctrl+Shift+/` (`Cmd+Shift+/`)  | Toggle Template Comment | editor focused, `html`, `django-html` or `django-txt` |
| `Ctrl+K Ctrl+D` (`Cmd+K Cmd+D`) | Show Model Diagram      | a folder is open                                      |

### Editor context menu

`Collapse All Includes` and `Expand All Includes` appear on right-click for `html`, `django-html` and `django-txt`.

### View title bars

Four commands are also reachable as title-bar buttons, which is where most people meet them rather than in the palette.

| Icon              | Command                | View   |
| ----------------- | ---------------------- | ------ |
| `$(search)`       | Pick View (Quick Pick) | Views  |
| `$(clear-all)`    | Clear Diagnostics      | Views  |
| `$(refresh)`      | Refresh View Context   | Views  |
| `$(symbol-class)` | Show Model Diagram     | Models |

---

## Settings

| Setting                                               | Type      | Default   | What it does                                                                                                                                                                                                                                                                  |
| ----------------------------------------------------- | --------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `djangoLanguageService.format.tabWidth`               | `number`  | `2`       | Spaces per indent level. (The editor's `tabSize` is passed as a code-level default, but the declared default of `2` always shadows it.)                                                                                                                                       |
| `djangoLanguageService.format.useTabs`                | `boolean` | `false`   | Indent with tabs.                                                                                                                                                                                                                                                             |
| `djangoLanguageService.format.printWidth`             | `number`  | `120`     | Target line width. Only consulted when `singleAttributePerLine` is on.                                                                                                                                                                                                        |
| `djangoLanguageService.format.singleAttributePerLine` | `boolean` | `false`   | Explode a tag to one attribute per line — only when the line exceeds `printWidth` **and** the tag has at least 2 attributes.                                                                                                                                                  |
| `djangoLanguageService.excludePaths`                  | `array`   | see below | Directory names never indexed. `".*"` matches any dot-directory. Entries can be a name (`vendor`), a nested path (`templates/vendor`) or a pattern (`*.egg-info`). Requires a reload.                                                                                         |
| `djangoLanguageService.suppressBuiltinHtmlValidation` | `boolean` | `true`    | Write `html.validate.scripts` / `.styles` to `false` in **Workspace** settings so the DTL-aware checkers replace the built-in ones. Only in a workspace the scan has confirmed is a Django project — see [It changes two of your settings](#it-changes-two-of-your-settings). |
| `djangoLanguageService.snippets.enabled`              | `boolean` | `true`    | Enables the path-aware Python snippet completions. Does not disable the static snippet bundles.                                                                                                                                                                               |

The extension also ships `configurationDefaults` for `emmet.includeLanguages` and `editor.suggest.insertMode`. They are defaults, so anything you set wins.

---

## Requirements

- **VS Code 1.85.0 or newer.**
- A workspace folder must be open for the sidebar and the diagram.
- **A real filesystem.** The manifest declares `virtualWorkspaces.supported: false`, because the project index round-trips every path through `Uri.fsPath`, which only means anything under the `file` scheme. Open the project on vscode.dev, on github.dev or through a Remote Repository and VS Code switches the extension off rather than letting it index nothing. That is the declared behaviour, not a failure to report.
- **An untrusted workspace still works, with two settings held back.** `untrustedWorkspaces.supported: true`: workspace Python and templates are read and parsed, never executed, and no hover marks its markdown trusted, so nothing the workspace writes can become a command link. `excludePaths` and `suppressBuiltinHtmlValidation` are `restrictedConfigurations`, so a repository cannot widen the scan or ask the extension to edit its `settings.json` before you trust it. The cost lands on you as well: for a restricted setting VS Code serves the declared DEFAULT, so in an untrusted folder your own exclusion of a vendored `templates/` directory is ignored and that directory is indexed after all, with nothing tying the surprise back to workspace trust.

### What the indexer looks for

```text
**/models.py          **/urls.py              **/templates/**/*.html
**/views.py           **/migrations/*.py      **/templates/**/*.txt
**/views/**/*.py      **/helpers.py
**/forms.py           **/templatetags/*.py
```

Practical consequences:

- **Templates must live under a `templates/` directory** to be indexed.
- **Views must be in `views.py` or under a `views/` package.** A view in `api.py` is invisible.
- Custom tags and filters come from **`<app>/templatetags/*.py`** — Django's own convention, where the module name is the `{% load %}` name — and from files named **`helpers.py`**.
- `admin.py` is not indexed, but the `da*` snippets still fire there — snippets key off the file name.

Files reached by _following an import_ — `enums.py` for choices, `mixins.py` for abstract bases, `settings.py` for `AUTH_USER_MODEL` — are read on demand during the resolution pass. They sit outside the watch set, so edits to them land on the next full scan rather than immediately. `helpers.py` and `templatetags/*.py` are not among them: both are indexed and watched directly, like `models.py` or `views.py`.

Excluded by default: `.*` (every dot-directory), `venv`, `env`, `virtualenv`, `site-packages`, `node_modules`, `__pycache__`, `dist`, `build`, `coverage`, `htmlcov`, `*.egg-info`, `static`, `media`. Setting `excludePaths` replaces only the two asset roots — `static` and `media`. The tooling segments (`.*`, `venv`, `env`, `virtualenv`, `site-packages`, `node_modules`, `__pycache__`, `dist`, `build`, `coverage`, `htmlcov`, `*.egg-info`) are unioned in whatever you write, because nothing in them is worth reading for any purpose: a `.vscode/settings.json` reading `["nothing"]`, which any repository you opened merely to look at can carry, used to put the scanner to work indexing `.git`, `node_modules` and `site-packages`.

`static/` and `media/` are excluded from the source index because they hold no models, views or templates. Static-file completion searches inside `static/` and `staticfiles/` on purpose — those are the two roots `{% static %}` resolves against. `media/` stays excluded there too: user uploads are not a `{% static %}` target.

### Language modes and file associations

`django-html` and `django-txt` are contributed **without file extensions**, so nothing is assigned to them automatically. DTL highlighting reaches plain `.html` through an injected grammar and every feature also registers for `html`, so a stock Django project works out of the box.

For the dedicated modes:

```jsonc
"files.associations": {
  "**/templates/**/*.html": "django-html",
  "**/templates/**/*.txt": "django-txt"
}
```

Coverage is almost uniform: completions, hovers, definitions, folding, formatting, the `{% load %}` / context diagnostics, URL-reference diagnostics and the include CodeLens all run in the three languages, because they share `DTL_SELECTOR` / `DTL_LANGUAGES`. The one exception is the script/style filter, which is `html` and `django-html` only (`HTML_ONLY_LANGUAGES`) — it exists to suppress VS Code's built-in HTML validation, which never runs on `django-txt` anyway.

### It changes two of your settings

The script/style filter writes `html.validate.scripts: false` and `html.validate.styles: false` into your **Workspace** settings. That is what stops the built-in validator screaming about `{{ }}` inside `<script>`. Five guards decide whether it writes at all:

- never in a workspace you have not trusted. `.vscode/settings.json` is a tracked file in somebody's repository, and declining trust says you are only looking at it; opening a repo to read it must not leave its tree modified. This guard sits in the adapter and returns before the other four are consulted, so in an untrusted folder `html.validate` is never written and nothing is logged about it;
- never User settings, and never without a folder open;
- only keys not already `false`;
- **only once the scan has found Django artifacts** — models, views or urls parsed out of your Python. This one is not cosmetic: the extension activates on any `.py` or `.html` file, so before the guard existed, opening an unrelated repo with a stray Python file in it got its `.vscode/settings.json` edited — a tracked file turning up dirty in `git status`, with a built-in editor feature switched off in a project that has nothing to do with Django;
- and `suppressBuiltinHtmlValidation` set to `false` disables it outright, if you would rather manage `html.validate` yourself.

Because the guard waits for a scan, the write happens shortly _after_ activation rather than during it.
