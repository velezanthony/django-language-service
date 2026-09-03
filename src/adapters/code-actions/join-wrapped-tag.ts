/**
 * "Join tag into one line" — offered when the cursor sits in a `{% … %}` or
 * `{{ … }}` that wraps.
 *
 * A wrapped tag is valid Django: its lexer is
 * `re.compile(r"({%.*?%}|{{.*?}}|{#.*?#})", re.DOTALL)`. So there is no
 * diagnostic here and no squiggle — flagging correct code is the noise this
 * project spent a long day removing. The action is simply available under
 * Ctrl+. for anyone who wants it, and invisible to anyone who does not.
 *
 * RefactorRewrite rather than QuickFix, because nothing is broken.
 */
import * as vscode from 'vscode';
import { joinWrappedTag } from '$domain/parsers/_shared/dtl-lexer';
import type { AdapterServices } from '$adapters/types';
import { DTL_SELECTOR } from '$adapters/_shared/languages';
import { logError } from '$shared/logger';

const PROVIDED_KINDS: readonly vscode.CodeActionKind[] = [vscode.CodeActionKind.RefactorRewrite];

class JoinWrappedTagProvider implements vscode.CodeActionProvider {
  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
  ): vscode.CodeAction[] {
    try {
      const joined = joinWrappedTag(document.getText(), document.offsetAt(range.start));
      if (!joined) return [];

      const action = new vscode.CodeAction(
        'Join tag into one line',
        vscode.CodeActionKind.RefactorRewrite,
      );
      action.edit = new vscode.WorkspaceEdit();
      action.edit.replace(
        document.uri,
        new vscode.Range(document.positionAt(joined.start), document.positionAt(joined.end)),
        joined.text,
      );
      return [action];
    } catch (err) {
      logError('Join wrapped tag failed', err);
      return [];
    }
  }
}

export function register(
  _ctx: vscode.ExtensionContext,
  _services: AdapterServices,
): vscode.Disposable {
  return vscode.languages.registerCodeActionsProvider(DTL_SELECTOR, new JoinWrappedTagProvider(), {
    providedCodeActionKinds: [...PROVIDED_KINDS],
  });
}
