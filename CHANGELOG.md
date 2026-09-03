# Changelog

All notable changes to the **Django Language Service** extension are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Custom tag libraries are found in `templatetags/`.** Django loads
  `{% load shop_tags %}` from `<app>/templatetags/shop_tags.py` and nowhere
  else; until now only `helpers.py` was indexed, so a library kept where Django
  actually looks for it was reported as unknown.
- **Hovering `order.customer_id`, `post.get_next_by_published` and a
  `Prefetch(to_attr=…)` alias** now explains them: the first is the stored key
  and costs no query where `customer.pk` would, the second runs one and can
  raise `DoesNotExist` — which a template swallows in silence — and the alias
  is described as the relation it renames, which is where go-to-definition
  lands. All three resolved before and hovered as nothing.
- **The ER diagram says so when its stylesheet did not load.** It used to render
  with every utility class inert and nothing anywhere reported it; a `<link>`
  whose href 404s still has a non-null `.sheet`, so presence carries no
  information. A sentinel custom property is read instead.

### Fixed

#### Projects not written in English

The extension was partly blind to them, and nothing said so. A Python
identifier is any Unicode letter — `class Artículo`, `título`,
`{% block contenido %}` — and every reader spelled it `[A-Za-z0-9_]`.

- **A model whose class name is not ASCII is now found.** `class Artículo(models.Model)`
  was not misread, it was never detected: no diagram node, no hover, no field
  completion, no relation. Everything downstream was correct about a model it
  had no idea existed. The same applied to fields, relations, model methods and
  form classes.
- **A custom tag, filter, `{% block %}` or `{% load %}` library keeps its name.**
  `{% categoría_lista %}` was read as `categor`, and `{% κατάλογος %}` as the
  empty string — not an unknown tag, a nameless one, which every feature then
  handled correctly and pointlessly.
- **The migration reader and the model reader now agree about names.** They
  disagreed, and the ER diagram compares one against the other, so a model
  named in the project's own language appeared to be missing its migrations.
- **The "add the missing `{% load %}`" fix is offered** for a library whose
  module name is not ASCII. The warning was raised and the lightbulb never
  appeared.
- **A view whose name is not ASCII is now indexed.** `def índice` matched no
  reader, so the file parsed to nothing: no view, no context variables, no
  diagnostics, and the template it renders wearing a false orphan badge. The
  same held for a context dict called `índice`, a helper called `ação` and a
  local called `Artículo` — the construct was never seen, so nothing downstream
  had anything to be wrong about.

#### Quotes inside quoted strings

`verbose_name = "User's profile"` is ordinary English and ordinary Django. Every
reader stopped at the apostrophe and accepted it as the closing quote, so the
value came back as `User` — a plausible wrong answer, which is why nobody had
ever reported it.

- **Model labels and column comments keep the whole string** —
  `verbose_name`, `verbose_name_plural`, `db_comment`, `db_table_comment`.
- **`{% include "user's-card.html" %}` no longer raises "template not found".**
  The truncated path was recorded as a real reference, so the warning appeared
  on a correct line under a filename nobody had written.
- **`{% extends %}` keeps its parent**, instead of losing it and marking the
  file as an orphan.
- **Path completion no longer stops at an apostrophe.** The dropdown vanished
  mid-word, and when it did open it filtered on the text after the apostrophe
  rather than the whole path.

#### Correctness and performance

- **Uncommenting a block no longer deletes text sharing a line with the tag.**
  A note after `{% comment %}` or live markup after `{% endcomment %}` used to
  disappear with the line.
- **"Collapse All Includes" no longer flattens the rest of the file** when an
  `{% include %}` above it has not been closed yet.
- **A `models.py` can no longer hang the extension.** Reading a class header
  cost time exponential in the number of base classes; 141 bytes was enough.
- **Typing in a large template no longer stalls.** The `<script>` / `<style>`
  scan behind the JavaScript and CSS diagnostics rescanned to the end of the
  file for every unclosed opening, on every save and every half second while
  typing, so a large generated template cost seconds per keystroke. The scan is
  linear now.
- **A view is no longer dropped** when a directory above the workspace root is
  named like a module inside a Django app — `views`, `models`, `migrations`,
  `templates`, `management` and the rest. The app label was read from the left
  of an absolute path, so a checkout under `/home/dev/management/` answered
  `dev` for every app in it and two apps with a `def index` collided.
