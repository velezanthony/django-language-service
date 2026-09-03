/**
 * PRV-002, DTL-011 — DTL tag-pair highlight provider.
 *
 * When the cursor is inside a DTL block tag (e.g., `{% if %}`, `{% for %}`,
 * `{% block name %}`), highlights the matching opener/closer pair and any
 * mid-level tags (`{% else %}`, `{% elif %}`).
 *
 * The pairing itself lives in `./tag-pairs`, which has no vscode import and so
 * can be tested. It had none, and the mid-level half of the sentence above was
 * not true: from an opener only the closer came back.
 *
 * Delegates block-opener discovery to `domain/formatting/dtl-parser`.
 */
import * as vscode from 'vscode';
import type { AdapterServices } from '$adapters/types';
import { discoverBlockOpeners } from '$domain/formatting/dtl-parser';
import { DTL_SELECTOR } from '$adapters/_shared/languages';

import { findMatchingTags } from './tag-pairs';

// ── Provider ──

class DtlTagPairHighlightProvider implements vscode.DocumentHighlightProvider {
  provideDocumentHighlights(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.DocumentHighlight[] | undefined {
    const source = document.getText();
    const offset = document.offsetAt(position);
    const blockOpeners = discoverBlockOpeners(source);

    const matches = findMatchingTags(source, offset, blockOpeners);
    if (matches.length === 0) return undefined;

    return matches.map(tag => {
      const startPos = document.positionAt(tag.start);
      const endPos = document.positionAt(tag.end);
      return new vscode.DocumentHighlight(
        new vscode.Range(startPos, endPos),
        vscode.DocumentHighlightKind.Read,
      );
    });
  }
}

export function register(
  _ctx: vscode.ExtensionContext,
  _services: AdapterServices,
): vscode.Disposable {
  return vscode.languages.registerDocumentHighlightProvider(
    DTL_SELECTOR,
    new DtlTagPairHighlightProvider(),
  );
}
