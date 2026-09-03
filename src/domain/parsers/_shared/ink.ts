/**
 * Whitespace-only rewrites, guarded. Cannot see whitespace itself: a caller
 * whose output must keep its LINE STRUCTURE checks that separately.
 */

/** Everything except whitespace. */
export function ink(text: string): string {
  return text.replace(/\s+/g, '');
}

/** Run the rewrite, or give the original back. A throw counts as declining. */
export function preservingInk(original: string, rewrite: (text: string) => string): string {
  let rewritten: string;
  try {
    rewritten = rewrite(original);
  } catch {
    return original;
  }
  return ink(rewritten) === ink(original) ? rewritten : original;
}
