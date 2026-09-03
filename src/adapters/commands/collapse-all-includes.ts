/**
 * CMD-002 — django-language-service.collapseAllIncludesInDocument
 * Collapses all expanded {% include %} tags in the active document to inline form.
 */
import * as vscode from 'vscode';
import type { AdapterServices } from '$adapters/types';
import { findAllIncludeTagBoundsInLines, collapseFormatInclude } from '$domain/include-pretty';
import { cmdId, registerCmd } from '$adapters/_shared/command-helper';
import { logError } from '$shared/logger';

export function register(
  _ctx: vscode.ExtensionContext,
  _services: AdapterServices,
): vscode.Disposable {
  return registerCmd(cmdId('collapseAllIncludesInDocument'), async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const document = editor.document;
    const lines: string[] = [];
    for (let i = 0; i < document.lineCount; i++) {
      lines.push(document.lineAt(i).text);
    }

    const multiLineBounds = findAllIncludeTagBoundsInLines(lines).filter(
      b => b.startLine !== b.endLine,
    );

    if (multiLineBounds.length === 0) {
      vscode.window.showInformationMessage('No multi-line includes to collapse.');
      return;
    }

    try {
      const applied = await editor.edit(eb => {
        for (const bound of multiLineBounds) {
          const range = new vscode.Range(
            new vscode.Position(bound.startLine, 0),
            new vscode.Position(bound.endLine, document.lineAt(bound.endLine).text.length),
          );
          eb.replace(range, collapseFormatInclude(bound.tagText));
        }
      });
      if (applied) {
        vscode.window.showInformationMessage(
          `Collapsed ${multiLineBounds.length} include${multiLineBounds.length === 1 ? '' : 's'}.`,
        );
      }
    } catch (err) {
      logError('Failed to collapse all includes', err);
    }
  });
}
