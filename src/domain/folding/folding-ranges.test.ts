import { describe, it, expect } from 'vitest';
import { getFoldingRanges, FoldingRangeKind } from './folding-ranges';

describe('getFoldingRanges', () => {
  it('returns a Region range for {% block %}...{% endblock %}', () => {
    const lines = ['{% block content %}', '  <p>hello</p>', '{% endblock %}'];
    const ranges = getFoldingRanges(lines);
    expect(ranges).toHaveLength(1);
    expect(ranges[0]).toMatchObject({ start: 0, end: 1, kind: FoldingRangeKind.Region });
  });

  it('returns a Comment range for multi-line <!-- comment -->', () => {
    const lines = ['<!-- start', '  some content', 'end -->'];
    const ranges = getFoldingRanges(lines);
    expect(ranges).toHaveLength(1);
    expect(ranges[0]).toMatchObject({ start: 0, end: 2, kind: FoldingRangeKind.Comment });
  });

  it('handles nested {% if %}...{% endif %} blocks', () => {
    const lines = [
      '{% if x %}',
      '  {% if y %}',
      '    <p>inner</p>',
      '  {% endif %}',
      '{% endif %}',
    ];
    const ranges = getFoldingRanges(lines);
    expect(ranges.length).toBe(2);
    const sorted = [...ranges].sort((a, b) => a.start - b.start);
    expect(sorted[0]).toMatchObject({ start: 0, end: 3, kind: FoldingRangeKind.Region });
    expect(sorted[1]).toMatchObject({ start: 1, end: 2, kind: FoldingRangeKind.Region });
  });

  it('returns empty array for document with no foldable regions', () => {
    const lines = ['<p>hello</p>', '<p>world</p>'];
    const ranges = getFoldingRanges(lines);
    expect(ranges).toHaveLength(0);
  });

  it('does not create a range for opener/closer on adjacent lines (nothing to fold)', () => {
    const lines = ['{% block a %}', '{% endblock %}'];
    const ranges = getFoldingRanges(lines);
    // end - opener = 1, not > opener+1, so no range expected
    expect(ranges).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Folding a document costs one pass, not one per comment.
//
// `offsetToLine` counted newlines from offset zero, and it was called twice per
// HTML comment. A page of 500 comments took 19 ms, 2000 took 290 ms, and 8000 —
// a 192 KB document, which a generated page reaches easily — took 5.2 s, on the
// extension host, while the author waited to fold a region. `offsetMapper` in
// parsers/_shared builds the line table once and binary-searches it, and three
// parsers were already using it.
// ─────────────────────────────────────────────────────────────────────────────
describe('folding scales with the document, not with the square of it', () => {
  const withComments = (count: number): string[] => {
    const lines: string[] = [];
    for (let i = 0; i < count; i++) {
      lines.push(`<!-- comment ${i}`, `  body ${i}`, `  more ${i} -->`);
    }
    return lines;
  };

  it('folds a document with 8000 comments well inside a second', () => {
    const lines = withComments(8000);
    const started = performance.now();
    getFoldingRanges(lines);
    expect(performance.now() - started).toBeLessThan(500);
  });

  it('quadrupling the comment count does not multiply the cost by sixteen', () => {
    const cost = (count: number) => {
      const lines = withComments(count);
      const started = performance.now();
      getFoldingRanges(lines);
      return performance.now() - started;
    };
    const small = Math.max(cost(1000), 0.5);
    expect(cost(4000) / small).toBeLessThan(8);
  });

  it('still reports the ranges it found', () => {
    const ranges = getFoldingRanges(withComments(3));
    const comments = ranges.filter(r => r.kind === FoldingRangeKind.Comment);
    expect(comments).toHaveLength(3);
    expect(comments[0]).toEqual({ start: 0, end: 2, kind: FoldingRangeKind.Comment });
    expect(comments[1]).toEqual({ start: 3, end: 5, kind: FoldingRangeKind.Comment });
  });
});
