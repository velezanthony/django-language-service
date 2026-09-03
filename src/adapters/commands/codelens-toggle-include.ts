/**
 * CMD-019 (internal) — django-language-service.codeLensToggleInclude
 * Toggled from CodeLens button above include tags. NOT in package.json.
 * Collapses or expands the include tag at the given document + line.
 */
import * as vscode from 'vscode';
import type { AdapterServices } from '$adapters/types';
import {
  INCLUDE_TAG_PATTERN,
  parseIncludeTag,
  prettyFormatInclude,
  collapseFormatInclude,
} from '$domain/include-pretty';
import { cmdId, registerCmd } from '$adapters/_shared/command-helper';
import { logError } from '$shared/logger';

export function register(
  _ctx: vscode.ExtensionContext,
  _services: AdapterServices,
): vscode.Disposable {
  return registerCmd(
    cmdId('codeLensToggleInclude'),
    async (documentUri: vscode.Uri, lineIndex: number) => {
      const document = await vscode.workspace.openTextDocument(documentUri);
      const editor = await vscode.window.showTextDocument(document, { preview: false });

      // The line index came from a CodeLens rendered against an EARLIER
      // version of this document. If the file shrank in between — an undo, an
      // external edit, a git checkout — `lineAt` throws out of a command
      // handler, which VS Code surfaces as an error toast for a click the user
      // cannot connect to anything.
      if (lineIndex < 0 || lineIndex >= document.lineCount) return;

      const lineText = document.lineAt(lineIndex).text;
      const isMultiLine = INCLUDE_TAG_PATTERN.test(lineText) && !lineText.includes('%}');

      const startLine = lineIndex;
      let endLine = lineIndex;
      let fullTagText = lineText;

      if (isMultiLine) {
        while (!fullTagText.includes('%}') && endLine < document.lineCount - 1) {
          endLine++;
          fullTagText += '\n' + document.lineAt(endLine).text;
        }
      }

      const baseIndent = (lineText.match(/^(\s*)/) ?? ['', ''])[1] ?? '';

      editor
        .edit(eb => {
          const range = new vscode.Range(
            new vscode.Position(startLine, 0),
            new vscode.Position(endLine, document.lineAt(endLine).text.length),
          );
          if (isMultiLine) {
            eb.replace(range, collapseFormatInclude(fullTagText));
          } else {
            const parsed = parseIncludeTag(fullTagText);
            if (parsed && parsed.props.some(p => p.hasHTML)) {
              eb.replace(range, prettyFormatInclude(fullTagText, baseIndent));
            }
          }
        })
        .then(undefined, (err: unknown) => logError('Failed to toggle include from CodeLens', err));
    },
  );
}
