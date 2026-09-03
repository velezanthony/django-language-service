/**
 * Absolute character offset → 1-based line and column.
 *
 * Built once per source, then O(log n) per lookup. The naive form — counting
 * newlines from the start of the file for every match — is O(n) per call, and
 * with one call per match that is O(n²): `parseUrls` measured a 15.7× slowdown
 * for a 4× larger urls.py, which is quadratic to two significant figures.
 *
 * Pure domain: no vscode / fs / path imports.
 */

export function offsetMapper(source: string): (offset: number) => { line: number; col: number } {
  const starts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\n') starts.push(i + 1);
  }
  return offset => {
    // Binary search for the last line start at or before `offset`.
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid]! <= offset) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, col: offset - starts[lo]! + 1 };
  };
}
