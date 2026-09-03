/**
 * CMD-020 — django-language-service.showLog
 * Shows the extension output channel (log window).
 *
 * Contributed to the Command Palette: it is the target of the diagram
 * panel's "Show log" toast action and of its `enableCommandUris`, so a user
 * who sees that link must also be able to reach the log directly.
 */
import * as vscode from 'vscode';
import type { AdapterServices } from '$adapters/types';
import { cmdId, registerCmd } from '$adapters/_shared/command-helper';
import { showOutputChannel } from '$shared/logger';

export function register(
  _ctx: vscode.ExtensionContext,
  _services: AdapterServices,
): vscode.Disposable {
  return registerCmd(cmdId('showLog'), () => {
    showOutputChannel();
  });
}
