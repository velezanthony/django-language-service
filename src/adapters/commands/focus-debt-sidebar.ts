/**
 * CMD-005 — django-language-service.focusDebtSidebar
 * Focuses the Orphans & Debt sidebar panel.
 */
import * as vscode from 'vscode';
import type { AdapterServices } from '$adapters/types';
import { cmdId, registerCmd } from '$adapters/_shared/command-helper';

export function register(
  _ctx: vscode.ExtensionContext,
  _services: AdapterServices,
): vscode.Disposable {
  return registerCmd(cmdId('focusDebtSidebar'), () => {
    vscode.commands.executeCommand('djangoOrphans.focus');
  });
}