- **A subquery no longer retypes the queryset containing it**, so
  `filter(id__in=Other.objects.values('x'))` stops filling the template with
  warnings about correct code.
- **The project index keeps working past 2000 files.** The parse cache is now
  sized to the project instead of to a constant.
- **Folding a generated page no longer freezes the editor.** Each HTML comment's
  line was found by counting newlines from the start of the document, twice, so
  a page carrying thousands of comments held the extension host for over ten
  seconds while the author waited to fold a region.
- **Compare-against-current no longer calls a fully migrated project drifted.**
  Django writes `model_name='blogpost'` where `CreateModel` wrote
  `name='BlogPost'`, and the capitalisation was reconstructed by upper-casing
  the first letter — which matches nothing. Every field operation on a
  multi-word model was discarded, so the replayed schema lost columns the
  project has.
- **The ER diagram no longer draws boxes on top of each other** when a model has
  many relations.
- **An empty workspace is no longer told the diagram failed.** The boot
  watchdog was armed when the panel was created, before anything had been
  rendered into it, and the scanning hero and the "no Django models found"
  screen carry no script — so nothing in them could ever report readiness and
  the panel accused itself after ten seconds about a screen that had finished.
- **A `{% load %}` is no longer reported unused when the library it names
  declares the name.** Django resolves a tag or filter against the libraries
  the template loaded, and a loaded library shadows a Django library — or a
  builtin — declaring the same name. The linter asked which single library it
  would have recommended instead, and called the shadowing load dead.
- Whitespace-control tags (`{%- extends %}`, `{%- block %}`), includes whose
  arguments contain a percent sign, CRLF documents, `<pre>` written inside an
  attribute value, and template defaults containing a comma are all handled.

#### Navigation and completion

- **Ctrl+Click on a template path stops answering for things that are not
  templates.** It used to walk out to the nearest quotes and treat anything
  holding a `/` or a `.` as a template reference: an `href`, an `<img src>`, a
  `{% static %}` path, a `with` keyword value, an `{% include %}` inside
  `{# … #}` that Django never runs — and, in Python files, any quoted path at
  all, `open("fixtures/seed.csv")` included.
- **Ctrl+Click on a `{% url %}` name works on the name.** With a path named
  `url` it worked on the tag keyword and failed on the name in quotes. It also
  now follows a tag the author wrapped across lines, and ignores one inside a
  comment.
- **Hover answers for the reference under the pointer.** With two
  `{% include %}` tags on one line the second had no hover at all, and neither
  did a tag the author wrapped across lines: the provider searched the line
  with `indexOf` after a regex had already chosen the subject.
