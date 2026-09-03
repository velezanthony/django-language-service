import { describe, it, expect } from 'vitest';
import { appLabelFromPath, viewKey } from './view-key';

describe('appLabelFromPath', () => {
  it('returns the directory immediately before the file', () => {
    expect(appLabelFromPath('/workspace/blog/views.py')).toBe('blog');
  });

  it('returns unknown for a bare filename', () => {
    expect(appLabelFromPath('views.py')).toBe('unknown');
  });
});

describe('viewKey', () => {
  it('builds the qualified app.name key the scanner indexes by', () => {
    expect(viewKey({ filePath: '/workspace/blog/views.py', name: 'post_list' })).toBe(
      'blog.post_list',
    );
  });

  it('disambiguates same-named views across apps', () => {
    const a = viewKey({ filePath: '/ws/blog/views.py', name: 'index' });
    const b = viewKey({ filePath: '/ws/shop/views.py', name: 'index' });
    expect(a).not.toBe(b);
  });
});

// Splitting a big app's views into a PACKAGE is ordinary Django. The label came
// from the directory immediately above the file, so `apps/shop/views/orders.py`
// gave `views` — and since the view index is keyed '<app>.<name>', two apps
// that both split their views collided on `views.index` and one of the views
// was DROPPED from the project entirely.
describe('appLabelFromPath with app sub-packages', () => {
  it.each([
    ['apps/shop/views.py', 'shop'],
    ['apps/shop/views/orders.py', 'shop'],
    ['apps/shop/views/admin/orders.py', 'shop'],
    ['apps/shop/models/base.py', 'shop'],
    ['apps/shop/migrations/0001_initial.py', 'shop'],
    ['apps/shop/templates/shop/card.html', 'shop'],
    ['apps/shop/templatetags/shop_tags.py', 'shop'],
  ])('%s -> %s', (path, expected) => {
    expect(appLabelFromPath(path)).toBe(expected);
  });

  // An app is as likely to be CALLED api as to have one, so that word is not
  // in the list and the directory itself wins.
  it('does not rename an app that happens to be called api', () => {
    expect(appLabelFromPath('apps/api/views.py')).toBe('api');
  });

  it('keeps two apps that both split their views apart', () => {
    expect(viewKey({ filePath: 'apps/shop/views/orders.py', name: 'index' })).toBe('shop.index');
    expect(viewKey({ filePath: 'apps/blog/views/posts.py', name: 'index' })).toBe('blog.index');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The absolute paths production actually gets.
//
// Every test above this block passes a RELATIVE path. `fs.glob` hands the
// scanner ABSOLUTE ones, and the rule "the segment before the first Django
// sub-package directory" then reads the wrong end of the string: any
// `management/`, `templates/`, `tests/`, `views/`, `models/` or `forms/`
// ANYWHERE above the workspace — in a home directory, a mount point, a CI
// checkout path — wins over the app. `/home/dev/management/backend/apps/shop/
// views.py` gave `dev`, and since the index is keyed '<app>.<name>', two apps
// with a `def index` collided and one view was dropped from the project.
//
// This is the same defect f39654c fixed, arriving by another door, and it
// survived because the tests never used the shape production uses. So the rule
// is now stated over the path BELOW the workspace root, and the root is passed
// in rather than guessed.
// ─────────────────────────────────────────────────────────────────────────────
describe('appLabelFromPath below a workspace root', () => {
  it.each([
    ['/home/dev/management/backend', '/home/dev/management/backend/apps/shop/views.py', 'shop'],
    ['/home/dev/templates/site', '/home/dev/templates/site/apps/shop/views/orders.py', 'shop'],
    ['/srv/models/www', '/srv/models/www/apps/shop/models/base.py', 'shop'],
    ['/ci/tests/42', '/ci/tests/42/apps/shop/views/admin/orders.py', 'shop'],
    ['/home/forms/x', '/home/forms/x/shop/views.py', 'shop'],
    ['/w', '/w/apps/api/views.py', 'api'],
    ['/w', '/w/apps/shop/management/commands/seed.py', 'shop'],
  ])('root %s: %s -> %s', (root, path, expected) => {
    expect(appLabelFromPath(path, [root])).toBe(expected);
  });

  it('picks the root that actually contains the file, not the first one given', () => {
    const roots = ['/other/place', '/home/dev/management/backend'];
    expect(appLabelFromPath('/home/dev/management/backend/apps/shop/views.py', roots)).toBe('shop');
  });

  it('falls back to the whole path when the file is under none of the roots', () => {
    expect(appLabelFromPath('/elsewhere/shop/views.py', ['/w'])).toBe('shop');
  });

  it('is unchanged when no roots are given', () => {
    expect(appLabelFromPath('apps/shop/views/orders.py')).toBe('shop');
    expect(appLabelFromPath('views.py')).toBe('unknown');
  });

  // The general rule: whatever sits above the workspace cannot change the answer.
  it('gives the same label whatever the workspace is nested inside', () => {
    const inside = 'apps/shop/views/orders.py';
    const prefixes = [
      '/w',
      '/home/dev/management/backend',
      '/srv/templates/x',
      '/a/tests/b',
      '/models/y',
      '/z/forms',
      '/mnt/migrations/c',
      '/x/templatetags/d',
    ];
    for (const root of prefixes) {
      expect(appLabelFromPath(`${root}/${inside}`, [root]), `root ${root}`).toBe('shop');
    }
  });
});
