/**
 * WV-004 — Django sidebar "Models" section webview adapter.
 *
 * Registers the WebviewViewProvider for the `djangoModels` view.
 * Shows aggregate model statistics (total count, top apps by model count) and
 * a CTA to open the full model ER diagram panel.
 */
import * as vscode from 'vscode';
import type { AdapterServices } from '$adapters/types';
import { SidebarWebviewProvider } from './_shared/webview-provider';
import { buildSidebarPayload } from './sidebar-data';
import { logError } from '$shared/logger';

const VIEW_ID = 'djangoModels';

export function register(
  ctx: vscode.ExtensionContext,
  services: AdapterServices,
): vscode.Disposable {
  const provider = new SidebarWebviewProvider('models', ctx.extensionUri);
  const registration = vscode.window.registerWebviewViewProvider(VIEW_ID, provider);

  const push = (): void => {
    try {
      const project = services.getProject();
      provider.setData(buildSidebarPayload('models', project).data);
    } catch (err) {
      logError('sidebar/models push failed', err);
    }
  };

  push();

  const projectChange = services.onProjectChange?.(() => push());
  if (projectChange) return vscode.Disposable.from(registration, projectChange);
  return registration;
}
