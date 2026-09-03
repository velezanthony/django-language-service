import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The stylesheet sentinel, checked end to end as SOURCE TEXT.
 *
 * `$lib/composables/stylesheet-guard` reports the diagram's stylesheet missing
 * when a custom property it expects does not resolve. That guard is only a
 * check if the property is really declared by the stylesheet the panel links —
 * otherwise it inverts into a permanent false alarm on every boot, which is
 * strictly worse than the silence it replaces.
 *
 * Three files have to agree and none of them can import the others: the guard
 * is browser-only (`tsconfig.webview.json` sets `types: []`, so a test beside
 * it cannot read a file), the stylesheet is CSS, and the panel is extension
 * host. So this reads all three as text, and derives the property name FROM the
 * guard rather than restating it — a literal here would be a second copy, and
 * the one that silently goes stale.
 *
 * Vitest stubs CSS imports (`test.css` is false by default), which is why the
 * `?raw` route returns an empty string and this test lives on the node side.
 */

const ROOT = join(__dirname, '..', '..', '..');
const read = (...parts: string[]): string => readFileSync(join(ROOT, ...parts), 'utf8');

const GUARD = read('src', 'webview', 'lib', 'composables', 'stylesheet-guard.ts');
const STYLESHEET = read('src', 'webview', 'styles', 'tailwind.css');
const PANEL = read('src', 'adapters', 'diagram', 'panel.ts');

/** The property the guard actually reads, taken from the guard itself. */
const sentinel = (): string => {
  const found = /STYLESHEET_SENTINEL_PROPERTY\s*=\s*'([^']+)'/.exec(GUARD);
  if (!found?.[1]) throw new Error('stylesheet-guard.ts no longer declares a sentinel property');
  return found[1];
};

describe('the stylesheet sentinel', () => {
  it('is declared by the guard as a custom property', () => {
    // A name without the leading `--` resolves to nothing through
    // getComputedStyle, and the guard would call every boot broken.
    expect(sentinel()).toMatch(/^--[a-z][a-z0-9-]*$/);
  });

  it('is declared by the stylesheet the build compiles into dist/tailwind.css', () => {
    expect(STYLESHEET).toContain(`${sentinel()}:`);
  });

  it('is declared with a value the guard will accept as proof', () => {
    // checkStylesheet treats an empty resolved value as "missing".
    const declaration = new RegExp(`${sentinel()}:\\s*([^;}]*)`).exec(STYLESHEET);
    expect(declaration?.[1]?.trim()).toBeTruthy();
  });

  it('is declared on :root, which is the element the guard queries', () => {
    // checkStylesheet reads documentElement. Scoped to `body` or to a class it
    // would resolve to nothing there.
    expect(STYLESHEET).toMatch(new RegExp(`:root\\s*\\{[^}]*${sentinel()}:`, 's'));
  });

  it('vouches for the stylesheet the panel actually links', () => {
    // If the panel ever links something other than tailwind.css, the sentinel
    // is vouching for a file that is no longer on the page.
    expect(PANEL).toContain("'tailwind.css'");
  });
});
