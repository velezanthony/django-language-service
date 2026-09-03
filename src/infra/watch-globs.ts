/**
 * The exact file set the watcher listens on — literally the scanner's include
 * patterns, not a hand-copied approximation, because a second list would drift.
 *
 * `**​/*.py` would wake the debouncer on every `pip install` into a `.venv`
 * inside the workspace and trigger a full rescan.
 */

import { INCLUDE_PATTERNS } from './scanner';
import { isExcludedPath, resolveExcludeSegments } from './exclude-paths';

const APP_MODULES = ['models', 'views', 'forms', 'urls', 'helpers'];

/** Watcher patterns as `GlobPattern` strings — one watcher per pattern. */
export function buildWatchGlobs(): string[] {
  return [...INCLUDE_PATTERNS];
}

/**
 * Applied to every delivered event. `GlobPattern` and `files.watcherExclude`
 * exclude no virtualenv by default; this is what keeps a `.venv` write out of
 * `invalidateBatch`.
 */
export function isWatchablePath(path: string, excludeSegments?: readonly string[]): boolean {
  // Normalise here rather than trusting the caller. A default parameter only
  // fires on `undefined`, so an explicitly empty `excludePaths` setting used to
  // sail past it and leave the watcher excluding nothing, while the Scanner —
  // which does normalise — still excluded the defaults. Worse, a blank entry
  // matched the leading '' that `split('/')` yields for an absolute path and
  // silently excluded the entire workspace.
  if (isExcludedPath(path, resolveExcludeSegments(excludeSegments))) return false;

  const posix = path.replace(/\\/g, '/');
  const segments = posix.split('/');

  const name = segments[segments.length - 1] ?? '';

  if (name.endsWith('.html') || name.endsWith('.txt')) {
    return segments.includes('templates');
  }

  if (!name.endsWith('.py')) return false;

  const stem = name.slice(0, -'.py'.length);
  if (APP_MODULES.includes(stem)) return true;
  if (segments.includes('templatetags')) return true;
  if (segments.includes('views')) return true;
  if (segments[segments.length - 2] === 'migrations') return true;

  return false;
}
