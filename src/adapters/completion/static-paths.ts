/**
 * Path arithmetic for static-file completion. What the user picks goes verbatim
 * into `{% static "…" %}`, so a wrong prefix is a runtime 404.
 */

import { STATIC_SEARCH_ROOTS } from '$infra/exclude-paths';

export function buildStaticSearchGlob(): string {
  return `{${STATIC_SEARCH_ROOTS.map(root => `**/${root}`).join(',')}}/**/*`;
}

/**
 * Drop everything up to and including the static root. WHOLE segments: an
 * `indexOf('static/')` misses `staticfiles/`, so collectstatic output keeps its
 * root
 * attached. It would equally have mangled a directory named `static_extra`.
 */
export function stripStaticPrefix(relativePath: string): string {
  const segments = relativePath.split('/');
  const rootIndex = segments.findIndex(seg => STATIC_SEARCH_ROOTS.includes(seg));

  if (rootIndex === -1) return relativePath;
  return segments.slice(rootIndex + 1).join('/');
}
