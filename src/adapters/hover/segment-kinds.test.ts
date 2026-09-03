/**
 * Every `ChainSegmentInfo` kind the domain can produce has a renderer.
 *
 * `renderSegment` switches on `info.kind` and has NO `default` branch. That is
 * the right shape — a default would invent prose for something nobody wrote —
 * but it means a kind added in the domain and forgotten here does not fail to
 * compile and does not throw: it returns an EMPTY `MarkdownString`, and VS Code
 * shows an empty hover bubble. Worse than no hover, because the user reads it
 * as "this project knows nothing about that name".
 *
 * This just happened. `fk-id` and `date-nav` were accepted by `resolveChain`
 * for a long time before `describeChainSegment` learned to name them, and the
 * moment it did, the hover was one edit away from that empty bubble.
 *
 * A contract over the SOURCE, like `trusted-markdown.test.ts` next door, and
 * for the same reason: the defect is invisible from the outside. Rendering is
 * covered by behaviour tests; what no behaviour test can see is the kind
 * nobody thought to write a case for.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DOMAIN = readFileSync(
  join(__dirname, '..', '..', 'domain', 'view-context', 'describe-chain.ts'),
  'utf8',
);
const HOVER = readFileSync(join(__dirname, 'model-field.ts'), 'utf8');

/** The `kind:` literals of the `ChainSegmentInfo` union, in declaration order. */
function declaredKinds(): string[] {
  const union = /export type ChainSegmentInfo =([\s\S]*?);\n/.exec(DOMAIN);
  expect(union, 'ChainSegmentInfo union not found — did the type move?').not.toBeNull();
  return [...union![1]!.matchAll(/kind: '([a-z-]+)'/g)].map(m => m[1]!);
}

/** The `case '<kind>':` labels of the switch inside `renderSegment`. */
function renderedKinds(): string[] {
  const fn = /function renderSegment\([\s\S]*?\n}\n/.exec(HOVER);
  expect(fn, 'renderSegment not found — did it move or get renamed?').not.toBeNull();
  return [...fn![0]!.matchAll(/case '([a-z-]+)':/g)].map(m => m[1]!);
}

describe('the hover renders every segment kind the domain describes', () => {
  it('finds a union worth checking', () => {
    // Guards the test itself: a regex that silently matches nothing would make
    // every assertion below vacuously true.
    expect(declaredKinds().length).toBeGreaterThan(5);
  });

  it('has a case for each kind', () => {
    const missing = declaredKinds().filter(k => !renderedKinds().includes(k));
    expect(missing, `kinds with no renderer — they would hover as an empty bubble`).toEqual([]);
  });

  it('has no case for a kind the domain cannot produce', () => {
    // The other direction: dead prose nobody can reach, usually the leftover of
    // a rename that only got done on one side.
    const orphans = renderedKinds().filter(k => !declaredKinds().includes(k));
    expect(orphans, 'cases for kinds that no longer exist').toEqual([]);
  });
});
