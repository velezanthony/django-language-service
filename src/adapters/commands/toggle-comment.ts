/**
 * CMD-015 — django-language-service.toggleComment
 * Toggles inline {# #} or block {% comment %} DTL comment on selection.
 * Delegates to pure domain/comments/toggle-comment logic.
 */
import * as vscode from 'vscode';
import type { AdapterServices } from '$adapters/types';
import { toggleDtlComment } from '$domain/comments/toggle-comment';
import { cmdId, registerCmd } from '$adapters/_shared/command-helper';
import { logError } from '$shared/logger';

export function register(
  _ctx: vscode.ExtensionContext,
  _services: AdapterServices,
): vscode.Disposable {
  return registerCmd(cmdId('toggleComment'), async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const document = editor.document;
    const selection = editor.selection;
    const lines: string[] = [];
    for (let i = 0; i < document.lineCount; i++) {
      lines.push(document.lineAt(i).text);
    }

    const result = toggleDtlComment(lines, {
      startLine: selection.start.line,
      startCol: selection.start.character,
      endLine: selection.end.line,
      endCol: selection.end.character,
    });

    try {
      await editor.edit(eb => {
        if (result.op === 'insert-before-after') {
          if (result.insertAfterLine !== undefined && result.insertAfterText !== undefined) {
            eb.insert(
              new vscode.Position(result.insertAfterLine + 1, 0),
              result.insertAfterText + '\n',
            );
          }
          if (result.insertBeforeLine !== undefined && result.insertBeforeText !== undefined) {
            eb.insert(
              new vscode.Position(result.insertBeforeLine, 0),
              result.insertBeforeText + '\n',
            );
          }
          return;
        }

        // Replacements and deletions arrive together when unwrapping a block
        // comment whose tags shared a line with the author's own text: the line
        // that keeps text is replaced, the one that held only the tag goes. They
        // never name the same line, and every edit is resolved against the
        // original document, so the two do not have to be ordered.
        for (const edit of result.replacements ?? []) {
          eb.replace(document.lineAt(edit.line).range, edit.newText);
        }
        for (const line of [...(result.deleteLines ?? [])].sort((a, b) => b - a)) {
          eb.delete(document.lineAt(line).rangeIncludingLineBreak);
        }
      });
    } catch (err) {
      logError('Failed to toggle Django comment', err);
    }
  });
}
