/**
 * Commands barrel — registers ALL 17 command adapters in one call.
 *
 * Usage from extension.ts or ADAPTERS barrel:
 *   import { commandsAdapter } from './commands';
 *   ctx.subscriptions.push(commandsAdapter.register(ctx, services));
 */
import * as vscode from 'vscode';
import type { Adapter, AdapterServices } from '$adapters/types';

import { register as registerClearDiagnostics } from './clear-diagnostics';
import { register as registerCollapseAllIncludes } from './collapse-all-includes';
import { register as registerCollapseInclude } from './collapse-include';
import { register as registerExpandAllIncludes } from './expand-all-includes';
import { register as registerFocusDebtSidebar } from './focus-debt-sidebar';
import { register as registerFormatDocument } from './format-document';
import { register as registerPickView } from './pick-view';
import { register as registerPrettyInclude } from './pretty-include';
import { register as registerRefreshViewContext } from './refresh-view-context';
import { register as registerShowModelDiagram } from './show-model-diagram';
import { register as registerToggleComment } from './toggle-comment';
import { register as registerToggleLiveForView } from './toggle-live-for-view';
import { register as registerValidateContext } from './validate-context';
import { register as registerShowLog } from './show-log';
// Internal — NOT in package.json
import { register as registerCodeLensToggleInclude } from './codelens-toggle-include';
import { register as registerToggleLiveByName } from './toggle-live-by-name';
import { register as registerValidateByName } from './validate-by-name';

/** Combined adapter: 17 modules, 15 command ids, one `register()` call.
 *  The counts differ because three modules are deliberate no-ops (their command
 *  is registered by the adapter that owns the state) and `toggle-live-for-view`
 *  registers both `toggleLiveForView` and `toggleLiveForViewOff`. */
export const commandsAdapter: Adapter = {
  id: 'commands',
  register(ctx: vscode.ExtensionContext, services: AdapterServices): vscode.Disposable {
    return vscode.Disposable.from(
      registerClearDiagnostics(ctx, services),
      registerCollapseAllIncludes(ctx, services),
      registerCollapseInclude(ctx, services),
      registerExpandAllIncludes(ctx, services),
      registerFocusDebtSidebar(ctx, services),
      registerFormatDocument(ctx, services),
      registerPickView(ctx, services),
      registerPrettyInclude(ctx, services),
      registerRefreshViewContext(ctx, services),
      registerShowModelDiagram(ctx, services),
      registerToggleComment(ctx, services),
      registerToggleLiveForView(ctx, services),
      registerValidateContext(ctx, services),
      registerShowLog(ctx, services),
      // internal
      registerCodeLensToggleInclude(ctx, services),
      registerToggleLiveByName(ctx, services),
      registerValidateByName(ctx, services),
    );
  },
};
