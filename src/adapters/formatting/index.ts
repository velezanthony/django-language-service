/**
 * PRV-007, DTL-004 — Django Template Document Formatting Provider.
 *
 * Thin VS Code adapter. All formatting logic lives in `domain/formatting/`.
 * Reads user configuration from `djangoLanguageService.format.*` and
 * delegates to the pure `formatDocument(text, opts)` helper.
 */
import * as vscode from 'vscode';
import type { AdapterServices } from '$adapters/types';
import {
  formatDocument,
  DEFAULT_FORMAT_OPTIONS,
  type FormatOptions,
} from '$domain/formatting/formatter';
import { logError } from '$shared/logger';
import { DTL_SELECTOR } from '$adapters/_shared/languages';

class DjangoFormattingEditProvider implements vscode.DocumentFormattingEditProvider {
  provideDocumentFormattingEdits(
    document: vscode.TextDocument,
    formattingOptions: vscode.FormattingOptions,
  ): vscode.TextEdit[] {
    try {
      const config = vscode.workspace.getConfiguration('djangoLanguageService.format');
      const text = document.getText();

      const opts: FormatOptions = {
        tabWidth: config.get<number>('tabWidth', formattingOptions.tabSize),
        useTabs: config.get<boolean>('useTabs', !formattingOptions.insertSpaces),
        printWidth: config.get<number>('printWidth', DEFAULT_FORMAT_OPTIONS.printWidth),
        singleAttributePerLine: config.get<boolean>(
          'singleAttributePerLine',
          DEFAULT_FORMAT_OPTIONS.singleAttributePerLine,
        ),
      };

      const formatted = formatDocument(text, opts);

      if (formatted === text) {
        return [];
      }

      const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(text.length));

      return [vscode.TextEdit.replace(fullRange, formatted)];
    } catch (err) {
      logError('Formatting failed', err);
      return [];
    }
  }
}

export function register(
  _ctx: vscode.ExtensionContext,
  _services: AdapterServices,
): vscode.Disposable {
  return vscode.languages.registerDocumentFormattingEditProvider(
    DTL_SELECTOR,
    new DjangoFormattingEditProvider(),
  );
}
