/**
 * CMD-004 — django-language-service.expandAllIncludesInDocument
 * Expands all inline {% include %} tags with HTML props to multi-line pretty form.
 */
import * as vscode from 'vscode';
import type { AdapterServices } from '$adapters/types';
import {
  findAllIncludeTagBoundsInLines,
  parseIncludeTag,
  prettyFormatInclude,
} from '$domain/include-pretty';
import { cmdId, registerCmd } from '$adapters/_shared/command-helper';
import { logError } from '$shared/logger';

export function register(
  _ctx: vscode.ExtensionContext,
  _services: AdapterServices,
): vscode.Disposable {
  return registerCmd(cmdId('expandAllIncludesInDocument'), async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const document = editor.document;
    const lines: string[] = [];
    for (let i = 0; i < document.lineCount; i++) {
      lines.push(document.lineAt(i).text);
    }

    const candidates = findAllIncludeTagBoundsInLines(lines).filter(b => {
      if (b.startLine !== b.endLine) return false;
      const parsed = parseIncludeTag(b.tagText);
      return parsed !== null && parsed.props.some(p => p.hasHTML);
    });

    if (candidates.length === 0) {
      vscode.window.showInformationMessage('No single-line includes with HTML props to expand.');
      return;
    }

    try {
      const applied = await editor.edit(eb => {
        for (const bound of candidates) {
          const baseIndent =
            (document.lineAt(bound.startLine).text.match(/^(\s*)/) ?? ['', ''])[1] ?? '';
          const range = new vscode.Range(
            new vscode.Position(bound.startLine, 0),
            new vscode.Position(bound.endLine, document.lineAt(bound.endLine).text.length),
          );
          eb.replace(range, prettyFormatInclude(bound.tagText, baseIndent));
        }
      });
      if (applied) {
        vscode.window.showInformationMessage(
          `Expanded ${candidates.length} include${candidates.length === 1 ? '' : 's'}.`,
        );
      }
    } catch (err) {
      logError('Failed to expand all includes', err);
    }
  });
}
