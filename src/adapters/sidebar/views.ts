/**
 * WV-001 — Django sidebar "Views" section webview adapter.
 *
 * Registers the WebviewViewProvider for the `djangoViews` view declared in
 * package.json. Responds to `scanner.onDidChange` to push
 * fresh sidebar data whenever the project snapshot updates.
 *
 * Uses the shared `SidebarWebviewProvider` class. The active editor path is
 * read at push time so the views section can switch between 'chain' mode
 * (active file is a template) and 'no-template' mode.
 */
import * as vscode from 'vscode';
import type { AdapterServices } from '$adapters/types';
import { cmdId, registerCmd } from '$adapters/_shared/command-helper';
import { SidebarWebviewProvider } from './_shared/webview-provider';
import { buildSidebarPayload } from './sidebar-data';
import { getLiveViewKey } from './compare-state';
import { logError } from '$shared/logger';

const VIEW_ID = 'djangoViews';

export function register(
  ctx: vscode.ExtensionContext,
  services: AdapterServices,
): vscode.Disposable {
  const provider = new SidebarWebviewProvider('views', ctx.extensionUri);
  const registration = vscode.window.registerWebviewViewProvider(VIEW_ID, provider);

  const push = (): void => {
    try {
      const project = services.getProject();
      const liveViewKey = getLiveViewKey(ctx.workspaceState) ?? null;
      const activeFsPath = vscode.window.activeTextEditor?.document.uri.fsPath;
      const payload = buildSidebarPayload('views', project, liveViewKey, activeFsPath);
      provider.setData(payload.data);
    } catch (err) {
      logError('sidebar/views push failed', err);
    }
  };

  // Push on editor change so chain-view updates when user switches templates
  const editorChange = vscode.window.onDidChangeActiveTextEditor(() => push());
  // Push when project snapshot changes (scanner rescan)
  const projectChange = services.onProjectChange?.(() => push());
  // Internal runtime-only command (not in package.json — same pattern as
  // toggleLiveByName): lets the live-mode toggle commands re-publish the
  // views payload immediately so the ⚡ indicator doesn't stay stale until
  // the next editor/project event.
  const refreshCmd = registerCmd(cmdId('refreshViewsSidebar'), () => push());
  // Initial push
  push();

  const disposables: vscode.Disposable[] = [registration, editorChange, refreshCmd];
  if (projectChange) disposables.push(projectChange);
  return vscode.Disposable.from(...disposables);
}
