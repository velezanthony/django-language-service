import { describe, it, expect } from 'vitest';
import { buildStaticSearchGlob, stripStaticPrefix } from './static-paths';

// What lands in `{% static "…" %}` is resolved by Django against the static
// dirs, so the inserted text must be relative to whichever root it was found
// under. Getting this wrong produces a path that 404s at runtime.
describe('stripStaticPrefix', () => {
  it.each([
    ['shop/static/css/app.css', 'css/app.css'],
    ['assets/static/js/x.js', 'js/x.js'],
    ['static/img/logo.svg', 'img/logo.svg'],
    ['deep/nested/app/static/shop/theme.css', 'shop/theme.css'],
  ])('strips a static/ root: %s', (input, expected) => {
    expect(stripStaticPrefix(input)).toBe(expected);
  });

  // `indexOf('static/')` never matched this: "staticfiles/" starts with
  // "staticf", not "static/". The path was inserted verbatim.
  it.each([
    ['staticfiles/css/app.css', 'css/app.css'],
    ['build/staticfiles/js/bundle.js', 'js/bundle.js'],
  ])('strips a staticfiles/ root: %s', (input, expected) => {
    expect(stripStaticPrefix(input)).toBe(expected);
  });

  it('matches whole segments only, never a prefix of a longer name', () => {
    expect(stripStaticPrefix('shop/statics/app.css')).toBe('shop/statics/app.css');
    expect(stripStaticPrefix('shop/static_extra/app.css')).toBe('shop/static_extra/app.css');
  });

  it('strips at the first root when several are nested', () => {
    expect(stripStaticPrefix('static/vendor/static/x.css')).toBe('vendor/static/x.css');
  });

  it('leaves a path with no root untouched', () => {
    expect(stripStaticPrefix('shop/css/app.css')).toBe('shop/css/app.css');
  });

  // A double underscore is not a reason to hide a file. `__pycache__` is
  // handled by the exclude list, not by a substring match on the whole path.
  it('keeps names containing a double underscore', () => {
    expect(stripStaticPrefix('shop/static/my__theme.css')).toBe('my__theme.css');
    expect(stripStaticPrefix('shop/static/vendor__v2/x.css')).toBe('vendor__v2/x.css');
  });
});

describe('buildStaticSearchGlob', () => {
  it('searches every declared static root', () => {
    expect(buildStaticSearchGlob()).toBe('{**/static,**/staticfiles}/**/*');
  });
});
