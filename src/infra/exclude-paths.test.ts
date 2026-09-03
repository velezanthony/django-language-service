import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_EXCLUDE_SEGMENTS,
  TOOLING_EXCLUDE_SEGMENTS,
  ASSET_ROOT_SEGMENTS,
  STATIC_SEARCH_ROOTS,
  buildExcludeGlobs,
  excludesForStaticSearch,
  isExcludedPath,
  resolveExcludeSegments,
} from './exclude-paths';

// One source of truth for "directories we never look inside".
//
// It used to be two: the scanner's BASE_EXCLUDE (19 `**/x/**` globs) and the
// watcher's IGNORED_SEGMENTS (18 bare names). Same rule expressed twice, kept
// in sync by hand — the exact shape of the language-selector drift that lost
// django-txt. They are now derived from this list.

describe('DEFAULT_EXCLUDE_SEGMENTS', () => {
  it('covers the python and node dirs a Django workspace carries', () => {
    for (const seg of ['venv', 'site-packages', 'node_modules', '__pycache__', 'static', 'media']) {
      expect(DEFAULT_EXCLUDE_SEGMENTS).toContain(seg);
    }
  });

  it('includes the dot-directory wildcard instead of listing them one by one', () => {
    expect(DEFAULT_EXCLUDE_SEGMENTS).toContain('.*');
  });
});

describe('buildExcludeGlobs', () => {
  it('turns each segment into a recursive glob', () => {
    expect(buildExcludeGlobs(['venv', 'node_modules'])).toEqual([
      '**/venv/**',
      '**/node_modules/**',
    ]);
  });

  it('expands the dot wildcard into a glob the file services understand', () => {
    expect(buildExcludeGlobs(['.*'])).toEqual(['**/.*/**']);
  });

  it('supports multi-segment paths', () => {
    expect(buildExcludeGlobs(['templates/vendor'])).toEqual(['**/templates/vendor/**']);
  });

  it('keeps an extension-style segment working', () => {
    expect(buildExcludeGlobs(['*.egg-info'])).toEqual(['**/*.egg-info/**']);
  });
});

describe('isExcludedPath', () => {
  const segs = DEFAULT_EXCLUDE_SEGMENTS;

  const excluded = [
    '/w/.venv/lib/python3.12/site-packages/django/db/models.py',
    '/w/venv/lib/site-packages/rest_framework/views.py',
    '/w/node_modules/pkg/urls.py',
    '/w/shop/__pycache__/models.cpython-312.pyc',
    '/w/build/lib/shop/models.py',
    '/w/shop.egg-info/PKG-INFO',
    '/w/static/vendor/index.html',
    '/w/shop/media/uploads/x.html',
  ];
  it.each(excluded)('excludes %s', p => expect(isExcludedPath(p, segs)).toBe(true));

  // The dot wildcard is the whole point: these were never enumerated by hand
  // and would otherwise be scanned.
  const dotDirs = [
    '/w/.direnv/python-3.12/lib/models.py',
    '/w/.ruff_cache/x/models.py',
    '/w/.git/objects/models.py',
    '/w/.mypy_cache/3.12/models.py',
    '/w/.idea/models.py',
    // `.*` is a blanket rule on purpose: any directory starting with a dot,
    // however it is named, is tooling and not project source.
    '/w/.config-app/models.py',
  ];
  it.each(dotDirs)('excludes dot-directory %s', p => expect(isExcludedPath(p, segs)).toBe(true));

  const kept = [
    '/w/shop/models.py',
    '/w/shop/views/detail.py',
    '/w/shop/templates/shop/list.html',
    '/w/my.app/models.py', // a dot INSIDE the name is not a dot-dir
  ];
  it.each(kept)('keeps %s', p => expect(isExcludedPath(p, segs)).toBe(false));

  it('does not treat a dotfile as a dot-directory', () => {
    expect(isExcludedPath('/w/shop/.env.example', segs)).toBe(false);
  });

  it('normalises windows separators', () => {
    expect(isExcludedPath('C:\\w\\.venv\\lib\\models.py', segs)).toBe(true);
    expect(isExcludedPath('C:\\w\\shop\\models.py', segs)).toBe(false);
  });
});

describe('resolveExcludeSegments', () => {
  it('falls back to the defaults when the user configured nothing', () => {
    expect(resolveExcludeSegments(undefined)).toEqual([...DEFAULT_EXCLUDE_SEGMENTS]);
    expect(resolveExcludeSegments([])).toEqual([...DEFAULT_EXCLUDE_SEGMENTS]);
  });

  // The user's list replaces the ASSET ROOTS, which is the decision the setting
  // exists to make. Tooling segments are not up for negotiation — see the
  // describe below.
  it('uses the user list when provided', () => {
    expect(resolveExcludeSegments(['vendor', 'legacy'])).toEqual([
      ...TOOLING_EXCLUDE_SEGMENTS,
      'vendor',
      'legacy',
    ]);
  });

  it('drops the asset roots the user did not ask for', () => {
    expect(resolveExcludeSegments(['vendor'])).not.toContain('static');
    expect(resolveExcludeSegments(['vendor'])).not.toContain('media');
  });

  // A stray "" would produce `**//**` and swallow the whole workspace.
  it('drops blank entries and trims', () => {
    expect(resolveExcludeSegments([' vendor ', '', '   '])).toEqual([
      ...TOOLING_EXCLUDE_SEGMENTS,
      'vendor',
    ]);
  });
});

