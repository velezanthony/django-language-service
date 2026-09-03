/**
 * CMD-018 — validateContext. The real handler lives in
 * `adapters/diagnostics/context-vars.ts`, which owns the collection; this
 * `register()` is a no-op so the barrel can list the command without
 * registering it twice.
 */
import type * as vscode from 'vscode';
import type { AdapterServices } from '$adapters/types';

export function register(
  _ctx: vscode.ExtensionContext,
  _services: AdapterServices,
): vscode.Disposable {
  // No-op: validateContext is registered by adapters/diagnostics/context-vars.ts.
  return {
    dispose(): void {
      /* intentional no-op */
    },
  };
}
