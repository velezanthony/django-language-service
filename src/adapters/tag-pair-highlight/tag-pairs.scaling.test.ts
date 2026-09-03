/**
 * What the tag-pair highlight is allowed to cost.
 *
 * VS Code asks a `DocumentHighlightProvider` again on every cursor move, so
 * this runs on arrow keys, in the same document, at whatever size that document
 * happens to be. On a 2 MB template it took longer than 250 ms.
 *
 * Neither number below is a millisecond bound. An absolute threshold measures
 * the machine and whatever else the suite is doing — this repository already
 * had one go flaky at 123 ms and 127 ms with nothing changed — so both
 * assertions are RATIOS between two measurements taken on the same machine,
 * interleaved, best-of-N. The method is the one `src/test-support/scaling.ts`
 * documents and the reason is the one it gives.
 *
 * The two rules are different:
 *
 *  - SHAPE: doubling the document doubles the work. Guards against the
 *    accidental quadratic (`indexOf` inside a loop over matches) that this
 *    codebase has hit more than once.
 *  - OVERHEAD: pairing costs little more than reading the tokens it must read
 *    anyway. That is the rule the 2 MB defect broke: `findAllTags` built an
 *    `offsetMapper` over the whole file and ran a binary search per tag to
 *    stamp a line and a column on all 64 784 of them — numbers no caller has
 *    ever read. Perfectly linear, and roughly ten times the cost of the work
 *    it surrounds. A shape test cannot see that; a shape test is why it needs
 *    a second rule beside it.
 */

import { describe, it, expect } from 'vitest';
import { liveTokens } from '$domain/parsers/_shared/dtl-lexer';
import { discoverBlockOpeners } from '$domain/formatting/dtl-parser';
import { measureScaling } from '../../test-support/scaling';

import { findMatchingTags } from './tag-pairs';

/** One nested if/for/else block, ~250 bytes, repeated to reach a size. */
const BLOCK = [
  '<div class="row">',
  '  {% if user.is_authenticated %}',
  '    {% for item in items %}',
  '      <span>{{ item.name }}</span>',
  '    {% empty %}',
  '      <span>nothing here</span>',
  '    {% endfor %}',
  '  {% else %}',
  '    <a href="{% url \'login\' %}">sign in</a>',
  '  {% endif %}',
  '</div>',
].join('\n');

/**
 * `blocks` copies of BLOCK, made unique by `tag`.
 *
 * Uniqueness is not decoration. The lexer memoises its LAST source, so feeding
 * one string to repeated runs would have the first run tokenize and the rest
 * read a cache — the small side of a scaling comparison gets `factor` runs and
 * the large side one, so a shared string biases the ratio by whatever fraction
 * of the work tokenizing is. Distinct strings make every run pay the same
 * price.
 */
function template(blocks: number, tag: number): string {
  return `{# doc ${tag} #}\n${Array.from({ length: blocks }, () => BLOCK).join('\n')}\n`;
}

interface Prepared {
  readonly docs: readonly { source: string; offset: number; openers: ReadonlySet<string> }[];
  next: number;
}

function prepare(blocks: number, count: number): Prepared {
  const docs = Array.from({ length: count }, (_unused, i) => {
    const source = template(blocks, i);
    return {
      source,
      // The middle of the document, so the search is not trivially short at
      // either size.
      offset: source.indexOf('{% if', Math.floor(source.length / 2)) + 3,
      openers: discoverBlockOpeners(source),
    };
  });
  return { docs, next: 0 };
}

describe('pairing scales with the document, and no faster', () => {
  it('costs about four times as much on a four times larger template', () => {
    // measureScaling runs the small side `factor` times per attempt and the
    // large side once, plus a warm-up of each: 7 * 4 + 1 small, 7 + 1 large.
    const { ratio, small, large } = measureScaling<Prepared>({
      prepare: blocks => prepare(blocks, 40),
      run: bag => {
        const doc = bag.docs[bag.next++ % bag.docs.length]!;
        findMatchingTags(doc.source, doc.offset, doc.openers);
      },
      size: 40,
      factor: 4,
    });

    // Linear lands near 1, quadratic near 4. 2.5 is the bound the seven other
    // scaling tests in this repository use, for the same reason.
    expect(ratio, `small=${small.toFixed(1)}ms large=${large.toFixed(1)}ms`).toBeLessThan(2.5);
  });
});

/** Best of `attempts`, alternating the two so neither absorbs the other's GC. */
function overheadRatio(source: string, offset: number, openers: ReadonlySet<string>): number {
  // Warm both shapes AND the lexer memo: the floor and the pairing must be
  // compared over the same tokenization, or the first one measured pays for it.
  liveTokens(source);
  findMatchingTags(source, offset, openers);

  const time = (fn: () => void): number => {
    const start = performance.now();
    fn();
    return performance.now() - start;
  };

  let floor = Infinity;
  let paired = Infinity;
  for (let i = 0; i < 9; i++) {
    floor = Math.min(
      floor,
      time(() => void liveTokens(source)),
    );
    paired = Math.min(
      paired,
      time(() => void findMatchingTags(source, offset, openers)),
    );
  }
  return paired / Math.max(floor, 0.05);
}

describe('pairing pays for the tags it reports, not for every tag in the file', () => {
  it('costs a small multiple of reading the token stream it needs anyway', () => {
    // ~2 MB: the size the finding names, and large enough that a per-tag
    // constant is visible above the noise.
    const source = template(8000, 0);
    const offset = source.indexOf('{% if', Math.floor(source.length / 2)) + 3;
    const openers = discoverBlockOpeners(source);
    expect(source.length).toBeGreaterThan(1_800_000);

    const ratio = overheadRatio(source, offset, openers);
    // The defect measured 7.7x here and the repair measures 2.0x. 4 is the
    // geometric midpoint: far enough above the fixed cost to absorb a loaded
    // machine, far enough below the defect to catch it coming back.
    expect(ratio, `pairing cost ${ratio.toFixed(1)}x the token read it wraps`).toBeLessThan(4);
  });
});
