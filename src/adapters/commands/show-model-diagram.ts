/**
 * CMD-014 — showModelDiagram. `adapters/diagram/panel.ts` owns the panel and
 * registers the handler; this `register()` is a no-op so the barrel can list
 * the command. panel MUST come before commandsAdapter in ADAPTERS.
 */
import type * as vscode from 'vscode';
import type { AdapterServices } from '$adapters/types';

export function register(
  _ctx: vscode.ExtensionContext,
  _services: AdapterServices,
): vscode.Disposable {
  return {
    dispose(): void {
      /* intentional no-op */
    },
  };
}
