import { describe, it, expect } from 'vitest';
import { resolveColumnSpan } from './diagnostic-range';

const at = (lineText: string, variable: string, col: number, root = variable.split('.')[0]!) =>
  resolveColumnSpan(lineText, { variable, root, col });

describe('resolveColumnSpan', () => {
  it('spans the variable at the reported column', () => {
    expect(at('{{ nope }}', 'nope', 4)).toEqual({ start: 3, end: 7 });
  });

  // The bug: searching the line finds the FIRST match, so both diagnostics
  // squiggled the first reference and the second was left unmarked.
  it('marks the second reference, not the first one twice', () => {
    const line = '{{ nope }} and {{ nope }}';
    expect(at(line, 'nope', 4)).toEqual({ start: 3, end: 7 });
    expect(at(line, 'nope', 19)).toEqual({ start: 18, end: 22 });
  });

  it('spans the whole dotted chain', () => {
    expect(at('{{ product.nme }}', 'product.nme', 4)).toEqual({ start: 3, end: 14 });
  });

  it('falls back to the root when only the root is at that column', () => {
    // The chain continues on the next line; only `product` sits here.
    expect(at('{{ product', 'product.nme', 4)).toEqual({ start: 3, end: 10 });
  });

  it('falls back to searching when the column does not line up', () => {
    expect(at('   {{ nope }}', 'nope', 1)).toEqual({ start: 6, end: 10 });
  });

  it('never produces a negative start', () => {
    const span = at('{{ nope }}', 'nope', 0);
    expect(span.start).toBeGreaterThanOrEqual(0);
  });

  it('survives a variable holding regex metacharacters', () => {
    const span = at('{{ a.b }}', 'a.b', 99);
    expect(span.start).toBeGreaterThanOrEqual(0);
    expect(span.end).toBeGreaterThan(span.start);
  });
});
