# Open findings

What is known to be wrong or missing, and is not fixed.

The 25 findings the adversarial audit of 2026-09-02 left open are **all
closed**, as are the three the prototypes left behind, and the two classes
found afterwards by asking what a Django project written in another language
looks like. All of it is verified against the five gates, the Electron
integration suite and a built `.vsix`.

The closed work is recorded below rather than deleted, because the pattern
that produced it is worth keeping visible: in every case the CASE had been
fixed at some point and the CLASS had not.

What remains is what was deliberately not taken on, plus the gaps opened
knowingly. Nothing here is critical or high, and everything here is written
from evidence somebody produced, not from suspicion.

---

## Closed since: two classes nobody could see from an English project

Found by asking what a Django project written in another language looks like.
Neither class failed loudly; both produced plausible wrong answers, which is
why neither had ever been reported.

**A quote inside a quoted string ended it.** Every reader was
`['"]([^'"]+)['"]` — open with either quote, forbid both inside, close with
either. On `verbose_name = "User's profile"` it opens at `"`, stops at the
apostrophe, and accepts that same apostrophe as the close. The value is `User`.

- the four prose-valued model options, where apostrophes actually live
- `{% include %}`, `{% url %}`, `{% static %}` — worse here, because a recorded
  reference to a file that does not exist is what raises "template not found":
  a red squiggle on a correct line, under a filename nobody wrote
- `{% extends %}` failed the other way and left the file with no parent,
  wearing the false orphan badge its own comment warns about
- `with title="Bob's shop"`, and the completion that runs on every keystroke —
  the dropdown vanished at the apostrophe and then filtered on `s`
- the shape the repo already had right, twice (`STRING_LITERAL_RE`,
  `STRING_RE`), and had never applied to the readers

**A Python identifier is not `[A-Za-z0-9_]`.** The first Unicode round closed
the four readers that resolve a template's context. It never reached the
declarations, the template names, or the lexer.

- `class Artículo(models.Model)` was not detected at all: no diagram node, no
  hover, no completion, no relation. Everything downstream was correct about a
  model it had no idea existed
- `tagNameOf` — THE grammar reader — named `{% categoría_lista %}` as
  `categor` and `{% κατάλογος %}` as `''`. Not an unknown tag: a nameless one
- blocks, `{% load %}` libraries, filter names, and the quickfix that recovers
  a library from its own diagnostic message
- migrations still read `\w` after models stopped. Not two bugs, one
  DISAGREEMENT — the diagram compares the two, so `Artículo` showed up as a
  model whose migrations appear to be missing

**And the trap that hid half of it:** `new RegExp(RE.source, 'g')` at twelve
call sites. `.source` carries no flags, so writing `'g'` does not keep g — it
drops everything else. Invisible while every pattern was ASCII; the moment one
needed `u`, the copy became a different pattern with the same source text.
`freshRegex(re)` now, with a source-level guard, because nothing at runtime can
see this.

## Closed since: the three that were the same class as something already fixed

Kept here as the record, because the pattern is the one that has bitten this
repository repeatedly — the case gets fixed, the class does not.

- **Non-ASCII identifiers outside `views.ts`.** `PY_IDENT` existed and was
  exported; four readers kept `\w`, so a context key or a helper named `índice`
  was dropped — not misread, dropped. Closed with one test written over the
  CLASS (`src/domain/unicode-identifiers.test.ts`, 28 red first) asserting the
  property against every reader that has to hold it. `escapeForRegExp` replaced
  the `[^\w]` sanitisers, which _deleted_ the characters they could not name.
- **The rest of the `describe-chain` drift.** `{{ order.customer_id }}` and
  `{{ post.get_next_by_published }}` resolved and hovered as nothing. Two new
  `ChainSegmentInfo` kinds, and a source-level guard over the whole class:
  `renderSegment` has no `default`, so a kind with no case renders an EMPTY
  bubble rather than failing — `adapters/hover/segment-kinds.test.ts` now
  fails in both directions.
- **`definition/url-names.ts`** — the last `lineText.indexOf(...)` site among
  the definition providers. It was called invisible; it was not. The search
  began at the tag's `{%`, so `{% url 'url' %}` matched the keyword: Ctrl+Click
  worked on the word `url` and failed on the name in quotes. Now on
  `firstStringArgAt`, which also reads a wrapped tag and skips one inside
  `{# … #}`. The shape survives where a diagnostic or a hover ranges a name the
  domain has already located — `diagnostics/dtl-load.ts` and
  `hover/dtl-docs.ts` — and a line carrying the same reference twice still
  ranges the first one.

## Gaps opened on purpose

