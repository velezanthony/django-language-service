/**
 * The path a template is referenced by. Django's loaders root at a template
 * DIRECTORY and strip it, so `apps/shop/templates/shop/card.html` loads as
 * `shop/card.html`; which segment applies depends on settings not read here.
 */

const MARKER = 'templates/';

/** Every load path, outermost root first. Take the first for THE path; try all
 *  when matching a hand-written reference. */
export function templateLoadPaths(filePath: string): string[] {
  const normalized = filePath.replace(/\\/g, '/');
  const paths: string[] = [];

  let at = normalized.indexOf(MARKER);
  while (at !== -1) {
    // Whole segments only: `my-templates/` is not a template root.
    if (at === 0 || normalized[at - 1] === '/') {
      paths.push(normalized.substring(at + MARKER.length));
    }
    at = normalized.indexOf(MARKER, at + 1);
  }
  return paths;
}

/**
 * The load path for an ABSOLUTE path, or null when it is under no template
 * root. The INNERMOST root, unlike the reader above: an absolute path can carry
 * a `templates/` segment belonging to a home directory.
 */
export function innermostLoadPath(filePath: string): string | null {
  return templateLoadPaths(filePath).at(-1) ?? null;
}
