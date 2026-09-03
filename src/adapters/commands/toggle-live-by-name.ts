/**
 * CMD-021 (internal) — django-language-service.toggleLiveByName
 * Toggles live validation by QUALIFIED view key '<app>.<name>' (posted by the
 * sidebar webview → webview-provider). NOT declared in package.json — runtime only.
 *
 * The heavy lifting (state flip + sidebar re-publish + diagnostics
 * recompute/clear) lives in $adapters/_shared/live-mode.ts.
 */
import * as vscode from 'vscode';
import type { AdapterServices } from '$adapters/types';
import { cmdId, registerCmd } from '$adapters/_shared/command-helper';
import { toggleLiveAndRefresh } from '$adapters/_shared/live-mode';

export function register(
  ctx: vscode.ExtensionContext,
  _services: AdapterServices,
): vscode.Disposable {
  return registerCmd(cmdId('toggleLiveByName'), (viewKey: string) => {
    if (!viewKey) return;
    void toggleLiveAndRefresh(ctx.workspaceState, viewKey);
  });
}
