/**
 * PRV-015, INS-006 — URL name completion.
 *
 * Provides autocomplete for URL names inside:
 * - HTML: `{% url "name" %}` and `{% url 'name' %}`
 * - Python: `reverse('name')` and `redirect('name')`
 *
 * URL entries are read from the Project snapshot (scanner-indexed). There is no
 * fallback: until the scanner has indexed at least one URL, this returns nothing.
 */
import * as vscode from 'vscode';
import type { AdapterServices } from '$adapters/types';
import { logError } from '$shared/logger';
import { DTL_AND_PYTHON_SELECTOR, DTL_LANGUAGES } from '$adapters/_shared/languages';

/**
 * Detects cursor inside {% url '...' %} in HTML, capturing the OPENING quote.
 *
 * The quote is captured because the completion has to close it, and it used to
 * close with a literal `'` whatever the author had typed — so opening with `"`
 * produced `{% url "detail' %}`, which Django rejects.
 */
const HTML_URL_TRIGGER = /\{%[-+]?\s*url\s+(['"])[^'"]*$/;
/** The same, for reverse('...') / redirect('...') / resolve('...') in Python. */
const PYTHON_URL_TRIGGER = /(?:reverse|redirect|resolve)\s*\(\s*(['"])[^'"]*$/;
/** Detects cursor after a URL name, before arguments. */
const HTML_URL_NAME_BEFORE = /\{%[-+]?\s*url\s+['"]([^'"]+)['"]\s+$/;

/** Extracts path argument names from a URL pattern string like "product/<int:pk>/". */
function extractUrlArgs(pattern: string): { name: string; type: string }[] {
  const args: { name: string; type: string }[] = [];
  const re = /<(?:(\w+):)?(\w+)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pattern)) !== null) {
    args.push({ type: m[1] ?? 'str', name: m[2] ?? '' });
  }
  return args;
}

class DjangoUrlCompletionProvider implements vscode.CompletionItemProvider {
  constructor(private readonly services: AdapterServices) {}

  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.CompletionItem[] | undefined> {
    try {
      const linePrefix = document.lineAt(position).text.substring(0, position.character);
      const isHtml = DTL_LANGUAGES.has(document.languageId);
      const isPython = document.languageId === 'python';

      // Phase 1: URL name completion
      const opened =
        (isHtml ? HTML_URL_TRIGGER.exec(linePrefix)?.[1] : undefined) ??
        (isPython ? PYTHON_URL_TRIGGER.exec(linePrefix)?.[1] : undefined);
      if (opened) {
        const project = this.services.getProject();
        const urls = project.urls.all();

        return urls.map(entry => {
          const args = extractUrlArgs(entry.pattern);
          const item = new vscode.CompletionItem(entry.name, vscode.CompletionItemKind.Reference);
          item.detail = entry.pattern ? `/${entry.pattern}` : 'URL pattern';
          item.documentation = new vscode.MarkdownString(
            `**${entry.name}**\n\n` +
              (entry.pattern ? `**Pattern:** \`/${entry.pattern}\`\n\n` : '') +
              `**View:** ${entry.viewName}\n\n` +
              `**File:** \`${vscode.workspace.asRelativePath(entry.filePath)}:${entry.line + 1}\``,
          );
          if (args.length > 0) {
            // Built through the SnippetString API rather than interpolated into
            // its constructor. `appendText` escapes `$`, `}` and `\`, which the
            // constructor does not — and a url name is free to contain them
            // (`path(..., name="price$total")` is a legal Django url name), at
            // which point the name stopped being text and became snippet
            // syntax: `$total` read as a variable and vanished on insert.
            const snippet = new vscode.SnippetString();
            snippet.appendText(`${entry.name}${opened} `);
            args.forEach((arg, i) => {
              if (i > 0) snippet.appendText(' ');
              snippet.appendPlaceholder(arg.name);
            });
            snippet.appendText(' ');
            item.insertText = snippet;
          } else {
            // A plain string is inserted verbatim by VS Code — no snippet
            // grammar, so nothing to escape and no quote to close.
            item.insertText = entry.name;
          }
          return item;
        });
      }

      // Phase 2: URL argument completion
      if (isHtml) {
        const argMatch = linePrefix.match(HTML_URL_NAME_BEFORE);
        if (argMatch) {
          const urlName = argMatch[1] ?? '';
          const project = this.services.getProject();
          const entry = project.urls.byKey(urlName);
          if (entry) {
            const args = extractUrlArgs(entry.pattern);
            return args.map(arg => {
              const item = new vscode.CompletionItem(arg.name, vscode.CompletionItemKind.Variable);
              item.detail = `URL argument (${arg.type})`;
              item.documentation = new vscode.MarkdownString(
                `Required argument for \`${urlName}\`\n\n**Pattern:** \`/${entry.pattern}\`\n\n**Type:** \`${arg.type}\``,
              );
              return item;
            });
          }
        }
      }

      return undefined;
    } catch (err) {
      logError('URL completion failed', err);
      return undefined;
    }
  }
}

export function register(
  _ctx: vscode.ExtensionContext,
  services: AdapterServices,
): vscode.Disposable {
  return vscode.languages.registerCompletionItemProvider(
    DTL_AND_PYTHON_SELECTOR,
    new DjangoUrlCompletionProvider(services),
    '"',
    "'",
    ' ',
  );
}
