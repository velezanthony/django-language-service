/**
 * CMD-016 — django-language-service.toggleLiveForView
 * Enables live context validation for a view (radio: same view toggles off).
 *
 * CMD-017 — django-language-service.toggleLiveForViewOff
 * Explicit OFF — clears whatever view is live. It deliberately does NOT
 * share the radio-toggle handler: invoking "Disable Live Validation" must
 * never be able to turn Live Mode on.
 *
 * Live Mode identity is the QUALIFIED view key '<app>.<name>' (the scanner's
 * index key). Callers may pass a full View object ({ name, filePath }) or a
 * bare name — the handler resolves it to the qualified key before storing.
 * The state flip + sidebar re-publish + diagnostics refresh live in
 * $adapters/_shared/live-mode.ts.
 */
import * as vscode from 'vscode';
import type { AdapterServices } from '$adapters/types';
import { cmdId, registerCmd } from '$adapters/_shared/command-helper';
import {
  disableLiveAndRefresh,
  toggleLiveAndRefresh,
  endLiveOnDocumentSwitch,
} from '$adapters/_shared/live-mode';
import { viewKey } from '$infra/view-key';

type ViewItem = { readonly name?: string; readonly filePath?: string; readonly key?: string };

/** Resolve whatever the caller passed into the qualified index key. */
function resolveViewKey(item: ViewItem | undefined, services: AdapterServices): string | undefined {
  if (!item) return undefined;
  if (item.key) return item.key;
  if (item.filePath && item.name) return viewKey({ filePath: item.filePath, name: item.name });
  if (item.name) {
    // Bare name (legacy tree items) — find the matching view in the index.
    const match = services
      .getProject()
      .views.all()
      .find(v => v.name === item.name);
    return match ? viewKey(match) : undefined;
  }
  return undefined;
}

function makeHandler(ctx: vscode.ExtensionContext, services: AdapterServices) {
  return (item: ViewItem | undefined) => {
    const key = resolveViewKey(item, services);
    if (!key) return;
    void toggleLiveAndRefresh(ctx.workspaceState, key);
  };
}

export function register(
  ctx: vscode.ExtensionContext,
  services: AdapterServices,
): vscode.Disposable {
  const d1 = registerCmd(cmdId('toggleLiveForView'), makeHandler(ctx, services));
  const d2 = registerCmd(cmdId('toggleLiveForViewOff'), () => {
    void disableLiveAndRefresh(ctx.workspaceState);
  });
  // Live Mode belongs to the template it was enabled in; moving to another one
  // ends it silently.
  const d3 = vscode.window.onDidChangeActiveTextEditor(editor => {
    void endLiveOnDocumentSwitch(ctx.workspaceState, editor);
  });
  return vscode.Disposable.from(d1, d2, d3);
}
