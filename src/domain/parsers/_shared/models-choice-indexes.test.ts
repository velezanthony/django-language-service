import { describe, it, expect } from 'vitest';
import { measureScaling } from '../../../test-support/scaling';
import { parseTextChoicesClasses, parseNestedTextChoicesClasses } from './models-choice-indexes';

/**
 * A class header with `n` base classes and NO choices base, so whatever reads
 * the header has to reject it — which is the expensive direction for a pattern
 * that can split the bases more than one way.
 */
const header = (n: number) =>
  `class Report(${Array.from({ length: n }, (_, i) => `Mixin${i}`).join(', ')}):\n    pass\n`;

// ─────────────────────────────────────────────────────────────────────────────
// Reading a class header costs time proportional to its length.
//
// The header was matched with `(?:[^,)]+,\s*)*` in front of the choices base.
// `[^,)]+` happily eats spaces, so a header the pattern must reject can be split
// into bases in exponentially many ways and the matcher tries all of them:
// 20 bases took 11 ms, 24 took 180 ms, 26 took 693 ms, 28 took 3.2 s — ×4.6 for
// every two bases added. A models.py of 141 bytes hung the extension host for
// good, and nobody had to open the file: the scanner globs `**/models.py` when
// the folder opens, and the extension declares `untrustedWorkspaces: supported`.
//
// The budget below is deliberately far above what a linear reader needs
// (microseconds) and far below what backtracking costs, so it fails loudly
// without being sensitive to how fast the machine is.
// ─────────────────────────────────────────────────────────────────────────────
describe('class headers are read in linear time', () => {
  const BUDGET_MS = 100;

  it('rejects a 26-base header without backtracking', () => {
    const source = header(26);
    const started = performance.now();
    parseTextChoicesClasses(source);
    expect(performance.now() - started).toBeLessThan(BUDGET_MS);
  });

  it('rejects a 26-base NESTED header without backtracking', () => {
    const source = `class Order(models.Model):\n    ${header(26).replace(/\n/g, '\n    ')}`;
    const started = performance.now();
    parseNestedTextChoicesClasses(source);
    expect(performance.now() - started).toBeLessThan(BUDGET_MS);
  });

  // The property the two cases above are instances of: adding bases adds work
  // in proportion, never in powers.
  //
  // Through the shared harness rather than two hand-rolled `performance.now()`
  // readings. Taking one measurement of each side and dividing them mixes a
  // clean reading of one with a polluted reading of the other, and vitest runs
  // test files in parallel worker threads — this exact assertion failed in the
  // full suite while passing alone, twice, for that reason and not for a
  // defect. `measureScaling` takes the best RATIO across attempts, so both
  // sides always meet the same machine.
  it('adding bases adds work in proportion, never in powers', () => {
    const { ratio } = measureScaling({
      prepare: n => header(n),
      run: source => {
        parseTextChoicesClasses(source);
      },
      size: 12,
      factor: 2,
    });
    // Linear is 1. Backtracking on a rejected header was 4.6x for every TWO
    // bases added, so a doubling would be orders above this.
    expect(ratio).toBeLessThan(4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// …and the headers that DO declare choices are still read.
// ─────────────────────────────────────────────────────────────────────────────
describe('choices classes are still recognised', () => {
  const members = '\n    DRAFT = "d", "Draft"\n    LIVE = "l", "Live"\n';

  it('reads the plain form', () => {
    const got = parseTextChoicesClasses(`class Status(models.TextChoices):${members}`);
    expect([...got.keys()]).toEqual(['Status']);
    expect(got.get('Status')?.map(c => c.value)).toEqual(['d', 'l']);
  });

  it('reads it through mixins, unqualified, and with a trailing base', () => {
    for (const head of [
      'class Status(SomeMixin, models.TextChoices):',
      'class Status(TextChoices):',
      'class Status(models.IntegerChoices):',
      'class Status(A, B, models.TextChoices, C):',
      'class Status( SomeMixin ,  models.Choices ):',
    ]) {
      const got = parseTextChoicesClasses(`${head}${members}`);
      expect([...got.keys()], `not recognised: ${head}`).toEqual(['Status']);
    }
  });

  it('reads a nested one', () => {
    const source = `class Order(models.Model):\n    class Status(models.TextChoices):\n        DRAFT = "d", "Draft"\n`;
    const nested = parseNestedTextChoicesClasses(source);
    expect(
      nested
        .get('Order')
        ?.get('Status')
        ?.map(c => c.value),
    ).toEqual(['d']);
  });

  it('does not mistake a non-choices class for one', () => {
    expect(parseTextChoicesClasses('class Report(Mixin, models.Model):\n    pass\n').size).toBe(0);
  });
});
