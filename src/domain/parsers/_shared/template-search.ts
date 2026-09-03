/**
 * Where to look for the file a `{% include %}` or `{% extends %}` names. The
 * ORDER is the answer — first match wins — so this is one list, or the readers
 * disagree about which `base.html` they opened. The caller does the looking.
 */

const PREFIX = 'templates/';

export function templateSearchGlobs(templatePath: string): string[] {
  const globs: string[] = [];

  // Written with the prefix already — the most specific reading.
  if (templatePath.startsWith(PREFIX)) {
    globs.push(`**/${PREFIX}${templatePath.substring(PREFIX.length)}`);
  }

  // DIRS before the app loader, as Django searches them.
  globs.push(`${PREFIX}${templatePath}`);
  globs.push(`**/${PREFIX}${templatePath}`);
  globs.push(`**/${templatePath}`);
  globs.push(`**/jinja2/${templatePath}`);

  // Deduped: a repeat is a second workspace-wide search. A Set keeps the order.
  return [...new Set(globs)];
}
