/**
 * PRV-006, DTL-005 — Django Template Folding Range Provider.
 *
 * Thin VS Code adapter. All logic lives in `domain/folding/folding-ranges.ts`.
 * Delegates to the pure `getFoldingRanges(lines)` helper, then maps the
 * domain `FoldingRange` objects to `vscode.FoldingRange` instances.
 */
import * as vscode from 'vscode';
import type { AdapterServices } from '$adapters/types';
import { getFoldingRanges, FoldingRangeKind } from '$domain/folding/folding-ranges';
import { logError } from '$shared/logger';
import { DTL_SELECTOR } from '$adapters/_shared/languages';

class DjangoFoldingRangeProvider implements vscode.FoldingRangeProvider {
  provideFoldingRanges(document: vscode.TextDocument): vscode.FoldingRange[] {
    try {
      const lines: string[] = [];
      for (let i = 0; i < document.lineCount; i++) {
        lines.push(document.lineAt(i).text);
      }

      return getFoldingRanges(lines).map(r => {
        const kind =
          r.kind === FoldingRangeKind.Comment
            ? vscode.FoldingRangeKind.Comment
            : r.kind === FoldingRangeKind.Imports
              ? vscode.FoldingRangeKind.Imports
              : vscode.FoldingRangeKind.Region;
        return new vscode.FoldingRange(r.start, r.end, kind);
      });
    } catch (err) {
      logError('Folding range computation failed', err);
      return [];
    }
  }
}

export function register(
  _ctx: vscode.ExtensionContext,
  _services: AdapterServices,
): vscode.Disposable {
  return vscode.languages.registerFoldingRangeProvider(
    DTL_SELECTOR,
    new DjangoFoldingRangeProvider(),
  );
}