| What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Where                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| **The diagram layout's linearity has no automated guard.** Its cost is bounded by three named caps — `relaxRounds`, `MAX_RESOLVE_PASSES` with its three-stall bail, and `REPEL_BUCKET_LIMIT`. Remove any one and the quadratic returns with nothing to notice. The timing test that used to watch this was deleted: measured alone its ratio was 2.68 / 1.07 / 0.66 as the hub grew, and under the full parallel suite it drifted by more than 8x, so it could not tell a defect from a busy machine. | `domain/diagram/diagram-layout.ts` |
| **The diagram's EMPTY state cannot check its stylesheet.** The loaded state can, through a sentinel custom property read with `getComputedStyle`. The empty state's CSP is `default-src 'none'` with no `script-src` — checking it means giving a deliberately script-free document a nonce and a script, which is a design change, not a bug fix.                                                                                                                                                    | `adapters/diagram/panel.ts`        |
| **`invalidateBatch` design (ii) is parked**, not discarded, on branch `proto/infra`. It reprocesses only the paths a batch names, buying ~1 ms of CPU per save over the design that shipped. It changes entity assembly from I/O-completion order to glob order, which re-decides every first-wins tie-break downstream. Both designs already remove 2399 of the 2400 stat calls, so the finding itself is closed.                                                                                    | `infra/scanner.ts`                 |

## Known, lower value

| What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Where                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `resolveSwappableUser` globs `settings.py` across ALL workspace roots, last one wins, and applies one `AUTH_USER_MODEL` globally. Already wrong for two roots before the multi-root work, and untouched by it.                                                                                                                                                                                                                                                                                                                                                                                                                   | `infra/scanner.ts`                          |
| pass 2 is now the dominant per-save cost, since the I/O went away. It walks every model, view and template on every pass.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `infra/scanner.ts`                          |
| The Python branch of `{% url %}` completion inserts the HTML-shaped argument snippet into `reverse('detail')`, which is not valid Python.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `adapters/completion/url-names.ts`          |
| `computeBraceIndent`'s string scanner does not handle backslash escapes, so `"a\"b"` ends the string early.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `domain/formatting/dtl-parser.ts`           |
| `BLOCK_TAG_RE` is cubic. It has no callers and is kept because it documents the grammar; if it ever gains one it needs what `INCLUDE_RE` got.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `domain/parsers/_shared/html-tokens.ts`     |
| `exactOptionalPropertyTypes` is off for `.svelte` files only, with the reason in the file. 43 component props use the `foo={maybeUndefined}` idiom.                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `tsconfig.svelte.json`                      |
| A `db_column` holding a double quote breaks DBML quoting. The database would reject that identifier long before the diagram saw it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `domain/diagram/diagram-exports.ts`         |
| `definition/context-var.ts` still has no test — the last of the three. The directory had none at all until `url-names` got nine, and the first thing those nine found was a defect the notes had called invisible. `template-paths` followed, and its tests were written over a provider that never asked what tag it was in: it walked out to the nearest quotes and called anything holding a `/` or a `.` a template — an `href`, an `<img src>`, a `{% static %}` path, a `with` keyword value, one inside `{# … #}`. It is now on `firstStringArgAt`, like the hover and the document-link provider for the same reference. | `src/adapters/definition/`                  |
| The `{% load %}` quickfix recovers the library name by grepping its own diagnostic MESSAGE, while the domain hands the adapter `requiredLibrary` as a field and `dtl-load.ts` drops it. `Diagnostic.code` is the only channel that survives the trip and already carries the type. Reachable half fixed; the coupling is recorded in the module.                                                                                                                                                                                                                                                                                 | `adapters/diagnostics/dtl-load-quickfix.ts` |
| Roughly thirty adapter files still do their own cursor arithmetic with no unit test. Three defects came out of that shape in one session, so the count is a real estimate of remaining risk, not a tidiness note. The vscode double can now drive document events and read diagnostic collections, which is what used to make most of them untestable.                                                                                                                                                                                                                                                                           | `src/adapters/**`                           |
| 24 files under `src/domain` have no sibling test. Most are `types/` and `contracts/` with nothing to execute; the ones with real logic were given tests, and `patterns.ts` repaid it immediately with two defects.                                                                                                                                                                                                                                                                                                                                                                                                               | `src/domain/**`                             |

## Behaviour changes worth knowing about

Not defects — decisions, recorded so nobody rediscovers them as surprises.

- **The Layouts panel no longer lists a template it cannot resolve.** Django's
  own layouts and packaged ones used to appear as rows whose click did nothing.
  The honest cost: a project whose `DIRS` roots _below_ the innermost
  `templates/` loses a legitimate row instead of getting a broken one.
- **The diagram warns when its stylesheet did not load.** An end user never
  sees it — the `.vsix` always ships a freshly built `dist/tailwind.css`, and
  the sentinel is verified inside the package. A developer with a stale `dist/`
  does, and the warning is true.
- **A workspace with two or more roots** now qualifies every app label with the
  root folder's name — the same name VS Code shows for that folder in the
  explorer. It is keyed on the root count, not on a collision: `'<app>.<name>'`
  is unique inside one Django project and not across two, and a developer with
  an API and its admin open side by side has a `core` in each, so `core.index`
  from one silently overwrote `core.index` from the other and a view left the
  project with nothing warning. A single root, which is nearly every session,
  is untouched.
