import { describe, it, expect } from 'vitest';
import { buildWatchGlobs, isWatchablePath } from './watch-globs';
import { INCLUDE_PATTERNS } from './scanner';

// The watcher used to listen on `**/*.py` and `**/*.{html,txt}`. Every write
// inside an in-workspace .venv or site-packages therefore woke the debouncer
// and triggered a FULL rescan. These tests pin the watcher to exactly the set
// of files the scanner indexes.

describe('buildWatchGlobs', () => {
  const globs = buildWatchGlobs();

  it('never watches every python file in the workspace', () => {
    expect(globs).not.toContain('**/*.py');
    expect(globs).not.toContain('**/*.{html,txt}');
  });

  it('covers every scanner include pattern', () => {
    for (const pattern of INCLUDE_PATTERNS) {
      const covered = globs.some(g => g === pattern || isWatchablePath(samplePathFor(pattern)));
      expect(covered, `no watch glob covers ${pattern}`).toBe(true);
    }
  });
});

/** A concrete path that the given scanner glob would match. */
function samplePathFor(pattern: string): string {
  return `/w/app/${pattern.replace('**/', '').replace('**/*', 'x').replace('*.py', 'x.py').replace('*.html', 'x.html').replace('*.txt', 'x.txt')}`;
}

describe('isWatchablePath', () => {
  const watched = [
    '/w/shop/models.py',
    '/w/shop/views.py',
    '/w/shop/forms.py',
    '/w/shop/urls.py',
    '/w/shop/helpers.py',
    '/w/shop/views/detail.py',
    '/w/shop/views/api/v2.py',
    '/w/shop/migrations/0001_initial.py',
    '/w/shop/templates/shop/list.html',
    '/w/shop/templates/email/welcome.txt',
    '/w/templates/base.html',
  ];

  it.each(watched)('watches %s', path => {
    expect(isWatchablePath(path)).toBe(true);
  });

  // The whole point: these are the paths that used to trigger a full rescan.
  const ignored = [
    '/w/.venv/lib/python3.12/site-packages/django/db/models.py',
    '/w/venv/lib/python3.12/site-packages/rest_framework/views.py',
    '/w/node_modules/some-pkg/urls.py',
    '/w/shop/__pycache__/models.cpython-312.pyc',
    '/w/shop/tests.py',
    '/w/manage.py',
    '/w/shop/admin.py',
    '/w/static/vendor/index.html',
    '/w/README.txt',
    '/w/shop/static/shop/app.html',
  ];

  it.each(ignored)('ignores %s', path => {
    expect(isWatchablePath(path)).toBe(false);
  });

  it('treats windows separators the same as posix', () => {
    expect(isWatchablePath('C:\\w\\shop\\models.py')).toBe(true);
    expect(isWatchablePath('C:\\w\\.venv\\lib\\site-packages\\django\\db\\models.py')).toBe(false);
  });
});

// The watcher receives `djangoLanguageService.excludePaths` straight from the
// composition root, and the Scanner puts the same value through
// `resolveExcludeSegments`. Both must agree, or the two halves of the extension
// disagree about what exists — the exact drift that lost django-txt.
//
// A default parameter only fires on `undefined`, so `[]` used to sail past it.
describe('isWatchablePath — normalises its segment list like the scanner does', () => {
  const venv = '/w/.venv/lib/python3.12/site-packages/django/db/models.py';
  const source = '/w/shop/models.py';

  it('treats an explicitly empty list as "use the defaults"', () => {
    expect(isWatchablePath(venv, [])).toBe(false);
    expect(isWatchablePath(source, [])).toBe(true);
  });

  // A blank entry matched the leading '' that `split('/')` yields for every
  // absolute path, so it excluded the entire workspace and killed the watcher.
  it('drops blank entries instead of excluding the whole workspace', () => {
    expect(isWatchablePath(source, [''])).toBe(true);
    expect(isWatchablePath(source, ['vendor', '   '])).toBe(true);
    expect(isWatchablePath('/w/vendor/models.py', ['vendor', ''])).toBe(false);
  });

  it('trims entries before matching', () => {
    expect(isWatchablePath('/w/vendor/models.py', [' vendor '])).toBe(false);
  });

  it('still honours a real user list', () => {
    expect(isWatchablePath('/w/legacy/models.py', ['legacy'])).toBe(false);
    expect(isWatchablePath(source, ['legacy'])).toBe(true);
  });
});