- **A URL name carrying `$`, `}` or `\` is inserted as text**, not read as
  snippet syntax.
- **A template you just created is offered immediately.** The `{% include %}`
  and `{% static %}` completions cached their file list for thirty seconds with
  no way to be told the workspace had changed — so the one action that makes
  you go and type a new name was the one the completion had not seen.
- **Closing a file no longer leaves its warnings behind.** Editing and then
  closing within half a second let the pending validation finish afterwards and
  write diagnostics for a document that was gone, where nothing could clear
  them again.

#### Multi-root workspaces, trust and formatting

- **Two workspace folders can each have an app of the same name.** `core.Thing`
  from one silently replaced `core.Thing` from the other — an ordinary key
  collision as far as the index was concerned. Relations move with the label,
  so the diagram keeps its edges.
- **An untrusted workspace is left as it was found.** Opening a repository only
  to read it wrote `html.validate.*` into that repository's
  `.vscode/settings.json`. The write now waits for trust.
- **A relative path can no longer link outside the workspace.**
  `"../../../../etc/shadow"` resolved, and the `stat()` behind the link
  answered whether an arbitrary path exists on the machine — an oracle driven
  by text in a repository the user may only have opened to look at.
- **The Orphans panel no longer calls every template an orphan.** It compared
  absolute paths against references written as load paths, so nothing ever
  matched. A panel that flags everything says nothing.
- **The Views panel answers when a layout or a partial is open.** It followed
  only the direct view-to-template binding, so opening the base a page extends,
  or a partial it includes, reported nothing — and every chain row was keyed by
  the stored path and queried by load path, so every row was a dead click.
- **A sidebar section no longer goes stale after a collapse.** VS Code
  re-resolves a view on every collapse and expand, and the old view's disposal
  detached the live one, which painted once and then never again. The Views
  empty state also stopped printing `undefined` at you when a template is open
  that no view renders.
- **Formatting, comment toggling and include reshaping no longer change a
  document they meant to leave alone.** A CRLF file came back as LF, so every
  line showed as modified on every save; an attribute holding `{% if %}` was
  rewritten into four bare attributes. Each of these went through whitespace,
  which is precisely what the existing guard cannot see.
- **`ForeignKey('blog.post')` keeps its edge in the diagram.** Case is not part
  of a lazy model reference — Django resolves it either way, and the two readers
  of it disagreed.

### Changed

- **A repository can no longer widen the scan through its own settings.**
  `djangoLanguageService.excludePaths` used to replace the whole default list,
  so a checked-in `.vscode/settings.json` reading `["nothing"]` put the scanner
  to work indexing `.git`, `node_modules` and `site-packages`. The tooling
  directories are no longer negotiable; the asset roots `static` and `media`
  still are, because whether to index them is a real project decision. A change
  to the setting still needs a window reload.

## [0.2.0] - 2026-08-13

### Added

- **Migration comparator.** Selecting a model while a migration step is open shows
  a field-level before/after diff. Two comparisons, answering different questions:
  _this migration_ (`snapshot[N-1]` → `snapshot[N]`) and _vs current state_
  (`snapshot[N]` → the live models).
- **Field-signature comparison.** Diffs compare the whole kwarg signature, not just
  the field type, so an `AlterField` that only moves `DecimalField(10,2)` to
  `(12,4)` is visible with the changed kwarg highlighted. Recognised kwargs now
  include `max_digits`, `decimal_places`, `unique`, `primary_key`, `db_index`,
  `auto_now` and `auto_now_add`.
- **One-hop context ring in migration history.** Direct relation neighbours of the
  models a step touched stay on screen as muted context tagged `affected`, so a
  two-model migration no longer renders two boxes in an empty canvas.
- **`Meta.unique_together`, `Meta.indexes`, `index_together` and `UniqueConstraint`**
  are parsed and exported, each in the notation its format supports.
- **`models.CompositePrimaryKey`** (Django 5.2) is understood as a table constraint
  rather than a column.
- **`settings.AUTH_USER_MODEL`** resolves to the model it names, so relations to the
  user model stop disappearing from the diagram and the exports.
- **Cross-file context resolution.** Context helper functions and CBV mixins defined
  in another file are followed and folded into the view's context surface.
- Zero-argument model methods are recorded, so `{{ product.get_absolute_url }}` is
  understood as an access rather than a typo.

### Fixed

- **DBML export was invalid for any project with a foreign key.** Foreign-key
  columns were never emitted, so every `Ref` pointed at a column no table
  declared — a hard parse error that invalidated the whole file. Verified now
  against `@dbml/core`, `mermaid.parse` and the PlantUML server.
- **Mermaid export drew two disconnected nodes per model** — entity blocks were
  named `Post` while relations said `blog.Post`.
- Export fixes: `varchar(200)` and `decimal(12,2)` keep their length and precision;
  the implicit `id` is emitted only when Django would add one; `on_delete` becomes a
  DBML referential action; abstract and proxy models are no longer emitted as
  tables; auto fields map to an incrementing integer instead of `text`.
- **The formatter corrupted `<pre>` and `<textarea>`** by re-indenting content whose
  whitespace is rendered. Both are now emitted verbatim.
- **Ten Live Mode false positives**: `{% comment %}` and `{% verbatim %}` blocks
  were scanned as live template code; `pk`, `id`, `get_<field>_display`, zero-argument
  methods and numeric indices were reported as invalid; `{% … as name %}` and
  `blocktrans with` bindings were not registered as locals; `{{ _("…") }}` parsed as
  a variable name.
- **The `{% load %}` linter counted commented-out tags as uses** and never looked for
  filters inside tag expressions, so a genuinely missing load went unreported.
- Two references to the same variable on one line both underlined the first one.
- The relation layer and the box layer could disagree about which models were
  visible, redrawing every relation over hidden boxes.
- **Tokens escaped `{% comment %}` and `{% verbatim %}` blocks** when the body held
  two or more `{# #}` comments, producing diagnostics about code that was
  deliberately commented out. The span search assumed a total order over intervals
  that were nested.
- **`html.validate.*` was written into `.vscode/settings.json` of any workspace** on
  activation — the extension wakes on any `.py` or `.html` file, so a repo with no
  Django in it had a built-in editor feature switched off and its settings file left
  dirty. The write now waits for evidence of a Django project, and a failed write is
  reported instead of logged as a success.
- **One unreadable file emptied the whole project index** for the rest of the session:
  the parse pass rejected, no snapshot was published, and every feature went quiet.
- **Overlapping rescans could publish a stale snapshot.** Scans are serialised.
- **Opening the model diagram replayed migration history once per migration**
  (quadratic), freezing the window on a long history. It replays once.
- Completion of parent `{% block %}` names never picked up blocks added after the
  first lookup.
- Loading a hand-edited layout file could write non-numeric coordinates into saved
  diagram state.
- Activation no longer opens every template in the workspace as a document to count
  its includes.

### Changed

- **Live Mode is scoped to the template it was enabled in.** Opening a different
  template switches it off silently; switching to a `.py` file and back keeps it on.
- **A partial context read no longer accuses you.** When the extension cannot fully
  follow how a view builds its context, missing names are reported as notes
  explaining why, not as warnings.
- The comment/verbatim stripping rule is one shared module, so every template reader
  agrees on what counts as template code.

### Security

- **Hovers no longer mark their markdown trusted.** Template paths, view names read
  from `urls.py`, and `db_comment` / choice labels read from `models.py` are all
  workspace text; with `isTrusted` set, markdown link syntax in any of them could
  render a clickable `command:` link. None of these hovers emits a command URI, so
  the flag bought nothing. A `db_comment` now renders as plain text.

## [0.1.0] - 2026-07-30

First published release. Everything below ships in this version — there are no
earlier releases, so this entry describes the whole feature surface rather than a
delta.

Requires VS Code `^1.85.0`. The extension activates on `html`, `django-html`,
`django-txt` and `python` files, and on any workspace containing `**/manage.py`.
It declares `extensionKind: ["workspace"]`, so under Remote-SSH, WSL or a
devcontainer it runs on the same side as your code.

### Added

#### Templates & DTL language support

- Two contributed languages: `django-html` (aliases _Django HTML_, _django_) and
  `django-txt` (alias _Django txt_).
- Three TextMate grammars. One of them (`source.django.injection`) is injected into
  `text.html.basic` and `text.html.derivative`, so DTL constructs are highlighted
  inside ordinary `.html` files without switching the language mode.
- Language configuration for both languages: `{# #}` block comments, bracket pairs
  for `{{ }}` and `{% %}`, auto-closing pairs that insert the trailing space
  (`{%` → ` %}`, `{{` → ` }}`, `{#` → ` #}`), folding markers for
  `if`/`for`/`block`/`with`/`filter`/`spaceless`/`autoescape`/`verbatim`/`comment`/
  `cache`/`blocktrans`/`blocktranslate`, HTML+DTL indentation rules and on-enter
  indent/outdent inside DTL blocks.
- `configurationDefaults` that wire Emmet for both Django languages
  (`emmet.includeLanguages`) and set `editor.suggest.insertMode: "replace"` for
  `[django-html]` and `[django-txt]`.
- Static snippet bundles: 166 template-tag snippets and 60 template-filter snippets
  for `html`, `django-html` and `django-txt`; plus Python snippets for `python`
  (models 61, forms 43, views 29, urls 19, admin 15).
- DTL tag registry covering 42 built-in tags and 57 built-in filters, with inline
  documentation for 28 tags and 42 filters, 6 loadable libraries (`i18n`, `static`,
  `l10n`, `tz`, `cache`, `humanize`) and the Django 6.0 `{% partial %}` /
  `{% partialdef %}` tags.

#### Workspace indexing

- A workspace scanner that indexes `**/models.py`, `**/views.py`, `**/views/**/*.py`,
  `**/forms.py`, `**/urls.py`, `**/migrations/*.py`, `**/helpers.py` and
  `**/templates/**/*.{html,txt}`, skipping virtualenvs, `site-packages`,
  `node_modules`, `__pycache__`, build/cache directories, `static` and `media`.
- A file watcher scoped to exactly those patterns, with a 200 ms debounce
  window. It deliberately does not watch `**/*.py`: an in-workspace `.venv` or
  `site-packages` would otherwise turn every `pip install` into a full rescan,
  which is especially costly in a devcontainer bind mount. Diagnostics,
  sidebars, file decorations and the ER diagram all refresh from the same
  rescan.
- A typed view-context inference engine that populates each view's context
  variables, marks conditionally-set variables coming from helper calls and `if`
  branches, and feeds completion, hover, go-to-definition and diagnostics.

#### IntelliSense (completion)

| Trigger                                                                                                                                         | What it completes                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{% include "` / `{% extends "` and `render(`, `template_name`, `get_template(`, `select_template(`, `render_to_string(`, `TemplateResponse(` … | Template paths (30 s cache)                                                                                                                                                |
| `{% url '` and `reverse(`, `redirect(`, `resolve(`                                                                                              | URL names, then that pattern's path arguments                                                                                                                              |
| `{% static "`, `static(`, `STATIC_URL +`, and `url(` in CSS/SCSS/Less                                                                           | Static file paths (30 s cache)                                                                                                                                             |
| `\|` inside `{{ … }}`                                                                                                                           | Built-in DTL filters plus filters from any `{% load %}`ed _Django_ library (`i18n`, `l10n`, `tz`, `humanize`). Filters from custom project libraries are not offered here. |
| `{% block <cursor> %}`                                                                                                                          | Parent block names, following the `{% extends %}` chain up to 5 levels                                                                                                     |
| `{`, `.` and space inside `{{ }}` / `{% %}`                                                                                                     | Context variables and dotted chains (requires Live Mode, see below)                                                                                                        |
| Python files, by filename                                                                                                                       | Context-aware snippets: `models.py` → `dm*`, `forms.py` → `dfo*`, `views.py` → `dv*`, `admin.py` → `da*`, `urls.py` → `du*`, `dimpor*` everywhere                          |

- Dotted context-variable chains resolve hop by hop through the model graph: model
  fields, forward and reverse relations, `@property`, annotations, `values()`
  projections, manager attributes, dict keys and form fields including
  `Meta.fields`. Template-local bindings (for-loop iterators, `{% with %}`,
  incoming `{% include … with %}` kwargs) are included.

#### Hover

- DTL tags and filters: description, syntax, an example in a `django` code block
  and a link to the Django docs.
- Template paths in `{% include %}` / `{% extends %}`: preview of the target file's
  first 15 lines.
- URL names in `{% url %}`: the URL pattern, the view it maps to and its source file.
- Model fields: hovering any segment of a chain such as `{{ order.customer.email }}`
  reports what that segment is — field with type and attributes, forward or reverse
  relation, `@property`, annotation, manager attribute or dict key. Requires Live Mode.

#### Navigation

- Go to Definition for template paths (templates and Python), URL names (jump to the
  `path()` declaration) and context variables (variable → view, field → declaring
  model, relation → related model, annotation → view).
- Document links: template paths in `{% include %}` / `{% extends %}`, in
  `render(request, "…")` / `template_name = "…"`, and any relative `"./…"` or
  `"../…"` string become clickable.
- Document highlight for DTL tag pairs: the cursor inside a block tag highlights its
  matching opener/closer with correct depth counting; from a mid tag (`else`,
  `elif`, `empty`) it highlights both ends.
- Folding ranges for `html`, `django-html` and `django-txt`.

#### Diagnostics

| Collection                 | Languages                     | What it reports                                                                                                                                                                                             |
| -------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `django-view-context`      | html, django-html, django-txt | Template variables absent from the view context and dotted chains that do not resolve against the model graph, with did-you-mean suggestions. Requires Live Mode.                                           |
| `django-dtl-load`          | html, django-html, django-txt | Warning `missing-load` when a tag/filter needs an unloaded library; Information `unused-load` when a library is loaded but never used. Custom libraries are discovered from the scanned `helpers.py` files. |
| `django-url-refs`          | html, django-html, django-txt | Warning `undefined-url-name` when a `{% url %}` name exists in no `urls.py`.                                                                                                                                |
| `django-include`           | html, django-html, django-txt | Hint on multi-line `{% include %}` blocks, with a left-border editor decoration and an overview-ruler mark.                                                                                                 |
| `django-js` / `django-css` | html, django-html             | Real JavaScript syntax errors and unbalanced CSS braces inside `<script>` / `<style>`, after stripping DTL.                                                                                                 |

- Quick fix for `missing-load`: `Add {% load <lib> %}` per missing library (marked
  preferred), plus an `Add all missing {% load %} tags` source-fix-all action that
  works with fix-on-save. Insertion merges into an existing `{% load %}` line,
  otherwise goes after `{% extends %}` or at the top of the file.
- CodeLens above `{% include %}` tags: `Collapse to inline` on multi-line includes,
  `Expand HTML props` on single-line includes carrying HTML-valued props.
- The script/style diagnostics exist to suppress the false positives VS Code's own
  HTML validator produces on `{{ }}` / `{% %}`. To do that, once a scan confirms the
  workspace really is a Django project, the extension writes
  `html.validate.scripts = false` and `html.validate.styles = false` into your
  **Workspace** settings, gated by
  `djangoLanguageService.suppressBuiltinHtmlValidation`. It runs once per session,
  never writes to User settings, never writes without a workspace open, and leaves
  keys that are already `false` alone.

#### Formatting

- Document formatting provider for `html`, `django-html` and `django-txt`, driving
  Format Document, Format on Save and the `formatDocument` command.
- `{% include %}` reshaping: expand a single-line include with HTML-valued props to
  multi-line, collapse a multi-line one back to a single line, or do either across
  the whole document.

| Setting                                               | Type    | Default     | Behaviour                                                                                                                                                        |
| ----------------------------------------------------- | ------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `djangoLanguageService.format.tabWidth`               | number  | `2`         | Spaces per indentation level; falls back to the editor's `tabSize`.                                                                                              |
| `djangoLanguageService.format.useTabs`                | boolean | `false`     | Indent with tabs instead of spaces.                                                                                                                              |
| `djangoLanguageService.format.printWidth`             | number  | `120`       | Line width. Only consulted when `singleAttributePerLine` is on.                                                                                                  |
| `djangoLanguageService.format.singleAttributePerLine` | boolean | `false`     | Explodes an HTML tag to one attribute per line **only** when the indented line exceeds `printWidth` and the tag has at least 2 attributes.                       |
| `djangoLanguageService.excludePaths`                  | array   | 14 segments | Directories never indexed or watched; `".*"` covers every dot-directory.                                                                                         |
| `djangoLanguageService.suppressBuiltinHtmlValidation` | boolean | `true`      | Write `html.validate.scripts/styles = false` into Workspace settings once a scan confirms a Django project, so the DTL-aware checkers replace the built-in ones. |
| `djangoLanguageService.snippets.enabled`              | boolean | `true`      | Gates the dynamic Python snippet completion provider only. The static `contributes.snippets` bundles are unaffected.                                             |

#### Explorer and status bar

- File decoration badge with the count of multi-line `{% include %}` blocks per
  template (capped at `9+`), coloured with `editorWarning.foreground`.
- File decoration `?` badge on orphan templates — templates rendered by no view and
  targeted by no `{% include %}` or `{% extends %}`.
- Status bar item `Django Language Service: N` with a tooltip breaking the number
  down into orphan templates and multi-line includes. Hidden when the total is 0;
  clicking it focuses the Orphans view.

#### Sidebar

An activity-bar container with four webview views, all shown when a folder is open:

- **Views** — for the active template, the views that can reach it and each one's
  template chain, with the Live Mode marker.
- **Layouts & Partials** — templates extended by others (with child count) and
  templates included by others (with includer count).
- **Orphans** — the orphan template list and the total template count.
- **Models** — total models, total apps, top apps, and an app → models tree; picking
  a model opens `models.py` at its class line.

#### Live Mode

Context-variable completion, model-field hover, context-variable go-to-definition
and the `django-view-context` diagnostics are all gated on Live Mode. It stores the
qualified view key `<app>.<name>` in workspace state under
`django-language-service.liveView` and is toggled per view from the Views sidebar or
via the `toggleLiveForView` command.

#### ER model diagram

- A singleton **Django Model Diagram** webview panel, opened beside the editor,
  keeping its context when hidden and re-rendering on every rescan.
- Diagram data comes from a pure serializer: models, FK/M2M/O2O relation lines with
  `on_delete`, field and relation tooltips including choices, cycle detection, hub
  tiers, orphan detection, migration timeline steps/snapshots/comparisons and
  pre-generated exports.
- Toolbar: fit to viewport, hand/pan tool, rescan workspace, force-directed
  re-layout, detailed vs compact boxes, show all hidden, blast radius (what a
  `CASCADE` delete would take with it), circular-reference highlighting, migration
  timeline with compare-against-current, FK/M2M/O2O relation filters, app filter,
  search, and live metrics (models, FK, M2M, O2O, apps, average fields, largest
  model).
- Migration history built from `CreateModel` / `AddField` metadata, with real field
  types and relations reconstructed, dependency-DAG chronological ordering, ghost
  cards for models removed since the compared migration, and canvas focus on only
  what a migration changed.
- Exports to clipboard: Mermaid ER diagram, DBML (dbdiagram.io), PlantUML IE syntax
  and raw SVG. Box positions can be saved and loaded as JSON.
- Keyboard: `Space`+drag pan, `Ctrl`+wheel zoom, `+` / `−` zoom, `0` reset zoom,
  `F` fit visible models, `/` focus search, `Esc` close popover, arrows pan the
  viewport (`Shift` for a bigger step), right-click for the context menu.
- Empty states: an animated "Scanning workspace" hero until the first scan settles,
  then a "No Django models found" panel with a refresh action if nothing was found.

#### Commands

| Command                                                 | Title                                 |
| ------------------------------------------------------- | ------------------------------------- |
| `django-language-service.toggleComment`                 | Toggle Template Comment               |
| `django-language-service.prettyInclude`                 | Toggle HTML Props (Expand / Collapse) |
| `django-language-service.collapseInclude`               | Collapse to Inline                    |
| `django-language-service.collapseAllIncludesInDocument` | Collapse All Includes                 |
| `django-language-service.expandAllIncludesInDocument`   | Expand All Includes                   |
| `django-language-service.clearContextDiagnostics`       | Clear Diagnostics                     |
| `django-language-service.pickView`                      | Pick View (Quick Pick)                |
| `django-language-service.refreshViewContext`            | Refresh View Context                  |
| `django-language-service.validateContext`               | Validate Context Variables            |
| `django-language-service.toggleLiveForView`             | Enable Live Validation                |
| `django-language-service.toggleLiveForViewOff`          | Disable Live Validation               |
| `django-language-service.showModelDiagram`              | Show Model Diagram                    |
| `django-language-service.focusDebtSidebar`              | Focus Orphans & Debt Sidebar          |
| `django-language-service.formatDocument`                | Format Document                       |
| `django-language-service.showLog`                       | Show Log                              |

Keybindings:

| Shortcut (macOS)                | Command                 | When                                                                    |
| ------------------------------- | ----------------------- | ----------------------------------------------------------------------- |
| `ctrl+shift+/` (`cmd+shift+/`)  | Toggle Template Comment | `editorTextFocus` and language is `html`, `django-html` or `django-txt` |
| `ctrl+k ctrl+d` (`cmd+k cmd+d`) | Show Model Diagram      | a folder is open                                                        |

`Collapse All Includes` and `Expand All Includes` are also available from the editor
context menu in `html`, `django-html` and `django-txt` files.

### Known limitations

These are stated so the feature list is not read as a promise:

- `django-html` and `django-txt` declare no file extensions or filename patterns, so
  no file is assigned to them automatically. Configure `files.associations` if you
  want the dedicated language modes. Every DTL provider also targets plain `html`,
  so the features work in `.html` files as-is.
- `djangoLanguageService.excludePaths` replaces the default list rather than adding
  to it, and a change requires a window reload before the index picks it up.

---

### Pre-release development

Everything before 0.1.0 was a full ground-up rewrite carried out in solo phases and
never published. The 13 `v0.x.y-*` git tags are **phase milestones, not releases**:

- `v0.0.1-baseline` / `-inventory-done` — feature inventory of the previous codebase.
- `v0.1.0-baseline` / `-data-model-done` — skeleton, logger, domain entities and the
  Project / Index / Scanner / Adapter / webview-protocol contracts.
- `v0.2.0-baseline` / `-parsers-done` — every parser rewritten as a pure function
  (urls, DTL, template variables, helpers, templates, forms, views, migrations, models).
- `v0.3.0-baseline` / `-scanner-done` — indexing infrastructure: `FileSystem` port,
  parse cache, two-pass scanner, debounced watcher, project emitter.
- `v0.4.0-baseline` / `-adapters-done` — pure domain ports (formatting, folding,
  comments, include-pretty, DTL registry) and the ~40 VS Code adapters.
- `v0.5.0-baseline` / `-webview-done` — Svelte sidebar and diagram apps, the esbuild
  and Tailwind pipeline, and the typed extension ↔ webview message protocol.
- `v0.6.0-baseline` — test and build hardening (unit + VS Code integration suites),
  plus the migration data model, timeline UX, sidebar UX and view-context inference
  engine landed above.
