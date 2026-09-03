import { describe, it, expect } from 'vitest';
import { highlightPython } from './python-highlight';

const kinds = (src: string) => highlightPython(src).map(t => `${t.kind}:${t.text}`);
const roundTrip = (src: string) =>
  highlightPython(src)
    .map(t => t.text)
    .join('');

describe('highlightPython', () => {
  // The one property that must never break: colouring may be wrong, losing
  // characters may not.
  it('always reproduces the input exactly', () => {
    for (const src of [
      '@property\ndef x(self):\n    return 1',
      '# just a comment',
      'a = "str" # trailing',
      '',
      'x = f"{self.a} ({self.b})"',
      '"""doc\nspanning lines"""\nx = 1',
    ]) {
      expect(roundTrip(src), src).toBe(src);
    }
  });

  it('marks the decorator', () => {
    expect(kinds('@property')).toEqual(['decorator:@property']);
  });

  it('marks keywords and the defined name', () => {
    expect(kinds('def x(self):')).toEqual([
      'keyword:def',
      'plain: ',
      'function:x',
      'plain:(',
      'keyword:self',
      'plain:):',
    ]);
  });

  it('marks a comment to end of line', () => {
    expect(kinds('a = 1  # why\nb = 2')).toContain('comment:# why');
  });

  // The docstring in every real property.
  it('keeps a triple-quoted string as one token', () => {
    expect(kinds('"""Falls back."""')).toEqual(['string:"""Falls back."""']);
  });

  it('handles a triple-quoted string across lines', () => {
    expect(kinds('"""a\nb"""')).toEqual(['string:"""a\nb"""']);
  });

  it('does not end a string on an escaped quote', () => {
    expect(kinds('x = "a\\"b"')).toContain('string:"a\\"b"');
  });

  it('marks numbers and literals', () => {
    expect(kinds('x = 42')).toContain('number:42');
    expect(kinds('x = None')).toContain('literal:None');
    expect(kinds('x = True')).toContain('literal:True');
  });

  // Plain runs are merged, so assert on what matters: no keyword token at all.
  it('does not colour a keyword inside an identifier', () => {
    expect(highlightPython('define = 1').some(t => t.kind === 'keyword')).toBe(false);
    expect(highlightPython('self_x = 1').some(t => t.kind === 'keyword')).toBe(false);
    // …but the real keyword still is one.
    expect(highlightPython('def x():').some(t => t.kind === 'keyword')).toBe(true);
  });

  it('does not colour a # inside a string', () => {
    expect(kinds('x = "not # a comment"')).toContain('string:"not # a comment"');
  });

  it('returns nothing for empty input', () => {
    expect(highlightPython('')).toEqual([]);
  });
});
