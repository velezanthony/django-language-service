/**
 * Pure orphan-template computation — no vscode import.
 *
 * A template is an orphan when no view renders it and no template includes or
 * extends it. The TARGET of an extends is the referenced one, not the child.
 *
 * References are load paths while the index stores workspace-relative paths, so
 * each candidate is compared both ways.
 */
import type { Template, View } from '$domain/types';
import { templateLoadPaths } from '$domain/parsers/_shared/template-load-path';

/** Every path a reference could name this template by; a view can use either. */
const candidatePaths = (relativePath: string): string[] => [
  relativePath,
  ...templateLoadPaths(relativePath),
];

export function computeOrphanTemplates(
  templates: readonly Template[],
  views: readonly View[],
): Template[] {
  const referenced = new Set<string>();

  for (const view of views) {
    if (view.templateName) referenced.add(view.templateName);
  }

  for (const tmpl of templates) {
    for (const inc of tmpl.includes) {
      referenced.add(inc.target);
    }
    // The TARGET of an extends, not the child declaring it.
    if (tmpl.extends) referenced.add(tmpl.extends);
  }

  return templates.filter(tmpl => !candidatePaths(tmpl.relativePath).some(p => referenced.has(p)));
}
