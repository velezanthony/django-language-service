/**
 * PRV-016, INS-007 — URL name hover.
 *
 * On hover over a URL name inside `{% url 'name' %}`, resolves the name
 * through the Project URL index and displays the pattern, the view it maps
 * to, and the source file with its line number. (There is no separate app
 * field — the namespace is already part of `Url.name`, as "app:url_name".)
 */
import * as vscode from 'vscode';
import type { AdapterServices } from '$adapters/types';
import { escapeMarkdown, codeSpan } from '$adapters/_shared/markdown-escape';
import { logError } from '$shared/logger';
import { DTL_SELECTOR } from '$adapters/_shared/languages';
import { firstStringArgAt } from '$adapters/_shared/tag-string-arg';

/** The tag whose first quoted argument is a URL name. */
const URL_TAG: ReadonlySet<string> = new Set(['url']);

class DjangoUrlHoverProvider implements vscode.HoverProvider {
  constructor(private readonly services: AdapterServices) {}

  provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | undefined {
    try {
      // Offset, not line text. Two `{% url %}` tags on a line — a nav bar is
      // nothing else — and a search from column zero ranges the first one
      // wherever the pointer actually is. The cursor's absolute position is
      // the only thing that distinguishes them when the two names are equal.
      const ref = firstStringArgAt(document.getText(), document.offsetAt(position), URL_TAG);
      if (!ref) return undefined;

      const project = this.services.getProject();
      const entry = project.urls.byKey(ref.value);
      if (!entry) return undefined;

      const relPath = vscode.workspace.asRelativePath(entry.filePath);
      // Not trusted: every value below is read out of the workspace's urls.py.
      const md = new vscode.MarkdownString();
      md.supportThemeIcons = true;

      // Every value below comes out of the workspace's urls.py. Nothing here
      // is trusted, so a command URI cannot fire — trusted-markdown.test.ts
      // greps this file to keep it that way. What escaping adds is the rest of
      // markdown: an unescaped `![](https://…)` in a name renders as an image,
      // and the editor fetches it when the pointer rests on the word.
      md.appendMarkdown(`$(globe) **${escapeMarkdown(entry.name)}**\n\n`);
      if (entry.pattern) md.appendMarkdown(`**Pattern:** ${codeSpan(`/${entry.pattern}`)}\n\n`);
      md.appendMarkdown(`**View:** ${codeSpan(entry.viewName)}\n\n`);
      md.appendMarkdown(`$(file-code) ${codeSpan(`${relPath}:${entry.line + 1}`)}`);

      const range = new vscode.Range(document.positionAt(ref.start), document.positionAt(ref.end));
      return new vscode.Hover(md, range);
    } catch (err) {
      logError('URL hover failed', err);
      return undefined;
    }
  }
}

export function register(
  _ctx: vscode.ExtensionContext,
  services: AdapterServices,
): vscode.Disposable {
  return vscode.languages.registerHoverProvider(DTL_SELECTOR, new DjangoUrlHoverProvider(services));
}
