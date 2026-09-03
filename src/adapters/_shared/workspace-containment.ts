/**
 * Is a path the workspace asked for actually inside the workspace?
 *
 * A relative reference written in a template is workspace-supplied text, and
 * `Uri.joinPath(docDir, relativePath)` will happily walk out of the tree:
 * `"../../../../etc/shadow"` resolved, the `stat()` that follows decided
 * whether to offer a link, and the result was a clickable link to a file
 * outside the project — and, whether or not the link appeared, an ORACLE for
 * the existence of arbitrary paths on the machine, driven entirely by text in a
 * repository the user may only have opened to read.
 *
 * Pure: paths in, boolean out, so the rule can be tested without a workspace.
 */

/** Normalise separators and resolve `.` / `..` without touching the disk. */
function normalise(path: string): string {
  const rooted = path.replace(/\\/g, '/');
  const out: string[] = [];
  for (const part of rooted.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      out.pop();
      continue;
    }
    out.push(part);
  }
  return (rooted.startsWith('/') ? '/' : '') + out.join('/');
}

/**
 * True when `target` is `root` itself or sits beneath it.
 *
 * Compares whole segments, so `/ws-evil` is not inside `/ws` — a prefix test on
 * the raw strings says it is.
 */
export function isInsideRoot(target: string, root: string): boolean {
  const a = normalise(target);
  const b = normalise(root);
  if (b === '') return false;
  return a === b || a.startsWith(b.endsWith('/') ? b : `${b}/`);
}

/** True when `target` sits inside ANY of `roots`. An empty list contains nothing. */
export function isInsideAnyRoot(target: string, roots: readonly string[]): boolean {
  return roots.some(root => isInsideRoot(target, root));
}
