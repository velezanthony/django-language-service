import { defineConfig, type Plugin } from 'vitest/config';
import { resolve } from 'node:path';
import { compile, compileModule } from 'svelte/compiler';

/**
 * Minimal Svelte→JS compile plugin for tests.
 *
 * Why not @sveltejs/vite-plugin-svelte? Its current major requires vite 8,
 * whose peer range wants esbuild ^0.27 — the extension build pins esbuild
 * ^0.24 (esbuild.js + esbuild-svelte), so installing the official plugin
 * leaves `npm install` permanently broken on ERESOLVE. The svelte compiler
 * is already a dependency, and for tests we only need "turn .svelte and
 * .svelte.ts into client JS" — no HMR, no CSS pipeline.
 *
 * - `.svelte` files: compiled with the same options as production
 *   (svelte.config.js → runes: true). Svelte 5 strips `lang="ts"` natively.
 * - `.svelte.ts` runes modules: vite's core esbuild transform has already
 *   lowered TS by the time a normal-phase plugin runs, so compileModule only
 *   needs to compile the runes.
 */
function svelteTestCompile(): Plugin {
  return {
    name: 'svelte-test-compile',
    async transform(code, id) {
      const [filename] = id.split('?');
      if (!filename) return null;
      if (filename.endsWith('.svelte')) {
        const compiled = compile(code, {
          filename,
          generate: 'client',
          runes: true,
          css: 'injected',
        });
        return { code: compiled.js.code, map: compiled.js.map };
      }
      if (/\.svelte\.(ts|js)$/.test(filename)) {
        const compiled = compileModule(code, { filename, generate: 'client' });
        return { code: compiled.js.code, map: compiled.js.map };
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [svelteTestCompile()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'out', '**/__fixtures__/**', 'src/integration-tests/**'],
    reporters: 'default',
    testTimeout: 5_000,
    setupFiles: ['./vitest.setup.ts'],
    server: {
      deps: {
        // Force svelte + testing-library through the vite pipeline so the
        // `/^svelte$/` alias below applies to THEIR imports too. Left
        // externalized, Node's own resolver would hand them the SSR entry
        // (index-server.js) where mount() throws lifecycle_function_unavailable.
        inline: [/^svelte(\/|$)/, /@testing-library\/svelte/],
      },
    },
  },
  resolve: {
    alias: [
      // Force the CLIENT runtime for the bare 'svelte' entry (jsdom component
      // tests). Deterministic replacement for the `browser` exports condition
      // — vitest resolves externals with node conditions otherwise.
      {
        find: /^svelte$/,
        replacement: resolve(__dirname, 'node_modules/svelte/src/index-client.js'),
      },
      // Extension-host layers (mirror esbuild.js extensionAlias)
      { find: '$domain', replacement: resolve(__dirname, 'src/domain') },
      { find: '$infra', replacement: resolve(__dirname, 'src/infra') },
      { find: '$adapters', replacement: resolve(__dirname, 'src/adapters') },
      { find: '$shared', replacement: resolve(__dirname, 'src/shared') },
      // Webview layers (mirror esbuild.js webviewAlias / tsconfig.webview.json)
      { find: '$atoms', replacement: resolve(__dirname, 'src/webview/lib/components/atoms') },
      { find: '$icons', replacement: resolve(__dirname, 'src/webview/lib/components/atoms/icons') },
      {
        find: '$molecules',
        replacement: resolve(__dirname, 'src/webview/lib/components/molecules'),
      },
      {
        find: '$organisms',
        replacement: resolve(__dirname, 'src/webview/lib/components/organisms'),
      },
      { find: '$lib', replacement: resolve(__dirname, 'src/webview/lib') },
      { find: '$protocol', replacement: resolve(__dirname, 'src/shared/protocol') },
    ],
  },
});
