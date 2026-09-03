/**
 * CMD-022 (internal) — django-language-service.validateByName
 * Validates context for a view by its QUALIFIED key '<app>.<name>' (posted by
 * the sidebar webview). NOT declared in package.json — runtime only.
 *
 * Forwards to validateContext, whose real handler lives with the
 * diagnostics adapter (adapters/diagnostics/context-vars.ts).
 */
import * as vscode from 'vscode';
import type { AdapterServices } from '$adapters/types';
import { cmdId, registerCmd } from '$adapters/_shared/command-helper';
import { logInfo } from '$shared/logger';

export function register(
  _ctx: vscode.ExtensionContext,
  _services: AdapterServices,
): vscode.Disposable {
  return registerCmd(cmdId('validateByName'), (viewKey: string) => {
    if (!viewKey) return;
    logInfo(`validateByName: "${viewKey}"`);
    vscode.commands.executeCommand(cmdId('validateContext'), { view: { key: viewKey } });
  });
}
