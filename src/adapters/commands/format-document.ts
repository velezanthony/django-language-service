/**
 * CMD-006 — django-language-service.formatDocument
 * Delegates to the built-in editor.action.formatDocument command.
 *
 * In the OLD repo this command was declared in package.json but never
 * registered with registerCommand — a bug. This adapter fixes it.
 * The actual formatting is handled by the DocumentFormattingEditProvider
 * (adapters/formatting/index.ts, registered separately).
 */
import * as vscode from 'vscode';
import type { AdapterServices } from '$adapters/types';
import { cmdId, registerCmd } from '$adapters/_shared/command-helper';

export function register(
  _ctx: vscode.ExtensionContext,
  _services: AdapterServices,
): vscode.Disposable {
  return registerCmd(cmdId('formatDocument'), () => {
    vscode.commands.executeCommand('editor.action.formatDocument');
  });
}
