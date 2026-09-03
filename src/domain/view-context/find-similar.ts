/**
 * Levenshtein-based "did you mean" helper.
 * Port of legacy python-utils.ts findSimilar/levenshtein (view-context slice).
 */

/** Find the most similar string from candidates using Levenshtein distance.
 *  Returns undefined when nothing is within the similarity threshold. */
export function findSimilar(name: string, candidates: readonly string[]): string | undefined {
  let best: string | undefined;
  let bestDist = Infinity;
  const threshold = Math.max(2, Math.floor(name.length * 0.4));

  for (const candidate of candidates) {
    const dist = levenshtein(name, candidate);
    if (dist < bestDist && dist <= threshold) {
      bestDist = dist;
      best = candidate;
    }
  }
  return best;
}

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i]![j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1]![j - 1]!
          : 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!);
    }
  }
  return dp[m]![n]!;
}
