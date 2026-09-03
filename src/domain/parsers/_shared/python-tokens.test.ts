/**
 * python-tokens — the small readers every Python parser in this project shares.
 *
 * This module had no test file. Two of its functions were reading Python the
 * way a regex reads it rather than the way Python means it, and both defects
 * reached the user as WARNINGS on correct code.
 */
import { describe, it, expect } from 'vitest';
import { extractBracketed, extractDictKeys } from './python-tokens';

// ─────────────────────────────────────────────────────────────────────────────
// A key of a nested dict is not a key of the outer one.
//
// `extractDictKeys` ran one global regex over the whole body, so
// `{'filters': {'status': s, 'q': q}}` published `filters`, `status` AND `q` as
// context variables. It lies in both directions: completion offers `status`,
// which does not exist in the template, and a real `{{ status }}` typo is not
// reported because the name is "known".
// ─────────────────────────────────────────────────────────────────────────────
describe('extractDictKeys reads one level', () => {
  it('reads a flat dict', () => {
    expect(extractDictKeys(`'name': value, 'email': other`)).toEqual(['name', 'email']);
  });

  it('does not publish the keys of a nested dict', () => {
    expect(extractDictKeys(`'filters': {'status': s, 'q': q}, 'page': p`)).toEqual([
      'filters',
      'page',
    ]);
  });

  it('does not publish keys from a nested list of dicts', () => {
    expect(extractDictKeys(`'rows': [{'id': 1}, {'id': 2}], 'total': n`)).toEqual([
      'rows',
      'total',
    ]);
  });

  it('does not publish keys from a dict passed to a call', () => {
    expect(extractDictKeys(`'form': Form(initial={'name': 'x'}), 'ok': True`)).toEqual([
      'form',
      'ok',
    ]);
  });

  it('is not fooled by a colon inside a value', () => {
    expect(extractDictKeys(`'url': 'http://example.com/x', 'ok': True`)).toEqual(['url', 'ok']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A brace inside a string literal is not a brace.
//
// `extractBracketed` counted every opener and closer it saw, including the ones
// inside quotes. A perfectly ordinary `context = {'tpl': '{{ x }}', 'ok': True}`
// closed early, so every key after it disappeared — and because the result was
// not marked unresolved, the missing names were reported as hard WARNINGS. The
// failure accused the author of a mistake that was ours. This module already
// exports `stripStringLiterals`.
// ─────────────────────────────────────────────────────────────────────────────
describe('extractBracketed ignores braces inside strings', () => {
  const bracketedFrom = (source: string) => extractBracketed(source, source.indexOf('{'), '{', '}');

  it('reads a dict whose value holds a closing brace', () => {
    const source = `context = {'tpl': '}', 'ok': True}`;
    expect(bracketedFrom(source)).toBe(`'tpl': '}', 'ok': True`);
  });

  it('reads a dict whose value holds an opening brace', () => {
    const source = `context = {'tpl': '{{ x }}', 'ok': True}`;
    expect(bracketedFrom(source)).toBe(`'tpl': '{{ x }}', 'ok': True`);
  });

  it('reads a dict whose value holds a quote of the other kind', () => {
    const source = `context = {'tpl': "it's {", 'ok': True}`;
    expect(bracketedFrom(source)).toBe(`'tpl': "it's {", 'ok': True`);
  });

  it('still reads an ordinary nested dict', () => {
    const source = `context = {'a': {'b': 1}, 'c': 2}`;
    expect(bracketedFrom(source)).toBe(`'a': {'b': 1}, 'c': 2`);
  });

  it('still returns null when the brace is never closed', () => {
    expect(bracketedFrom(`context = {'a': 1`)).toBeNull();
  });

  it('keeps every key of a dict whose value holds a brace', () => {
    const source = `context = {'tpl': '{{ x }}', 'ok': True, 'n': 1}`;
    expect(extractDictKeys(bracketedFrom(source) ?? '')).toEqual(['tpl', 'ok', 'n']);
  });
});
