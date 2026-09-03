/**
 * The boundaries the type-checker cannot see.
 *
 * Three facts hold across this repository, none of which `tsc`, `svelte-check`
 * or the unit suite can tell you about:
 *
 *   1. `src/domain` does not import `vscode`.
 *   2. `src/domain` does not import `node:fs` or `node:path`.
 *   3. Nothing bundled for a browser imports `src/shared/logger`, which imports
 *      `vscode` eagerly at module scope.
 *
 * All three were TRUE when this file was written — the discipline is real. What
 * was missing is anything that would notice the day one stopped being true, and
 * (3) had a loaded gun pointed at it: `$shared` was aliased in both browser
 * bundles, so a single `import { logError } from '$shared/logger'` in a
 * `.svelte` file would have broken the bundle at runtime with every gate green.
 *
 * The fourth check is the alias table itself. It is written out by hand in four
 * files, CONTRIBUTING.md says "Change one, change all four", and with 117 unit
 * test files not one of them read it. A comment where an assert belongs.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '..');

function sourceFilesUnder(dir: string, extensions: readonly string[]): string[] {
  const out: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      if (statSync(full).isDirectory()) {
        if (entry === 'node_modules' || entry === '__fixtures__' || entry === '__probe__') continue;
        walk(full);
        continue;
      }
      if (extensions.some(ext => entry.endsWith(ext))) out.push(full);
    }
  };
  walk(dir);
  return out;
}

/** Import specifiers in a file, ignoring anything inside a block comment. */
function importsOf(file: string): string[] {
  const source = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  return [...source.matchAll(/(?:^|\n)\s*import\s[^;]*?from\s*['"]([^'"]+)['"]/g)]
    .map(m => m[1]!)
    .concat([...source.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g)].map(m => m[1]!));
}

const isTest = (file: string) => file.endsWith('.test.ts');
const shortName = (file: string) => relative(ROOT, file);

describe('domain is independent of the editor', () => {
  const domainFiles = sourceFilesUnder(join(ROOT, 'src/domain'), ['.ts']).filter(f => !isTest(f));

  it('has files to check', () => {
    expect(domainFiles.length).toBeGreaterThan(50);
  });

  it('imports vscode nowhere', () => {
    const offenders = domainFiles.filter(f => importsOf(f).includes('vscode'));
    expect(offenders.map(shortName)).toEqual([]);
  });

  it('imports no filesystem or path module', () => {
    const banned = ['fs', 'path', 'node:fs', 'node:path', 'node:fs/promises', 'fs/promises'];
    const offenders = domainFiles.filter(f => importsOf(f).some(i => banned.includes(i)));
    expect(offenders.map(shortName)).toEqual([]);
  });

  it('imports nothing from the adapter or infra layers', () => {
    const offenders = domainFiles.filter(f =>
      importsOf(f).some(i => i.startsWith('$adapters') || i.startsWith('$infra')),
    );
    expect(offenders.map(shortName)).toEqual([]);
  });
});

describe('nothing bundled for a browser reaches vscode', () => {
  const browserFiles = [
    ...sourceFilesUnder(join(ROOT, 'src/webview'), ['.ts', '.svelte']),
    ...sourceFilesUnder(join(ROOT, 'src/sidebar'), ['.ts', '.svelte']),
  ].filter(f => !isTest(f));

  it('has files to check', () => {
    expect(browserFiles.length).toBeGreaterThan(20);
  });

  it('imports vscode nowhere', () => {
    const offenders = browserFiles.filter(f => importsOf(f).includes('vscode'));
    expect(offenders.map(shortName)).toEqual([]);
  });

  // `src/shared/logger.ts` opens with `import * as vscode from 'vscode'` at
  // module scope, so importing it from a browser bundle breaks that bundle at
  // load time — and neither check-types nor the unit suite would say a word.
  it('imports nothing from $shared, whose logger reaches vscode', () => {
    const offenders = browserFiles.filter(f =>
      importsOf(f).some(i => i === '$shared' || i.startsWith('$shared/')),
    );
    expect(offenders.map(shortName)).toEqual([]);
  });

  it('and that logger really does import vscode, so the rule above still earns its place', () => {
    expect(importsOf(join(ROOT, 'src/shared/logger.ts'))).toContain('vscode');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The alias table, in the four places it is written by hand.
// ─────────────────────────────────────────────────────────────────────────────
describe('the four alias tables agree', () => {
  const read = (file: string) => readFileSync(join(ROOT, file), 'utf8');

  /** `$name` → `src/dir`, however the file happens to spell the target. */
  const normalise = (target: string): string =>
    target.replace(/^\.\//, '').replace(/\/\*$/, '').replace(/\/$/, '');

  const fromEsbuild = (block: string): Map<string, string> => {
    const body =
      new RegExp(`const ${block} = \\{([\\s\\S]*?)\\};`).exec(read('esbuild.js'))?.[1] ?? '';
    return new Map(
      // Quoted or not: a formatter is free to drop the quotes on an object key,
      // and this test reads SOURCE TEXT, so it has to survive that.
      [...body.matchAll(/'?(\$\w+)'?\s*:\s*'([^']+)'/g)].map(m => [m[1]!, normalise(m[2]!)]),
    );
  };

  const fromTsconfig = (file: string): Map<string, string> => {
    const paths = /"paths"\s*:\s*\{([\s\S]*?)\n\s*\}/.exec(read(file))?.[1] ?? '';
    return new Map(
      [...paths.matchAll(/"(\$[\w]+)(?:\/\*)?"\s*:\s*\[\s*"([^"]+)"/g)].map(m => [
        m[1]!,
        normalise(m[2]!),
      ]),
    );
  };

  const fromVitest = (): Map<string, string> =>
    new Map(
      [
        ...read('vitest.config.ts').matchAll(
          /find:\s*'(\$[\w]+)',\s*replacement:\s*resolve\(__dirname,\s*'([^']+)'\)/g,
        ),
      ].map(m => [m[1]!, normalise(m[2]!)]),
    );

  const extensionAlias = fromEsbuild('extensionAlias');
  const webviewAlias = fromEsbuild('webviewAlias');
  const hostTsconfig = fromTsconfig('tsconfig.json');
  const webviewTsconfig = fromTsconfig('tsconfig.webview.json');
  const vitestAlias = fromVitest();

  it('each table was actually read', () => {
    for (const [label, table] of [
      ['esbuild extensionAlias', extensionAlias],
      ['esbuild webviewAlias', webviewAlias],
      ['tsconfig.json', hostTsconfig],
      ['tsconfig.webview.json', webviewTsconfig],
      ['vitest.config.ts', vitestAlias],
    ] as const) {
      expect(
        table.size,
        `${label} parsed as empty — the parser above needs updating`,
      ).toBeGreaterThan(0);
    }
  });

  it('esbuild and tsconfig.json agree about the extension host', () => {
    expect(Object.fromEntries([...extensionAlias].sort())).toEqual(
      Object.fromEntries([...hostTsconfig].sort()),
    );
  });

  it('esbuild and tsconfig.webview.json agree about the webview', () => {
    expect(Object.fromEntries([...webviewAlias].sort())).toEqual(
      Object.fromEntries([...webviewTsconfig].sort()),
    );
  });

  it('vitest resolves every alias the two bundles do, to the same place', () => {
    for (const [alias, target] of [...extensionAlias, ...webviewAlias]) {
      expect(vitestAlias.get(alias), `vitest.config.ts is missing ${alias}`).toBe(target);
    }
  });
});
