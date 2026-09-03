import { describe, it, expect } from 'vitest';
import { splitGlobBase, joinExcludes } from './glob-translate';

// `FileSystem.glob` receives absolute patterns (`${root}/${pattern}`) because
// fast-glob wants them that way. `vscode.workspace.findFiles` instead wants a
// RelativePattern: a base directory plus a relative glob. These helpers do that
// translation, and they are pure so the conversion is pinned by tests rather
// than discovered in a devcontainer.

describe('splitGlobBase', () => {
  it('splits an absolute scanner pattern into base and relative glob', () => {
    expect(splitGlobBase('/w/project/**/models.py')).toEqual({
      base: '/w/project',
      pattern: '**/models.py',
    });
  });

  it('handles the nested template pattern', () => {
    expect(splitGlobBase('/w/project/**/templates/**/*.html')).toEqual({
      base: '/w/project',
      pattern: '**/templates/**/*.html',
    });
  });

  it('splits at the FIRST wildcard, not the last', () => {
    expect(splitGlobBase('/w/a/**/views/**/*.py')).toEqual({
      base: '/w/a',
      pattern: '**/views/**/*.py',
    });
  });

  it('handles a single-star segment', () => {
    expect(splitGlobBase('/w/project/**/migrations/*.py')).toEqual({
      base: '/w/project',
      pattern: '**/migrations/*.py',
    });
  });

  it('normalises windows separators', () => {
    expect(splitGlobBase('C:\\w\\project\\**\\models.py')).toEqual({
      base: 'C:/w/project',
      pattern: '**/models.py',
    });
  });

  it('returns the whole path as base when there is no wildcard', () => {
    expect(splitGlobBase('/w/project/models.py')).toEqual({
      base: '/w/project',
      pattern: 'models.py',
    });
  });

  it('keeps a trailing-slash-free base', () => {
    expect(splitGlobBase('/w/project/**/*.txt').base).not.toMatch(/\/$/);
  });
});

describe('joinExcludes', () => {
  it('wraps several excludes into one brace alternation', () => {
    expect(joinExcludes(['**/venv/**', '**/node_modules/**'])).toBe(
      '{**/venv/**,**/node_modules/**}',
    );
  });

  it('returns a bare pattern when there is only one', () => {
    expect(joinExcludes(['**/venv/**'])).toBe('**/venv/**');
  });

  // An empty `{}` alternation matches nothing useful and VS Code treats a
  // null exclude as "apply the user's files.exclude", which is what we want.
  it('returns undefined for an empty list', () => {
    expect(joinExcludes([])).toBeUndefined();
  });
});
