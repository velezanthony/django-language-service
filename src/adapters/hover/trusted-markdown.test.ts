/**
 * A contract over the source, not over behaviour — because the defect it
 * guards is invisible from the outside.
 *
 * `MarkdownString.isTrusted = true` unlocks `command:` links in rendered
 * markdown. Every hover here interpolates text that comes out of the user's
 * workspace: a relative path, a view name read from `urls.py`, a `db_comment`
 * or a choice label read from `models.py`. None of them emits a command URI,
 * so the flag bought nothing and only made that text executable — in Restricted
 * Mode too, since the manifest declares `untrustedWorkspaces.supported`.
 *
 * The webview shows the shape to use when a command link IS wanted:
 * `enableCommandUris: [cmdId('showLog'), cmdId('refreshViewContext')]` — an
 * allowlist, in panel.ts. A bare `true` is never that.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const HOVER_DIR = join(__dirname);

const sources = readdirSync(HOVER_DIR)
  .filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'))
  .map(f => [f, readFileSync(join(HOVER_DIR, f), 'utf8')] as const);

describe('hover markdown is never blanket-trusted', () => {
  it('finds the hover providers at all', () => {
    expect(sources.map(([f]) => f).sort()).toEqual([
      'dtl-docs.ts',
      'model-field.ts',
      'template-paths.ts',
      'url-names.ts',
    ]);
  });

  it.each(sources)('%s does not set isTrusted = true', (_file, src) => {
    expect(src).not.toMatch(/isTrusted\s*=\s*true/);
  });

  // If a hover ever does need a command link, it must arrive as an allowlist.
  it.each(sources)('%s emits no command: URI', (_file, src) => {
    expect(src).not.toMatch(/command:/);
  });
});
