/**
 * PRV-008, DTL-015, DTL-016, DTL-017 — Include-pretty CodeLens provider.
 *
 * Renders inline action buttons above each `{% include %}` tag:
 * - Multi-line include → "Collapse to inline" button
 * - Single-line include with HTML props → "Expand HTML props" button
 *
 * The CodeLens command delegates to the internal CMD-019 (codeLensToggleInclude)
 * which receives the document URI + line number and calls `collapseFormatInclude`
 * / `prettyFormatInclude` ($domain/include-pretty/include-formatter).
 */
import * as vscode from 'vscode';
import type { AdapterServices } from '$adapters/types';
import { cmdId } from '$adapters/_shared/command-helper';
import { INCLUDE_TAG_PATTERN } from '$domain/include-pretty/include-finder';
import { parseIncludeTag } from '$domain/include-pretty/include-parser';
import { DTL_LANGUAGES, DTL_SELECTOR } from '$adapters/_shared/languages';

class IncludeCodeLensProvider implements vscode.CodeLensProvider {
  private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.onDidChangeEmitter.event;

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (!DTL_LANGUAGES.has(document.languageId)) return [];

    const lenses: vscode.CodeLens[] = [];

    for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex++) {
      const lineText = document.lineAt(lineIndex).text;
      if (!INCLUDE_TAG_PATTERN.test(lineText)) continue;

      if (!lineText.includes('%}')) {
        // Multi-line include — find end line
        let endLine = lineIndex + 1;
        while (endLine < document.lineCount && !document.lineAt(endLine).text.includes('%}')) {
          endLine++;
        }

        if (endLine > lineIndex) {
          const range = new vscode.Range(lineIndex, 0, lineIndex, lineText.length);
          lenses.push(
            new vscode.CodeLens(range, {
              title: '$(fold-down) Collapse to inline',
              command: cmdId('codeLensToggleInclude'),
              arguments: [document.uri, lineIndex],
            }),
          );
        }
      } else {
        // Single-line include — offer expand if it has HTML props
        const parsed = parseIncludeTag(lineText);
        if (parsed && parsed.props.some(p => p.hasHTML)) {
          const range = new vscode.Range(lineIndex, 0, lineIndex, lineText.length);
          lenses.push(
            new vscode.CodeLens(range, {
              title: '$(fold-up) Expand HTML props',
              command: cmdId('codeLensToggleInclude'),
              arguments: [document.uri, lineIndex],
            }),
          );
        }
      }
    }

    return lenses;
  }

  refresh(): void {
    this.onDidChangeEmitter.fire();
  }

  dispose(): void {
    this.onDidChangeEmitter.dispose();
  }
}

export function register(
  _ctx: vscode.ExtensionContext,
  _services: AdapterServices,
): vscode.Disposable {
  const provider = new IncludeCodeLensProvider();
  const codeLensReg = vscode.languages.registerCodeLensProvider(DTL_SELECTOR, provider);

  const changeListener = vscode.workspace.onDidChangeTextDocument(() => {
    provider.refresh();
  });

  return vscode.Disposable.from(codeLensReg, changeListener, provider);
}
