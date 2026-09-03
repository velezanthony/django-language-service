/**
 * `FileSystem.glob` takes absolute patterns because fast-glob does.
 * `vscode.workspace.findFiles` wants a `RelativePattern` — a concrete base plus
 * a relative glob — and one exclude pattern rather than a list.
 */

/** A `vscode.RelativePattern` in plain data. */
export interface GlobParts {
  readonly base: string;
  readonly pattern: string;
}

/**
 * Split an absolute glob at its FIRST wildcard segment: a real directory, then
 * the relative glob.
 */
export function splitGlobBase(absolutePattern: string): GlobParts {
  const posix = absolutePattern.replace(/\\/g, '/');
  const segments = posix.split('/');

  let firstWildcard = segments.findIndex(seg => seg.includes('*') || seg.includes('?'));
  // No wildcard: the last segment is the pattern, so the base stays usable.
  if (firstWildcard === -1) firstWildcard = segments.length - 1;

  const base = segments.slice(0, firstWildcard).join('/');
  const pattern = segments.slice(firstWildcard).join('/');
  return { base: base.replace(/\/$/, ''), pattern };
}

/**
 * An exclude list as the single `GlobPattern` findFiles takes. `undefined` for
 * an empty list, which tells VS Code to apply the user's own `files.exclude`.
 */
export function joinExcludes(excludes: readonly string[]): string | undefined {
  if (excludes.length === 0) return undefined;
  if (excludes.length === 1) return excludes[0];
  return `{${excludes.join(',')}}`;
}
