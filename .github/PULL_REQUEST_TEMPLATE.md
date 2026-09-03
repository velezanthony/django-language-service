<!--
The checklist below is this repository's, not a generic one. Every item is
either a gate that will fail, or a trap that has already cost somebody a
debugging session — see CONTRIBUTING.md § Gotchas for the stories.
-->

## What

<!-- One or two sentences. What behaviour is different after this? -->

## Why

<!-- What made this necessary: a defect, a missing capability, a decision.
     If it fixes a defect, name what the user saw — "a red squiggle on a correct
     line", not "a regex was wrong". -->

## How

<!-- The approach, and anything you rejected. If you changed a shared reader,
     say which other callers you checked. -->

---

## Checklist

**The gates.** `npm run package` runs the first five; CI runs all of them.

- [ ] `npm run check-types` and `npm run check-svelte`
- [ ] `npm run lint` and `npm run format:check`
- [ ] `npm test`
- [ ] `npm run test:integration` — needed for anything touching an adapter,
      the webview, or the formatter
- [ ] `npx @vscode/vsce package` — the only step that proves the shipped
      artefact still builds

**Tests.**

- [ ] Any new test was seen RED before the fix. A test you have only seen pass
      does not tell you it guards anything.
- [ ] Its controls pass. A red run whose control is also red is a broken
      harness, not a defect.
- [ ] A performance claim is a RATIO, not a duration — `test-support/scaling.ts`.
      A fixed millisecond budget is flaky on a loaded machine and blind to a
      threefold slowdown.

**The traps.**

- [ ] New Tailwind utility class? `npm run build:css`. `compile` and `watch` do
      not regenerate the stylesheet.
- [ ] New path alias? It lives in **four** files: `esbuild.js`,
      `tsconfig.json`, `tsconfig.webview.json`, `vitest.config.ts`.
      `src/architecture.test.ts` fails if they disagree.
- [ ] New file at the repository root? `.vscodeignore` is a **deny-list** —
      anything not named there ships inside the `.vsix`.
- [ ] Reading a Python or template identifier? `PY_IDENT`, never `\w`.
      `\w` is `[A-Za-z0-9_]`, and `class Artículo` is ordinary Django.
- [ ] Reading a quoted string? The **opening** quote closes it. `['"]([^'"]+)['"]`
      truncates `"User's profile"` to `User` without failing.
- [ ] Copying a `/g` regex? `freshRegex(re)`. `new RegExp(re.source, 'g')`
      drops every other flag, silently.

**Comments and commits.**

- [ ] Comments say what the code does and what a caller must not break. The
      story of the bug belongs in the commit message. No file carries more
      comment lines than code lines.
- [ ] Conventional Commits, one author per commit, no `Co-Authored-By` or
      attribution trailers.
- [ ] No `--no-verify`. If the hook fails, the problem is the thing to fix.