// `contributes.configuration` is the PUBLIC contract: with no user setting, the
// adapter is handed the manifest default, not the in-code one. Let them drift
// and the extension excludes a different set than this module claims to.
// Mirrors the same guard in domain/formatting/formatter.test.ts.
describe('DEFAULT_EXCLUDE_SEGMENTS — contract with the package.json manifest', () => {
  const manifest = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8'));
  const declared: string[] =
    manifest.contributes.configuration.properties['djangoLanguageService.excludePaths'].default;

  it('matches the manifest default exactly, in order', () => {
    expect(declared).toEqual([...DEFAULT_EXCLUDE_SEGMENTS]);
  });
});

// Two reasons to skip a directory, and they are not interchangeable:
// tooling dirs hold nothing anyone wants, while `static/` and `media/` are
// skipped by the SOURCE index yet are exactly where the asset search must look.
describe('tooling vs asset-root split', () => {
  it('composes the defaults from both halves, order preserved', () => {
    expect([...DEFAULT_EXCLUDE_SEGMENTS]).toEqual([
      ...TOOLING_EXCLUDE_SEGMENTS,
      ...ASSET_ROOT_SEGMENTS,
    ]);
  });

  it('keeps junk in tooling and content dirs in asset roots', () => {
    expect(TOOLING_EXCLUDE_SEGMENTS).toContain('node_modules');
    expect(TOOLING_EXCLUDE_SEGMENTS).toContain('.*');
    expect(TOOLING_EXCLUDE_SEGMENTS).not.toContain('static');
    expect(ASSET_ROOT_SEGMENTS).toEqual(['static', 'media']);
  });
});

describe('excludesForStaticSearch', () => {
  // Applying the full default list to the static search would exclude
  // `**/static/**` — the very tree it is searching — and return nothing.
  it('drops the roots the static search looks inside', () => {
    const out = excludesForStaticSearch([...DEFAULT_EXCLUDE_SEGMENTS]);
    for (const root of STATIC_SEARCH_ROOTS) expect(out).not.toContain(root);
  });

  it('keeps every tooling exclusion', () => {
    const out = excludesForStaticSearch([...DEFAULT_EXCLUDE_SEGMENTS]);
    for (const seg of TOOLING_EXCLUDE_SEGMENTS) expect(out).toContain(seg);
  });

  // The point of honouring the setting at all: a user's own entry survives.
  it('honours user entries that are not search roots', () => {
    const resolved = excludesForStaticSearch(['vendor', 'static']);
    expect(resolved).toContain('vendor');
    // `static` is a search root, so it is removed here even though the user
    // named it; the tooling segments stay, as everywhere else.
    expect(resolved).not.toContain('static');
    expect(resolved).toContain('node_modules');
  });

  it('normalises like every other consumer', () => {
    expect(excludesForStaticSearch([])).toContain('node_modules');
    expect(excludesForStaticSearch([''])).toContain('node_modules');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The user's list ADDS to the defaults; it does not replace them.
//
// `djangoLanguageService.excludePaths` swapped the defaults out entirely, so a
// `.vscode/settings.json` reading `["nothing"]` — which a workspace the user
// merely opened to look at can carry — put the scanner to work indexing `.git`,
// `node_modules` and `site-packages`. Neither the setting's description nor any
// reading of "exclude" suggests that setting one thing un-excludes twelve.
// ─────────────────────────────────────────────────────────────────────────────
describe('tooling exclusions are not up for negotiation', () => {
  it('keeps every tooling segment when the user adds one of their own', () => {
    const resolved = resolveExcludeSegments(['vendor']);
    expect(resolved).toContain('vendor');
    for (const preset of TOOLING_EXCLUDE_SEGMENTS) expect(resolved).toContain(preset);
  });

  // A workspace the user opened only to look at can carry a settings.json.
  it('cannot be talked out of skipping dot-directories or node_modules', () => {
    for (const hostile of [['nothing'], ['.'], [''], ['   '], ['a', 'b', 'c']]) {
      const resolved = resolveExcludeSegments(hostile);
      expect(resolved, JSON.stringify(hostile)).toContain('.*');
      expect(resolved, JSON.stringify(hostile)).toContain('node_modules');
      expect(resolved, JSON.stringify(hostile)).toContain('site-packages');
    }
  });

  it('still drops blank entries, which would build a glob that swallows everything', () => {
    expect(resolveExcludeSegments(['', '  ', 'vendor'])).not.toContain('');
  });

  it('lists each segment once', () => {
    const resolved = resolveExcludeSegments(['.git', 'vendor', 'vendor']);
    expect(resolved).toHaveLength(new Set(resolved).size);
  });
});
