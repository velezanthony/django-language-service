/**
 * Directories this extension never looks inside — one source of truth for the
 * scanner's globs and the watcher's segment test, which used to be two hand-
 * reconciled lists.
 *
 * `.*` is a wildcard for any dot-directory: enumerating them by name is a
 * losing game against whatever tool ships next year.
 *
 * Pure module — no vscode, no fs. The user's override is passed in.
 */

/**
 * Tooling directories — nothing in here is ever worth reading, for any purpose.
 * Dependencies, caches, build output, coverage reports.
 */
export const TOOLING_EXCLUDE_SEGMENTS: readonly string[] = [
  '.*', // every dot-directory: .venv .git .tox .direnv .ruff_cache …
  'venv',
  'env',
  'virtualenv',
  'site-packages',
  'node_modules',
  '__pycache__',
  'dist',
  'build',
  'coverage',
  'htmlcov',
  '*.egg-info',
];

/**
 * Asset roots — no models, views or templates, but real project content. The
 * static-file completion searches inside them, so it must not inherit these.
 */
export const ASSET_ROOT_SEGMENTS: readonly string[] = ['static', 'media'];

/** Directory names the static-file completion searches inside. */
export const STATIC_SEARCH_ROOTS: readonly string[] = ['static', 'staticfiles'];

/** Segment names (or `dir/subdir` paths, or `*` patterns) never scanned. */
export const DEFAULT_EXCLUDE_SEGMENTS: readonly string[] = [
  ...TOOLING_EXCLUDE_SEGMENTS,
  ...ASSET_ROOT_SEGMENTS,
];

/** `**​/<segment>/**` for each segment — the shape both file services want. */
export function buildExcludeGlobs(segments: readonly string[]): string[] {
  return segments.map(seg => `**/${seg}/**`);
}

/**
 * The effective segment list. The user's setting replaces the ASSET ROOTS, not
 * the TOOLING ones — those can never be worth reading, and a `["nothing"]` in
 * some repository's `.vscode/settings.json` would otherwise index `.git`.
 *
 * Empty or absent means the defaults. Blank entries are dropped: a stray `""`
 * builds `**​//**` and swallows the workspace.
 */
export function resolveExcludeSegments(configured: readonly string[] | undefined): string[] {
  const cleaned = (configured ?? []).map(s => s.trim()).filter(Boolean);
  if (cleaned.length === 0) return [...DEFAULT_EXCLUDE_SEGMENTS];
  return [...new Set([...TOOLING_EXCLUDE_SEGMENTS, ...cleaned])];
}

/**
 * The same exclusions, minus the roots that search looks inside — excluding
 * `static/` from a search under `static/` returns nothing.
 */
export function excludesForStaticSearch(configured: readonly string[] | undefined): string[] {
  return resolveExcludeSegments(configured).filter(seg => !STATIC_SEARCH_ROOTS.includes(seg));
}

function segmentMatches(segment: string, name: string): boolean {
  if (segment === name) return true;
  if (!segment.includes('*')) return false;
  const pattern = segment
    .split('*')
    .map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('[^/]*');
  return new RegExp(`^${pattern}$`).test(name);
}

/**
 * Does `path` sit inside an excluded directory?
 *
 * Applied to every watcher event, because VS Code resolves glob patterns
 * against the workspace and honours `files.watcherExclude`, and neither of
 * those excludes a virtualenv by default.
 */
export function isExcludedPath(path: string, segments: readonly string[]): boolean {
  const posix = path.replace(/\\/g, '/');
  const parts = posix.split('/');
  // The last part is the file name, not a directory — `.env.example` is a file
  // and must not be mistaken for a dot-directory.
  const dirs = parts.slice(0, -1);

  return segments.some(segment => {
    if (segment.includes('/')) {
      const needle = `/${segment}/`;
      return `${dirs.join('/')}/`.includes(needle) || posix.includes(needle);
    }
    return dirs.some(dir => segmentMatches(segment, dir));
  });
}
