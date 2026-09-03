/**
 * CMD-010 — django-language-service.pickView
 * Opens a VS Code QuickPick to choose a view for context validation.
 */
import * as vscode from 'vscode';
import type { AdapterServices } from '$adapters/types';
import { cmdId, registerCmd } from '$adapters/_shared/command-helper';

export function register(
  _ctx: vscode.ExtensionContext,
  services: AdapterServices,
): vscode.Disposable {
  return registerCmd(cmdId('pickView'), async () => {
    const project = services.getProject();

    const items = project.views.all().map(v => ({
      label: v.name,
      description: v.templateName ?? '',
      detail: `${v.isClass ? 'CBV' : 'FBV'} — ${v.contextKeys.length} context keys`,
      view: v,
    }));

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a Django view to validate context',
      matchOnDescription: true,
    });

    if (picked) {
      vscode.commands.executeCommand(cmdId('validateContext'), { view: picked.view });
    }
  });
}
