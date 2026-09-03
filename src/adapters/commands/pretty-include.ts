/**
 * CMD-011 — django-language-service.prettyInclude
 * Expands a single {% include %} tag attrs to pretty multi-line HTML format.
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

function findIncludeAtLine(
  document: vscode.TextDocument,
  lineNumber: number,
): { tagText: string; startLine: number; endLine: number } | null {
  const lineText = document.lineAt(lineNumber).text;

  if (INCLUDE_TAG_PATTERN.test(lineText)) {
    let endLine = lineNumber;
    let fullTagText = lineText;
    while (!fullTagText.includes('%}') && endLine < document.lineCount - 1) {
      endLine++;
      fullTagText += '\n' + document.lineAt(endLine).text;
    }
    return { tagText: fullTagText, startLine: lineNumber, endLine };
  }

  let searchLine = lineNumber;
  while (searchLine > 0) {
    searchLine--;
    const searchLineText = document.lineAt(searchLine).text;
    if (INCLUDE_TAG_PATTERN.test(searchLineText)) {
      let endLine = searchLine;
      let fullTagText = searchLineText;
      while (!fullTagText.includes('%}') && endLine < document.lineCount - 1) {
        endLine++;
        fullTagText += '\n' + document.lineAt(endLine).text;
      }
      if (lineNumber <= endLine) return { tagText: fullTagText, startLine: searchLine, endLine };
      return null;
    }
    if (/\{%/.test(searchLineText) && !/include/.test(searchLineText)) break;
  }
  return null;
}

export function register(
  _ctx: vscode.ExtensionContext,
  _services: AdapterServices,
): vscode.Disposable {
  return registerCmd(cmdId('prettyInclude'), () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const document = editor.document;
    const tagBounds = findIncludeAtLine(document, editor.selection.active.line);
    if (!tagBounds) {
      vscode.window.showInformationMessage('Cursor is not inside a {% include %} tag.');
      return;
    }

    const { tagText, startLine, endLine } = tagBounds;
    const isMultiLine = startLine !== endLine;
    const baseIndent = (document.lineAt(startLine).text.match(/^(\s*)/) ?? ['', ''])[1] ?? '';

    editor
      .edit(eb => {
        const range = new vscode.Range(
          new vscode.Position(startLine, 0),
          new vscode.Position(endLine, document.lineAt(endLine).text.length),
        );
        if (isMultiLine) {
          eb.replace(range, collapseFormatInclude(tagText));
        } else {
          const parsed = parseIncludeTag(tagText);
          if (!parsed || !parsed.props.some(p => p.hasHTML)) {
            vscode.window.showInformationMessage('No HTML props to expand in this include.');
            return;
          }
          eb.replace(range, prettyFormatInclude(tagText, baseIndent));
        }
      })
      .then(undefined, (err: unknown) => logError('Failed to toggle include', err));
  });
}
