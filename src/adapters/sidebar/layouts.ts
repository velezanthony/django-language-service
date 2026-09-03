/**
 * WV-002 — Django sidebar "Layouts" section webview adapter.
 *
 * Registers the WebviewViewProvider for the `djangoLayouts` view.
 * Pushed when the project snapshot changes (re-scan or first scan).
 * Shows base templates (extended by others) and partials (included by others).
 */
import * as vscode from 'vscode';
import type { AdapterServices } from '$adapters/types';
import { SidebarWebviewProvider } from './_shared/webview-provider';
import { buildSidebarPayload } from './sidebar-data';
import { logError } from '$shared/logger';

const VIEW_ID = 'djangoLayouts';

export function register(
  ctx: vscode.ExtensionContext,
  services: AdapterServices,
): vscode.Disposable {
  const provider = new SidebarWebviewProvider('layouts', ctx.extensionUri);
  const registration = vscode.window.registerWebviewViewProvider(VIEW_ID, provider);

  const push = (): void => {
    try {
      const project = services.getProject();
      provider.setData(buildSidebarPayload('layouts', project).data);
    } catch (err) {
      logError('sidebar/layouts push failed', err);
    }
  };

  push();

  const projectChange = services.onProjectChange?.(() => push());
  if (projectChange) return vscode.Disposable.from(registration, projectChange);
  return registration;
}
