/**
 * Views are indexed by `'<app>.<name>'`. Every producer and consumer of that
 * key derives it through `viewKey()`, or `byKey()` misses.
 */

/**
 * Module directories Django puts INSIDE an app; whatever precedes the first is
 * the app. Deliberately short — an app is as likely to be named `api` or
 * `utils` as to contain one.
 */
const APP_SUBPACKAGES: ReadonlySet<string> = new Set([
  'views',
  'models',
  'forms',
  'serializers',
  'migrations',
  'templates',
  'templatetags',
  'management',
  'commands',
  'tests',
]);

/**
 * The app a file belongs to: the segment before the first Django sub-package
 * directory, or the directory holding the file. Not the parent directory —
 * `apps/shop/views/orders.py` is `shop`, not `views`.
 */
export function appLabelFromPath(filePath: string, roots?: readonly string[]): string {
  const dirs = belowRoot(filePath, roots).split('/').slice(0, -1).filter(Boolean);
  if (dirs.length === 0) return 'unknown';

  const moduleAt = dirs.findIndex(d => APP_SUBPACKAGES.has(d));
  if (moduleAt > 0) return dirs[moduleAt - 1]!;
  // A sub-package at the root has no app above it; anything else is an app dir.
  return moduleAt === 0 ? 'unknown' : dirs[dirs.length - 1]!;
}

/**
 * The part of `filePath` inside the workspace. The rule above reads from the
 * left, so a `views/` or `tests/` anywhere ABOVE the root would win otherwise.
 * Longest matching root, so nested roots resolve to the inner one.
 */
function belowRoot(filePath: string, roots?: readonly string[]): string {
  const owner = owningRoot(filePath, roots);
  return owner === '' ? filePath : filePath.slice(owner.length);
}

/** The longest root prefix (with trailing slash) containing `filePath`, or ''. */
export function owningRoot(filePath: string, roots?: readonly string[]): string {
  if (!roots?.length) return '';

  let longest = '';
  for (const root of roots) {
    const prefix = root.endsWith('/') ? root : `${root}/`;
    if (filePath.startsWith(prefix) && prefix.length > longest.length) longest = prefix;
  }
  return longest;
}

/**
 * The label a multi-root workspace can index by: `'<app>.<name>'` is unique
 * inside one project, not across two. One root leaves the label untouched;
 * several qualify it with the root folder's name.
 */
export function qualifiedAppLabel(filePath: string, roots?: readonly string[]): string {
  const label = appLabelFromPath(filePath, roots);
  if (!roots || roots.length < 2) return label;

  const owner = owningRoot(filePath, roots);
  if (owner === '') return label;

  const folder = owner.slice(0, -1).split('/').filter(Boolean).pop();
  return folder === undefined ? label : `${folder}/${label}`;
}

/**
 * The key the view index uses. Prefers the label the scanner stored on the
 * view: only the scanner knows the roots, so the label travels with the entity.
 */
export function viewKey(
  view: { readonly filePath: string; readonly name: string; readonly appLabel?: string },
  roots?: readonly string[],
): string {
  return `${view.appLabel ?? appLabelFromPath(view.filePath, roots)}.${view.name}`;
}
