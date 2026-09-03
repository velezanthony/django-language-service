/**
 * Views that exist only in the URL conf.
 *
 * `path('about/', TemplateView.as_view(template_name='pages/about.html'))` is
 * ordinary Django and there is no function in views.py to find. Nothing linked
 * that template to anything, so the sidebar listed it as an orphan and Live
 * Mode had no view to bind it to — on a template that is very much in use.
 *
 * Its context is what a TemplateView actually provides: `view` (ContextMixin
 * sets it on every class-based view) plus whatever `extra_context` carries.
 *
 * Pure domain: no vscode / fs / path imports.
 */

import type { Url } from '$domain/types/url';
import type { View } from '$domain/types/view';
import { buildContextVars } from './context-vars';

export function viewsFromUrlConf(urls: readonly Url[]): View[] {
  const out: View[] = [];
  const seen = new Set<string>();

  for (const url of urls) {
    const inline = url.inlineTemplate;
    if (!inline) continue;
    // Two URLs may point at the same template — one view is enough.
    const key = `${url.filePath}::${inline.templateName}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const contextKeys = ['view', ...inline.contextKeys];
    out.push({
      kind: 'view',
      // Named after the URL, which is what the user recognises it by.
      name: url.name.replace(/^.*:/, ''),
      filePath: url.filePath,
      line: url.line,
      isClass: true,
      templateName: inline.templateName,
      contextKeys,
      contextVars: buildContextVars(contextKeys, new Map()),
      decorators: [],
    });
  }
  return out;
}
