/**
 * Shared Live Mode toggle pipeline — used by both toggle commands
 * (toggleLiveByName from the sidebar webview, toggleLiveForView from the
 * command palette / context menus).
 *
 * Ports the legacy behavior (OLD src/core/view-context/index.ts →
 * toggleLiveByName / enableLiveForView / disableLive): flipping the state is
 * not enough — the sidebar payload must be re-published (⚡ indicator) and
 * the context-var diagnostics recomputed/cleared immediately, otherwise the
 * UI stays stale until the next editor or project event.
 *
 * `viewKey` is ALWAYS the qualified '<app>.<name>' index key (see
 * $infra/view-key) so every reader can resolve it via `project.views.byKey()`.
 */
import * as vscode from 'vscode';
import { cmdId } from './command-helper';
import {
  LIVE_VIEW_KEY,
  disableLiveViewKey,
  toggleLiveViewKey,
  getLiveDocument,
  setLiveDocument,
  liveSwitchAction,
} from '$adapters/sidebar/compare-state';
import { DTL_LANGUAGES } from './languages';
import { logError, logInfo } from '$shared/logger';

export async function toggleLiveAndRefresh(
  state: vscode.Memento,
  viewKey: string,
): Promise<string | undefined> {
  const next = await toggleLiveViewKey(state, viewKey);
  // Remember which template the choice was made in — see LIVE_DOC_KEY.
  await setLiveDocument(state, next ? activeTemplateUri() : undefined);
  return refreshAfter(next);
}

function activeTemplateUri(): string | undefined {
  const doc = vscode.window.activeTextEditor?.document;
  return doc && DTL_LANGUAGES.has(doc.languageId) ? doc.uri.toString() : undefined;
}

/**
 * Drop Live Mode when the user moves to a different template.
 *
 * Silent by design: no prompt, no toast. The sidebar's ⚡ going out is the
 * feedback, and re-enabling is one click. Switching to a .py file and back
 * keeps it on — only landing on ANOTHER template ends it.
 */
export async function endLiveOnDocumentSwitch(
  state: vscode.Memento,
  editor: vscode.TextEditor | undefined,
): Promise<void> {
  const doc = editor?.document;
  const action = liveSwitchAction({
    liveViewKey: state.get<string>(LIVE_VIEW_KEY),
    owner: getLiveDocument(state),
    docUri: doc?.uri.toString(),
    isTemplate: !!doc && DTL_LANGUAGES.has(doc.languageId),
  });
  if (action === 'keep') return;
  if (action === 'adopt') {
    await setLiveDocument(state, doc!.uri.toString());
    return;
  }
  await disableLiveViewKey(state);
  await setLiveDocument(state, undefined);
  await refreshAfter(undefined);
}

/** Explicit OFF — never turns Live Mode on, whatever the current selection is. */
export async function disableLiveAndRefresh(state: vscode.Memento): Promise<void> {
  const next = await disableLiveViewKey(state);
  await setLiveDocument(state, undefined);
  await refreshAfter(next);
}

/** Shared post-flip pipeline: context key, sidebar re-publish, diagnostics. */
async function refreshAfter(next: string | undefined): Promise<string | undefined> {
  logInfo(next ? `Live validation: ON for ${next}` : 'Live validation: OFF');

  try {
    // Sync VS Code context key (menus / when-clauses).
    await vscode.commands.executeCommand('setContext', LIVE_VIEW_KEY, next ?? '');
    // Re-publish the views payload so the ⚡ indicator updates immediately
    // (internal command owned by adapters/sidebar/views.ts).
    await vscode.commands.executeCommand(cmdId('refreshViewsSidebar'));

    if (next) {
      // Recompute context-var diagnostics for the active document against the
      // newly live view (real handler owned by adapters/diagnostics/context-vars.ts).
      await vscode.commands.executeCommand(cmdId('validateContext'), { view: { key: next } });
    } else {
      // Legacy disableLive() cleared the whole collection.
      await vscode.commands.executeCommand(cmdId('clearContextDiagnostics'));
    }
  } catch (err) {
    logError('Live Mode refresh after toggle failed', err);
  }

  return next;
}
