const sveltePreprocess = require('svelte-preprocess');

// CRITICAL: verbatimModuleSyntax MUST be set in the preprocessor's TS options,
// not just in tsconfig.svelte.json. Without it, svelte-preprocess runs
// TypeScript's transpileModule with the default compiler options — which
// STRIPS imports the TS compiler considers "unused". Component imports look
// unused to TS because Svelte's `<ChildComponent />` syntax in templates is
// invisible to the TS layer. The result was a bundle that referenced
// e.g. ToolbarStat() but never imported its compiled module, blowing up at
// runtime with "ToolbarStat is not defined".
module.exports = {
  preprocess: sveltePreprocess({
    typescript: {
      compilerOptions: {
        verbatimModuleSyntax: true,
      },
    },
  }),
  compilerOptions: {
    runes: true,
  },
};
