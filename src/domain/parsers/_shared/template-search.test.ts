/**
 * Four adapters each carried this list and two of them disagreed, so
 * go-to-definition opened one file while block completion read its blocks out
 * of another — on the same {% extends %}, with nothing said about it.
 */
import { describe, it, expect } from 'vitest';
import { templateSearchGlobs } from './template-search';

describe('templateSearchGlobs', () => {
  it('looks in a project root before an app one', () => {
    expect(templateSearchGlobs('base.html')).toEqual([
      'templates/base.html',
      '**/templates/base.html',
      '**/base.html',
      '**/jinja2/base.html',
    ]);
  });

  // This branch was missing from the block-name copy, so `{% extends
  // "templates/base.html" %}` resolved for three features and not the fourth.
  it('handles a path the author wrote WITH the prefix', () => {
    expect(templateSearchGlobs('templates/base.html')[0]).toBe('**/templates/base.html');
  });

  it('keeps the app-qualified form intact', () => {
    expect(templateSearchGlobs('shop/card.html')).toContain('**/templates/shop/card.html');
  });

  it('offers jinja2 last', () => {
    expect(templateSearchGlobs('x.html').at(-1)).toBe('**/jinja2/x.html');
  });

  it('is the same list whoever asks', () => {
    expect(templateSearchGlobs('a/b.html')).toEqual(templateSearchGlobs('a/b.html'));
  });

  it('does not choke on an empty path', () => {
    expect(templateSearchGlobs('')).toHaveLength(4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The ordered list has no repeats.
//
// A path already written with the prefix — `{% extends "templates/base.html" %}`
// — produced `**/templates/base.html` twice: once from the "written with the
// prefix" branch and once from the bare `**/<path>` fallback. Every caller runs
// one `findFiles` per glob, so the duplicate was a second workspace-wide search
// for a result already in hand.
// ─────────────────────────────────────────────────────────────────────────────
describe('templateSearchGlobs is a set, in order', () => {
  it.each([
    'base.html',
    'templates/base.html',
    'shop/card.html',
    'templates/shop/card.html',
    'templates/templates/x.html',
  ])('no glob repeats for %s', path => {
    const globs = templateSearchGlobs(path);
    expect(globs).toEqual([...new Set(globs)]);
  });

  it('keeps the most specific reading first', () => {
    expect(templateSearchGlobs('templates/base.html')[0]).toBe('**/templates/base.html');
  });

  it('still offers every distinct root', () => {
    const globs = templateSearchGlobs('shop/card.html');
    expect(globs).toContain('templates/shop/card.html');
    expect(globs).toContain('**/templates/shop/card.html');
    expect(globs).toContain('**/shop/card.html');
    expect(globs).toContain('**/jinja2/shop/card.html');
  });
});
