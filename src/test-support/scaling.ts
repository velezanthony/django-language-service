/**
 * A performance assertion that survives a loaded machine.
 *
 * A fixed `elapsed < 50ms` is flaky AND insensitive. Accidental quadratic
 * behaviour shows as a RATIO between two input sizes, and a ratio holds under
 * load because both sides slow together.
 *
 * Build inputs OUTSIDE the timed region, and interleave the measurements so GC
 * drift cancels rather than landing on the later one.
 */

export interface ScalingResult {
  /** Same work, one big batch vs many small. Linear lands near 1, quadratic
   *  near `factor`. */
  readonly ratio: number;
  /** Best observed milliseconds at each size. */
  readonly small: number;
  readonly large: number;
}

export interface ScalingSpec<T> {
  /** Build the input. Runs OUTSIDE the timed region. */
  readonly prepare: (size: number) => T;
  /** The work being measured. */
  readonly run: (input: T) => void;
  readonly size?: number;
  readonly factor?: number;
  readonly attempts?: number;
}

/**
 * `factor`×N items in small batches against the same items in one large batch.
 * Equal work on both sides, so linear scores ~1 and quadratic ~`factor`. The
 * number mean something on a machine that is also running the rest of the
 * suite.
 */
export function measureScaling<T>(spec: ScalingSpec<T>): ScalingResult {
  const { prepare, run, size = 50, factor = 4, attempts = 7 } = spec;

  const smallInput = prepare(size);
  const largeInput = prepare(size * factor);

  // Warm both shapes so the first timing does not measure JIT compilation.
  run(smallInput);
  run(largeInput);

  const time = (input: T, times: number): number => {
    const start = performance.now();
    for (let i = 0; i < times; i++) run(input);
    return performance.now() - start;
  };

  // The ratio of each attempt, and the BEST of those — not the best small over
  // the best large.
  //
  // Taking a minimum per side mixes a clean reading of one with a polluted
  // reading of the other, and vitest runs test FILES in parallel worker
  // threads: a thread can be descheduled for tens of milliseconds in the middle
  // of a window. Two of these tests passed alone and failed in the full suite
  // for that and not for a defect, twice each.
  //
  // Per attempt, both sides meet the same machine. A quadratic implementation
  // cannot produce a low ratio in ANY attempt, so the guard is unchanged; a
  // linear one only needs one attempt where the thread ran undisturbed.
  let ratio = Infinity;
  let small = Infinity;
  let large = Infinity;
  for (let i = 0; i < attempts; i++) {
    // A floor keeps a sub-millisecond measurement from turning the ratio into
    // noise on a fast machine.
    const smallMs = Math.max(time(smallInput, factor), 0.05);
    const largeMs = time(largeInput, 1);
    if (largeMs / smallMs < ratio) {
      ratio = largeMs / smallMs;
      small = smallMs;
      large = largeMs;
    }
  }

  return { ratio, small, large };
}
