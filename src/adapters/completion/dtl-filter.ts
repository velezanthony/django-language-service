/**
 * PRV-001, INS-019, DTL-008 — DTL filter completion.
 *
 * Provides autocomplete for built-in and loaded Django template filters
 * inside `{{ value|<cursor> }}` expressions. Delegates to the pure
 * `dtl-tag-registry` for filter names and documentation.
 */
import * as vscode from 'vscode';
import { isInsideTemplateExpr } from '$domain/parsers/_shared/dtl-lexer';
import { extractLoadedLibraries } from '$domain/dtl-tag-registry/tag-registry';
import type { AdapterServices } from '$adapters/types';
import { FILTER_DOCS, getAvailableTagsAndFilters } from '$domain/dtl-tag-registry/tag-registry';
import { logError } from '$shared/logger';
import { DTL_SELECTOR } from '$adapters/_shared/languages';

const APP_NAME = 'Django Language Service';

/**
 * Is the cursor past a `|` inside a `{{ }}`?
 *
 * The "am I inside an expression" half is the shared one. This file kept the
 * last per-line copy of it, so filter completion went dead inside a `{{ }}`
 * that wrapped, while the three providers beside it had already been fixed.
 */
function isAfterFilterPipe(source: string, offset: number): boolean {
  if (!isInsideTemplateExpr(source, offset)) return false;
  const textBefore = source.slice(0, offset);
  const lastOpen = textBefore.lastIndexOf('{{');
  // A `{% %}` takes filters too, but this provider only offers them for `{{ }}`
  // — narrowing that is a separate change.
  if (lastOpen <= textBefore.lastIndexOf('}}')) return false;
  const afterOpen = textBefore.substring(lastOpen);
  return afterOpen.includes('|');
}

class DtlFilterCompletionProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.CompletionItem[] | undefined {
    try {
      if (!isAfterFilterPipe(document.getText(), document.offsetAt(position))) return undefined;

      const loadedLibs = extractLoadedLibraries(document.getText());
      const { filters } = getAvailableTagsAndFilters(loadedLibs, new Map());

      return [...filters].map(name => {
        const doc = FILTER_DOCS[name];
        const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Function);
        item.detail = `${APP_NAME} — filter`;
        item.filterText = name;
        item.sortText = `0_${name}`;

        if (doc) {
          item.insertText = new vscode.SnippetString(
            doc.syntax.includes(':') ? `${name}:\${1}` : name,
          );
          item.documentation = new vscode.MarkdownString(
            `**|${name}**\n\n${doc.description}\n\n**Syntax:** \`${doc.syntax}\`\n\n` +
              `**Example:**\n\`\`\`django\n${doc.example}\n\`\`\``,
          );
        } else {
          item.insertText = name;
        }

        return item;
      });
    } catch (err) {
      logError('DTL filter completion failed', err);
      return undefined;
    }
  }
}

export function register(
  _ctx: vscode.ExtensionContext,
  _services: AdapterServices,
): vscode.Disposable {
  return vscode.languages.registerCompletionItemProvider(
    DTL_SELECTOR,
    new DtlFilterCompletionProvider(),
    '|',
  );
}
