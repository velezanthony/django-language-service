/**
 * Two readers each grew their own "strip up to templates/" rule and each picked
 * a different segment. They are still allowed to differ — an absolute path can
 * carry a templates/ segment from the user's home directory that a relative one
 * cannot — but the enumeration is shared, so the difference is a choice made at
 * the call site rather than an accident.
 */
import { describe, it, expect } from 'vitest';
import { templateLoadPaths, innermostLoadPath } from './template-load-path';

describe('templateLoadPaths', () => {
  it('strips an app template root', () => {
    expect(templateLoadPaths('apps/shop/templates/shop/card.html')).toEqual(['shop/card.html']);
  });

  it('strips a project root', () => {
    expect(templateLoadPaths('templates/base/base.html')).toEqual(['base/base.html']);
  });

  it('offers every root when templates/ nests', () => {
    expect(templateLoadPaths('apps/a/templates/a/templates/email.html')).toEqual([
      'a/templates/email.html',
      'email.html',
    ]);
  });

  it('normalises Windows separators', () => {
    expect(templateLoadPaths('C:\\ws\\apps\\shop\\templates\\shop\\card.html')).toEqual([
      'shop/card.html',
    ]);
  });

  it('gives nothing when the file is not under a template root', () => {
    expect(templateLoadPaths('apps/shop/views.py')).toEqual([]);
  });

  // `my-templates/` is a directory name, not a root.
  it('only counts a whole path segment', () => {
    expect(templateLoadPaths('/ws/my-templates/x.html')).toEqual([]);
  });

  it('handles the root sitting first', () => {
    expect(templateLoadPaths('templates/x.html')).toEqual(['x.html']);
  });
});

describe('innermostLoadPath', () => {
  it('is the plain answer when there is one root', () => {
    expect(innermostLoadPath('/ws/apps/shop/templates/shop/card.html')).toBe('shop/card.html');
  });

  // An absolute path can carry a templates/ segment from outside the project.
  it('ignores a templates/ directory above the project', () => {
    expect(innermostLoadPath('/home/me/templates/work/shop/templates/shop/x.html')).toBe(
      'shop/x.html',
    );
  });

  it('is null when there is no root', () => {
    expect(innermostLoadPath('/ws/apps/shop/views.py')).toBeNull();
  });
});
