/**
 * Flat ESLint config.
 *
 * What this is FOR, given `tsconfig.json` already runs `noUncheckedIndexedAccess`,
 * `exactOptionalPropertyTypes`, `noUnusedLocals`, `noUnusedParameters`,
 * `noImplicitReturns` and `noFallthroughCasesInSwitch`: those cover most of what
 * people install ESLint for, and they cover it at the type level, which is
 * better. So the rules below are the ones a type-checker cannot express —
 * mistakes about INTENT rather than about types.
 *
 * Formatting is not ESLint's job here. `eslint-config-prettier` is applied last
 * and switches off every stylistic rule, so the two tools never argue about the
 * same line.
 */
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'out/**',
      'out-webview/**',
      '.vscode-test/**',
      'node_modules/**',
      // The documentation site's build output and Astro's generated types.
      'docs-site/dist/**',
      'docs-site/.astro/**',
      // The Django fixture is a fixture: its Python and its templates are the
      // input to the tests, not source we maintain.
      'src/test-django-project/**',
      '**/__fixtures__/**',
    ],
  },

  js.configs.recommended,

  // Scoped by extension on purpose. The Svelte plugin's recommended set is
  // written for `.svelte` files and crashes when its rules are handed a plain
  // `.js` — `svelte/no-inner-declarations` throws on esbuild.js.
  ...tseslint.configs.recommended.map(config => ({
    ...config,
    files: ['**/*.ts', '**/*.mts', '**/*.svelte'],
  })),
  ...svelte.configs['flat/recommended'].map(config => ({
    ...config,
    files: ['**/*.svelte'],
  })),

  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      // `catch {}` throwing away the reason is a real defect in this codebase's
      // history: it is what made `esbuild.js` report "finished with 2 error(s)"
      // and `integration-tests/run.ts` report "Integration tests failed" with
      // nothing else. A count is not a diagnostic.
      'no-empty': ['error', { allowEmptyCatch: false }],

      // Comments in this repo carry a zero-width space inside `**​/` so that
      // writing a glob in prose does not close the block comment. That is
      // deliberate and load-bearing; irregular whitespace in CODE is not.
      'no-irregular-whitespace': ['error', { skipComments: true, skipStrings: true }],

      'prefer-const': 'error',
      'no-var': 'error',

      // TypeScript resolves identifiers, and it knows which lib and which
      // globals each tsconfig grants. `no-undef` does not: on this repo it
      // reported `process`, `console`, `Buffer`, `fetch` and `window` — 51
      // findings, none of them a defect. typescript-eslint says to turn it off
      // for exactly this reason.
      'no-undef': 'off',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['error', { allow: ['error', 'warn'] }],
    },
  },

  {
    // The TypeScript rules, only where the TypeScript plugin is loaded.
    files: ['**/*.ts', '**/*.mts', '**/*.svelte'],
    rules: {
      // An unused variable that survives a refactor is usually a question the
      // author forgot to finish. `_`-prefixed ones are deliberate.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // `any` erases exactly the checking the strict tsconfig was turned on for.
      '@typescript-eslint/no-explicit-any': 'error',
      // `no-unused-vars` is the TypeScript one above; the base rule double-reports.
      'no-unused-vars': 'off',
    },
  },

  {
    // A `.svelte` file's `<script lang="ts">` is TypeScript, and the Svelte
    // parser needs to be handed the TypeScript one to read it.
    files: ['**/*.svelte'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
    },
    rules: {
      // `let count = $state(0)` MUST be `let` — the rune reassigns it behind
      // the compiler. The core rule does not know that and reported 283 of
      // them; the Svelte one understands runes and still catches the rest.
      'prefer-const': 'off',
      'svelte/prefer-const': 'error',

      // Off, and not to reach zero. Both shapes it flags here are deliberate:
      // `TreeView` keeps its expansion state in a `$state(new Set())` and
      // REPLACES the set rather than mutating it — the comment above the code
      // says so, because that is what makes the `$derived` re-run — and
      // `SearchResultsDropdown` builds plain `Map`s as locals inside ordinary
      // functions, which are not state at all. `SvelteSet` exists for code that
      // mutates in place; this code does not.
      'svelte/prefer-svelte-reactivity': 'off',

      // Off for the same reason as the rule above: the two it flags are
      // `{' '}`, which is the reliable way to emit a space Svelte will not trim
      // at an element boundary. A bare space there is at the mercy of
      // whitespace handling; the mustache is not.
      'svelte/no-useless-mustaches': 'off',
    },
  },

  {
    // Tests measure, log and reach for shapes production code should not.
    files: ['**/*.test.ts', 'src/test-support/**', 'src/integration-tests/**'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },

  {
    // Build and config scripts are CommonJS and run on Node.
    files: ['esbuild.js', '*.config.js', 'scripts/**/*.js', 'scripts/**/*.cjs'],
    languageOptions: { sourceType: 'commonjs' },
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  {
    // Developer harnesses under scripts/. They are run by hand, their output IS
    // the console, and they never ship: `.vscodeignore` excludes the folder.
    files: ['scripts/**'],
    rules: { 'no-console': 'off' },
  },

  prettier,
);
