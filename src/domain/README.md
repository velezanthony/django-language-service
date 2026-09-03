# domain

Pure business logic. **No `vscode` import, no `fs`, no `path`, no framework** — every module
here is plain TypeScript over plain data. Domain depends on nothing but itself: it never
imports `$infra`, `$adapters` or `$shared`. Everything else depends inward on it
(`adapters → infra → domain`).

That purity is the point: domain code runs in vitest with no extension host, and its output
is vscode-free data that adapters translate (e.g. `view-context/diagnose` returns 1-based
line/col which the diagnostics adapter converts to 0-based `vscode.Range`;
`folding/folding-ranges` mirrors `vscode.FoldingRangeKind` without importing it).
`src/architecture.test.ts` asserts the parts of that a type-checker cannot see — no `vscode`,
no `fs`/`path`, nothing from `$adapters` or `$infra` — so the day one stops being true a test
says so rather than a reviewer. The guard lives outside `src/domain`, and the `$shared` half of
the rule is still convention.

## Subdirectories

| Directory           | Owns                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contracts/`        | `Parser`/`ParseResult`/`ParseError`/`ParserOpts`, `Index<T,K>`, `Project` — the interfaces infra implements — plus `fresh-regex`, which is not one: a `/g` pattern shared by two readers carries `lastIndex` between them and they skip each other's matches, and copying it by hand as `new RegExp(re.source, 'g')` drops whatever else the original declared, so a pattern needing `u` for `\p{ID_Start}` matched `{% block título %}` as `t` |
| `types/`            | One file per entity type: model, view, form, url, template, migration, helper, field, relation, choice, context-var, template-var                                                                                                                                                                                                                                                                                                               |
| `parsers/`          | One parser per artifact (models, views, forms, urls, migrations, helpers, template, template-variables, url-references) plus shared token tables in `_shared/`                                                                                                                                                                                                                                                                                  |
| `view-context/`     | View → template context inference: chain resolver, context inference, template scope, model graph, completion entries, diagnose, find-similar. Plus view DISCOVERY, which is not inference: `url-conf-views` synthesises views from `urls.py` entries and `class-context` extracts CBV and mixin attributes — the scanner calls both, no adapter does                                                                                           |
| `diagram/`          | ER diagram serializer, layout engine, migration timeline/snapshots and export formats (Mermaid, DBML, PlantUML)                                                                                                                                                                                                                                                                                                                                 |
| `include-pretty/`   | Finder, parser and formatter for multi-line `{% include %}` tags                                                                                                                                                                                                                                                                                                                                                                                |
| `formatting/`       | DTL/HTML document formatter, its DTL parser and the tag patterns                                                                                                                                                                                                                                                                                                                                                                                |
| `folding/`          | Folding-range computation for templates                                                                                                                                                                                                                                                                                                                                                                                                         |
| `comments/`         | Toggle-comment logic for DTL (`{# … #}` / `{% comment %}`)                                                                                                                                                                                                                                                                                                                                                                                      |
| `dtl-tag-registry/` | Built-in Django template tag and filter names, docs and `{% load %}` info                                                                                                                                                                                                                                                                                                                                                                       |

## Testing

Domain is the layer with the highest test expectation, because it is the cheapest to test:
logic modules ship a co-located `*.test.ts` run by vitest (`npm test`), with fixtures under
`__fixtures__/`. Type declarations and barrels carry none, and neither do
`view-context/url-conf-views` and `view-context/class-context`: their only coverage is the
scanner suite in `src/infra`, so a change to either is verified by a test in another layer or
not at all. New domain code arrives with its tests. Tests are the only place domain
files may import outside `$domain` (`vitest`, and `node:fs`/`node:path` to load fixtures) —
production domain code never does.

If you find yourself needing `vscode` here, the logic belongs in `src/adapters`; if you need
the filesystem, it belongs in `src/infra`.
