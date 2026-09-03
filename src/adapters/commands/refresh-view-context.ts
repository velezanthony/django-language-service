/**
 * CMD-012 — django-language-service.refreshViewContext
 * Clears file cache and triggers a full workspace rescan via the Scanner.
 *
 * Uses `services.getScanner()` (optional in AdapterServices) to re-run the
 * workspace scan. When the scan completes, Scanner fires `onDidChange` and
 * all subscribed adapters (diagnostics, sidebar, file-decoration) refresh
 * automatically. Falls back to a context-key notification when no scanner
 * is available (e.g. in tests or before extension.ts provides one).
 */
import * as vscode from 'vscode';
import type { AdapterServices } from '$adapters/types';
import { cmdId, registerCmd } from '$adapters/_shared/command-helper';
import { logInfo, logError } from '$shared/logger';

export function register(
  _ctx: vscode.ExtensionContext,
  services: AdapterServices,
): vscode.Disposable {
  return registerCmd(cmdId('refreshViewContext'), () => {
    const scanner = services.getScanner?.();
    if (scanner) {
      logInfo('refreshViewContext: triggering full workspace rescan…');
      const roots = vscode.workspace.workspaceFolders?.map(f => f.uri.fsPath) ?? [];
      scanner.scan(roots).catch((err: unknown) => {
        logError('refreshViewContext: rescan failed', err);
      });
    } else {
      // Fallback: notify listeners via context key (e.g. during tests)
      logInfo('refreshViewContext: no scanner available — posting context key notification');
      vscode.commands.executeCommand('setContext', 'django.refreshRequested', Date.now());
    }
  });
}
