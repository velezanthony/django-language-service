/**
 * WV-003 — Django sidebar "Orphans" section webview adapter.
 *
 * Registers the WebviewViewProvider for the `djangoOrphans` view.
 * Shows templates that no view renders and that no other template extends/includes.
 */
import * as vscode from 'vscode';
import type { AdapterServices } from '$adapters/types';
import { SidebarWebviewProvider } from './_shared/webview-provider';
import { buildSidebarPayload } from './sidebar-data';
import { logError } from '$shared/logger';

const VIEW_ID = 'djangoOrphans';

export function register(
  ctx: vscode.ExtensionContext,
  services: AdapterServices,
): vscode.Disposable {
  const provider = new SidebarWebviewProvider('orphans', ctx.extensionUri);
  const registration = vscode.window.registerWebviewViewProvider(VIEW_ID, provider);

  const push = (): void => {
    try {
      const project = services.getProject();
      provider.setData(buildSidebarPayload('orphans', project).data);
    } catch (err) {
      logError('sidebar/orphans push failed', err);
    }
  };

  push();

  const projectChange = services.onProjectChange?.(() => push());
  if (projectChange) return vscode.Disposable.from(registration, projectChange);
  return registration;
}
