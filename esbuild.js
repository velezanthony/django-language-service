// @ts-check
const esbuild = require('esbuild');
const sveltePlugin = require('esbuild-svelte');
const svelteConfig = require('./svelte.config.js');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

// Emits begin/end markers the VS Code background-task problem matcher reads
// (see .vscode/tasks.json) so F5 WAITS for the watch build to finish before
// launching the Extension Host. Shared across the 3 builds via the `inflight`
// counter → one "started"/"finished" pair per rebuild cycle, not three.
let inflight = 0;
const watchLogPlugin = {
  name: 'watch-log',
  setup(build) {
    build.onStart(() => {
      if (inflight === 0) console.log('[watch] build started');
      inflight++;
    });
    build.onEnd(result => {
      inflight = Math.max(0, inflight - 1);

      // `logLevel: 'silent'` is what keeps three bundles from printing three
      // copies of every notice — but it also swallowed the errors themselves,
      // so a broken build announced "finished with 2 error(s)" and never said
      // which two. A count is not a diagnostic.
      for (const [kind, messages] of [
        ['error', result.errors],
        ['warning', result.warnings],
      ]) {
        if (messages.length === 0) continue;
        for (const line of esbuild.formatMessagesSync(messages, { kind, color: true })) {
          process.stderr.write(line);
        }
      }

      if (inflight === 0) {
        const errs = result.errors.length;
        console.log(`[watch] build finished${errs ? ` with ${errs} error(s)` : ''}`);
      }
    });
  },
};

/** Path aliases used by the extension host bundle (server-side layer). */
const extensionAlias = {
  $domain: './src/domain',
  $infra: './src/infra',
  $adapters: './src/adapters',
  $shared: './src/shared',
};

/** Path aliases used by the webview bundles (browser context).
 *  Must match `paths` in tsconfig.webview.json so esbuild resolves the same
 *  imports that TypeScript / svelte-check sees. */
const webviewAlias = {
  $lib: './src/webview/lib',
  $atoms: './src/webview/lib/components/atoms',
  $icons: './src/webview/lib/components/atoms/icons',
  $molecules: './src/webview/lib/components/molecules',
  $organisms: './src/webview/lib/components/organisms',
  // The protocol types, and ONLY those. This used to be `$shared`, which also
  // reaches `src/shared/logger.ts` — a module whose first line is
  // `import * as vscode from 'vscode'`. One such import from a .svelte file
  // breaks the bundle at load time, and neither check-types, nor svelte-check,
  // nor the unit suite would have said a word. Nothing was importing it; the
  // alias was a loaded gun on the table. See src/architecture.test.ts.
  $protocol: './src/shared/protocol',
};

/** Extension host bundle — runs in Node, imports the vscode module. */
/** @type {import('esbuild').BuildOptions} */
const extensionBuild = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  outfile: 'dist/extension.js',
  external: ['vscode'],
  minify: production,
  sourcemap: !production,
  sourcesContent: false,
  alias: extensionAlias,
  plugins: [watchLogPlugin],
  logLevel: 'silent',
};

/** Diagram webview bundle — runs in the VS Code webview (browser context).
 *  main.ts mounts App.svelte and boots all diagram composables. */
/** @type {import('esbuild').BuildOptions} */
const webviewBuild = {
  entryPoints: ['src/webview/main.ts'],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  outfile: 'dist/diagram-app.js',
  minify: production,
  sourcemap: !production,
  sourcesContent: false,
  tsconfig: 'tsconfig.webview.json',
  conditions: ['svelte', 'browser'],
  mainFields: ['svelte', 'browser', 'module', 'main'],
  alias: webviewAlias,
  plugins: [
    watchLogPlugin,
    sveltePlugin({
      preprocess: svelteConfig.preprocess,
      compilerOptions: svelteConfig.compilerOptions,
    }),
  ],
  logLevel: 'silent',
};

/** Sidebar webview bundle — single bundle loaded into all 4 sidebar
 *  WebviewView instances (Views / Layouts / Orphans / Models). The instance
 *  detects which section to render via a body data-section attribute set by
 *  the extension when generating webview.html.
 *  Shares the Svelte component library + tailwind.css with the diagram bundle. */
/** @type {import('esbuild').BuildOptions} */
const sidebarBuild = {
  entryPoints: ['src/sidebar/sidebar-app.ts'],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  outfile: 'dist/sidebar-app.js',
  minify: production,
  sourcemap: !production,
  sourcesContent: false,
  tsconfig: 'tsconfig.webview.json',
  conditions: ['svelte', 'browser'],
  mainFields: ['svelte', 'browser', 'module', 'main'],
  alias: webviewAlias,
  plugins: [
    watchLogPlugin,
    sveltePlugin({
      preprocess: svelteConfig.preprocess,
      compilerOptions: svelteConfig.compilerOptions,
    }),
  ],
  logLevel: 'silent',
};

async function main() {
  if (watch) {
    const extCtx = await esbuild.context(extensionBuild);
    const webCtx = await esbuild.context(webviewBuild);
    const sidebarCtx = await esbuild.context(sidebarBuild);
    await Promise.all([extCtx.watch(), webCtx.watch(), sidebarCtx.watch()]);
    console.log('[watch] watching extension + diagram + sidebar…');
  } else {
    await Promise.all([
      esbuild.build(extensionBuild),
      esbuild.build(webviewBuild),
      esbuild.build(sidebarBuild),
    ]);
    console.log('build complete');
  }
}

// The error was discarded, so a failing release build printed nothing at all
// and exited 1 — `npm run package` looked like it had simply decided not to.
main().catch(err => {
  console.error(err);
  process.exit(1);
});
