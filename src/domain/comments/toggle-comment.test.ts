import { describe, it, expect } from 'vitest';
import { toggleDtlComment } from './toggle-comment';

describe('toggleDtlComment — inline (single line)', () => {
  it('wraps a plain line in {# ... #}', () => {
    const lines = ['    <p>hello</p>'];
    const result = toggleDtlComment(lines, { startLine: 0, startCol: 0, endLine: 0, endCol: 16 });
    expect(result.op).toBe('replace-lines');
    expect(result.replacements?.[0]?.newText).toContain('{# <p>hello</p> #}');
  });

  it('unwraps an already-commented line', () => {
    const lines = ['{# <p>hello</p> #}'];
    const result = toggleDtlComment(lines, { startLine: 0, startCol: 0, endLine: 0, endCol: 18 });
    expect(result.op).toBe('replace-lines');
    expect(result.replacements?.[0]?.newText).toBe('<p>hello</p>');
  });

  it('preserves leading whitespace when wrapping', () => {
    const lines = ['    content'];
    const result = toggleDtlComment(lines, { startLine: 0, startCol: 4, endLine: 0, endCol: 11 });
    expect(result.replacements?.[0]?.newText).toMatch(/^\s+\{#/);
  });

  // These two guard the PAIRWISE unwrap — a naive slice(2, -2) would rip only
  // the outer delimiters and leave `a #} texto {# b`. Their inputs used to
  // carry live text between the comments, which also made them assert that
  // such a line counts as commented; it does not, and treating it as one
  // revealed text the author had hidden. See the describe below.
  it('uncomments a line with TWO inline comments without corrupting it', () => {
    const lines = ['{# a #} {# b #}'];
    const result = toggleDtlComment(lines, { startLine: 0, startCol: 0, endLine: 0, endCol: 15 });
    expect(result.op).toBe('replace-lines');
    expect(result.replacements?.[0]?.newText).toBe('a b');
  });

  it('uncomments multiple inline comments preserving leading whitespace', () => {
    const lines = ['    {# uno #} {# dos #}'];
    const result = toggleDtlComment(lines, { startLine: 0, startCol: 0, endLine: 0, endCol: 23 });
    expect(result.replacements?.[0]?.newText).toBe('    uno dos');
  });

  it('round-trip: wrap then unwrap returns the original line', () => {
    const original = '    <p>hello</p>';
    const wrapped = toggleDtlComment([original], {
      startLine: 0,
      startCol: 0,
      endLine: 0,
      endCol: 16,
    });
    const wrappedLine = wrapped.replacements?.[0]?.newText ?? '';
    const unwrapped = toggleDtlComment([wrappedLine], {
      startLine: 0,
      startCol: 0,
      endLine: 0,
      endCol: wrappedLine.length,
    });
    expect(unwrapped.replacements?.[0]?.newText).toBe(original);
  });
});

describe('toggleDtlComment — block (multi-line)', () => {
  it('inserts {% comment %} before and {% endcomment %} after selection', () => {
    const lines = ['<p>line 1</p>', '<p>line 2</p>'];
    const result = toggleDtlComment(lines, { startLine: 0, startCol: 0, endLine: 1, endCol: 13 });
    expect(result.op).toBe('insert-before-after');
    expect(result.insertBeforeText).toContain('{% comment %}');
    expect(result.insertAfterText).toContain('{% endcomment %}');
  });

  it('removes existing block comment wrappers', () => {
    const lines = ['{% comment %}', '<p>content</p>', '{% endcomment %}'];
    const result = toggleDtlComment(lines, { startLine: 0, startCol: 0, endLine: 2, endCol: 16 });
    expect(result.op).toBe('delete-lines');
    expect(result.deleteLines).toEqual([0, 2]);
  });
});

// Django ends a `{# … #}` at the FIRST `#}` it meets. Wrapping a line that
// already holds one produced `{# <p>x</p>{# nota #} #}`, where everything after
// the inner closer — including the stray ` #}` — renders as visible text.
describe('a line that already contains #}', () => {
  const R = (a: number, b = a) => ({ startLine: a, startCol: 0, endLine: b, endCol: 0 });

  it('uses the block form, which nests', () => {
    const r = toggleDtlComment(['<p>x</p>{# note #}'], R(0));
    expect(r.op).toBe('insert-before-after');
  });

  it('does so for a bare closer too', () => {
    expect(toggleDtlComment(['<p>a #} b</p>'], R(0)).op).toBe('insert-before-after');
  });

  it('still uses the inline form for an ordinary line', () => {
    const r = toggleDtlComment(['<p>normal</p>'], R(0));
    expect(r.op).toBe('replace-lines');
    expect(r.op === 'replace-lines' && r.replacements?.[0]?.newText).toBe('{# <p>normal</p> #}');
  });

  it('and still uncomments one it wrapped itself', () => {
    const r = toggleDtlComment(['{# already #}'], R(0));
    expect(r.op === 'replace-lines' && r.replacements?.[0]?.newText).toBe('already');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Uncommenting a block must not delete text that shares a line with the tag.
//
// `{% comment %}` and `{% endcomment %}` are tags, not lines. The author is free
// to write live markup after the closer, or a note after the opener, and an
// adversarial audit found both shapes losing that text: the descriptor asked for
// `delete-lines` and the adapter deletes with `rangeIncludingLineBreak`.
//
// The invariant below is stated over the WHOLE document rather than over the
// descriptor, because the descriptor is an implementation detail and the thing
// that must hold is "no character the author typed outside the two tags is
// gone".
// ─────────────────────────────────────────────────────────────────────────────
describe('uncommenting a block preserves everything outside the two tags', () => {
  /** Applies a descriptor exactly as `adapters/commands/toggle-comment.ts` does. */
  const apply = (lines: string[], r: ReturnType<typeof toggleDtlComment>): string => {
    const out = [...lines];
    if (r.op === 'insert-before-after') {
      if (r.insertAfterLine !== undefined && r.insertAfterText !== undefined) {
        out.splice(r.insertAfterLine + 1, 0, r.insertAfterText);
      }
      if (r.insertBeforeLine !== undefined && r.insertBeforeText !== undefined) {
        out.splice(r.insertBeforeLine, 0, r.insertBeforeText);
      }
      return out.join('\n');
    }
    for (const e of r.replacements ?? []) out[e.line] = e.newText;
    for (const line of [...(r.deleteLines ?? [])].sort((a, b) => b - a)) out.splice(line, 1);
    return out.join('\n');
  };

  const uncomment = (lines: string[]) =>
    apply(
      lines,
      toggleDtlComment(lines, {
        startLine: 0,
        startCol: 0,
        endLine: lines.length - 1,
        endCol: 0,
      }),
    );

  it('keeps live markup written after {% endcomment %}', () => {
    expect(uncomment(['{% comment %}', 'hidden', '{% endcomment %}<p>Visible</p>'])).toContain(
      '<p>Visible</p>',
    );
  });

  it('keeps a note written after {% comment %}', () => {
    expect(
      uncomment(['{% comment %} TODO revisar esto', '<p>x</p>', '{% endcomment %}']),
    ).toContain('TODO revisar esto');
  });

  it('keeps text on both tag lines at once', () => {
    const after = uncomment(['{% comment %} why <p>a</p>', 'b', '</div>{% endcomment %}<p>z</p>']);
    expect(after).toContain('why <p>a</p>');
    expect(after).toContain('</div>');
    expect(after).toContain('<p>z</p>');
  });

  it('still removes the lines entirely when the tags are alone on them', () => {
    expect(uncomment(['{% comment %}', '<p>content</p>', '{% endcomment %}'])).toBe(
      '<p>content</p>',
    );
  });

  // The general rule the three cases above are instances of.
  it('never drops a non-whitespace character that is not part of the two tags', () => {
    const corpus: string[][] = [
      ['{% comment %}', 'a', '{% endcomment %}'],
      ['{% comment %} note', 'a', '{% endcomment %}'],
      ['{% comment %}', 'a', '{% endcomment %} tail'],
      ['{% comment %}head', 'a', 'tail{% endcomment %}'],
      ['  {% comment %}  x  ', '  a  ', '  y  {% endcomment %}  '],
      ['{% comment %}{{ v }}', 'a', '{% endcomment %}{% url "x" %}'],
    ];
    for (const lines of corpus) {
      const survived = uncomment(lines).replace(/\s+/g, '');
      const expected = lines
        .join('\n')
        .replace(/\{%-?\s*endcomment\s*-?%\}/g, '')
        .replace(/\{%-?\s*comment\b[^%]*?-?%\}/g, '')
        .replace(/\s+/g, '');
      expect(survived, `lost text uncommenting ${JSON.stringify(lines)}`).toBe(expected);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A line that merely BEGINS and ENDS with a comment is not a commented line.
//
// The test was `startsWith('{#') && endsWith('#}')`, which
// `{# hidden #} <p>visible</p> {# note #}` satisfies. Pressing "toggle comment"
// on a LIVE line therefore uncommented it — revealing text the author had
// deliberately hidden — instead of commenting it out. The round trip destroys
// the comment structure too: what comes back is one comment where there were
// two.
// ─────────────────────────────────────────────────────────────────────────────
describe('toggling a line that carries comments but is not one', () => {
  const R = (a: number, b = a) => ({ startLine: a, startCol: 0, endLine: b, endCol: 0 });

  it('comments a live line that sits between two comments', () => {
    const r = toggleDtlComment(['{# hidden #} <p>visible</p> {# note #}'], R(0));
    expect(r.op).toBe('insert-before-after');
  });

  it('does not reveal text the author hid', () => {
    const r = toggleDtlComment(['{# secret #} <p>shown</p> {# end #}'], R(0));
    expect(r.replacements?.[0]?.newText ?? '').not.toContain('secret');
  });

  it('still uncomments a line that really is one comment', () => {
    const r = toggleDtlComment(['{# just a comment #}'], R(0));
    expect(r.op).toBe('replace-lines');
    expect(r.replacements?.[0]?.newText).toBe('just a comment');
  });

  it('still uncomments a line that is nothing but two comments', () => {
    const r = toggleDtlComment(['{# a #} {# b #}'], R(0));
    expect(r.op).toBe('replace-lines');
    expect(r.replacements?.[0]?.newText).toBe('a b');
  });

  it('still uncomments an indented comment', () => {
    const r = toggleDtlComment(['    {# indented #}'], R(0));
    expect(r.replacements?.[0]?.newText).toBe('    indented');
  });
});
