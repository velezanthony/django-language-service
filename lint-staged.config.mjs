/**
 * lint-staged — what `.husky/pre-commit` runs, and the only thing it runs.
 *
 * Two tools, both in fix mode, both handed an explicit list of STAGED paths.
 * Nothing here walks the tree. Measured on this repo: `eslint .` 7.5-12.0 s and
 * `prettier --check .` 11.0-14.7 s, so 19-27 s for those two alone. Handed the
 * staged paths instead, the same two cost ~2.5 s for one file and ~4.3 s for
 * twenty — and most of that is fixed process start-up (ESLint boots the flat
 * config and typescript-eslint in ~1.9 s before it reads a single line; the
 * marginal cost is ~40 ms per file).
 *
 * The whole-tree answer is already produced by `npm run package` and by CI. A
 * pre-commit hook that costs 20 s is a hook that gets bypassed, and
 * CONTRIBUTING.md forbids `--no-verify`.
 *
 * Order matters: eslint first, prettier second. `eslint --fix` can rewrite a
 * line (`let` → `const`) and leave it formatted the way ESLint felt like
 * formatting it; `eslint-config-prettier` switches off every stylistic rule, so
 * ESLint has no opinion to defend and Prettier gets the last word. Reversed,
 * the commit would land Prettier-clean code that `npm run format:check` then
 * rejects.
 *
 * The flags are not decoration:
 *   --no-warn-ignored   eslint.config.mjs ignores `src/test-django-project/**`
 *                       and `**​/__fixtures__/**`. Staging a file from there and
 *                       naming it on the command line makes ESLint warn about
 *                       being asked to lint something it was told to skip.
 *                       Nothing is wrong, so nothing should be printed.
 *   --ignore-unknown    Prettier errors on a file extension it has no parser
 *                       for. The glob below is a best-effort list, not a proof;
 *                       this flag makes the miss a no-op instead of a failed
 *                       commit. (.prettierignore is honoured either way.)
 *
 * Deleted files never reach these commands — lint-staged filters the index with
 * `--diff-filter=ACMR`, so a commit that only removes files runs no task at all
 * and exits 0.
 */
export default {
  // ESLint's own `files` scoping in eslint.config.mjs covers .ts/.mts/.svelte;
  // plain .js/.mjs/.cjs get js.configs.recommended. Both are worth fixing.
  '*.{ts,mts,js,mjs,cjs,svelte}': [
    'eslint --fix --no-warn-ignored',
    'prettier --write --ignore-unknown',
  ],

  // Everything else `prettier --check .` would judge in CI. Kept in sync with
  // that command's reach on purpose: a file this list forgets is a file the
  // hook lets through and CI then rejects, which is the failure mode this whole
  // exercise exists to remove.
  '*.{json,jsonc,md,css,html,yml,yaml}': ['prettier --write --ignore-unknown'],
};
