/**
 * Reusable SidebarWebviewProvider — one instance per sidebar section.
 *
 * Shared by views.ts, layouts.ts, orphans.ts, models.ts. Each section
 * passes its section ID; the HTML body carries `data-section="{id}"` so
 * the sidebar-app.js bundle mounts the correct Svelte component.
 *
 * Message protocol (extension → webview):
 *   { type: 'data', payload: SidebarPayload }
 *
 * Message protocol (webview → extension):
 *   { type: 'ready' }               → flush pendingPayload
 *   { type: 'openModelDiagram' }    → execute showModelDiagram command
 *   { type: 'openFile', file, line }→ navigate editor to file
 *   { type: 'toggleLiveForView', viewKey } → toggle live validation
 *   { type: 'validateForView', viewKey }   → run validation for view
 *   (viewKey = qualified '<app>.<name>' index key, NOT the display name)
 */
import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { cmdId } from '$adapters/_shared/command-helper';
import { logError } from '$shared/logger';
import type {
  SidebarDataMessage,
  SidebarSectionPayload,
  SidebarInbound,
  SidebarOpenFileMessage,
  SidebarToggleLiveMessage,
  SidebarValidateMessage,
} from '$shared/protocol';

export type SidebarSectionId = 'views' | 'layouts' | 'orphans' | 'models';

/**
 * The 0-based line `vscode.Position` will accept, for any 1-based line the
 * webview sends.
 *
 * The protocol declares `line` required, and the webview does not honour that:
 * a template row in the Views chain carries only `{ file }`, so `line` arrives
 * `undefined` and `line - 1` is NaN. `new vscode.Position(NaN, 0)` puts the
 * cursor nowhere and reports nothing — the row looked dead. Anything that is
 * not a usable line means "the top of the file", which is what a caller with no
 * line to offer wants.
 */
function zeroBasedLine(line: unknown): number {
  return typeof line === 'number' && Number.isFinite(line) ? Math.max(0, Math.trunc(line) - 1) : 0;
}

export class SidebarWebviewProvider implements vscode.WebviewViewProvider {
  private readonly section: SidebarSectionId;
  private readonly extensionUri: vscode.Uri;
  private view: vscode.WebviewView | undefined;

  /**
   * Latest data payload. Cached so:
   *  1. A late-arriving `ready` message can flush it after mount.
   *  2. Visibility-toggle cycles (VS Code disposes + re-resolves the view)
   *     re-paint correctly without needing a new push.
   */
  private pendingPayload: SidebarSectionPayload | null = null;

  constructor(section: SidebarSectionId, extensionUri: vscode.Uri) {
    this.section = section;
    this.extensionUri = extensionUri;
  }

  getView(): vscode.WebviewView | undefined {
    return this.view;
  }

  /** Push a new data payload to the section webview.
   *  Always caches so the next resolve can replay it. */
  setData(payload: SidebarSectionPayload): void {
    this.pendingPayload = payload;
    const msg: SidebarDataMessage = { type: 'data', payload };
    this.view?.webview.postMessage(msg);
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist')],
    };

    webviewView.webview.html = this.buildHtml(webviewView.webview);
    // `void` used to drop the rejection: clicking a row whose file had been
    // moved or deleted did nothing at all — no toast, no log line, and the
    // user had no way to tell the click from a dead sidebar.
    webviewView.webview.onDidReceiveMessage((msg: SidebarInbound) => {
      this.onMessage(msg).catch((err: unknown) => {
        logError(`sidebar action '${String((msg as { type?: unknown }).type)}' failed`, err);
        if ((msg as { type?: unknown }).type === 'openFile') {
          void vscode.window.showWarningMessage(
            'Could not open that file — it may have been moved or deleted.',
          );
        }
      });
    });
    // Only the view this callback belongs to. VS Code disposes and re-resolves
    // a sidebar view on every collapse/expand, and the dispose notification for
    // the OLD one can land after the NEW one is already attached. Clearing
    // unconditionally detached the LIVE view: the section painted once and then
    // went stale forever, with nothing logged and nothing to see.
    webviewView.onDidDispose(() => {
      if (this.view === webviewView) this.view = undefined;
    });
    // Pull-based handshake: webview posts `ready` when its listener is live.
    // We flush pendingPayload at that point instead of using a setTimeout race.
  }

  private async onMessage(raw: unknown): Promise<void> {
    if (!raw || typeof raw !== 'object') return;
    // Treat as SidebarInbound — the `type` field drives the switch
    const msg = raw as SidebarInbound;

    switch (msg.type) {
      case 'ready': {
        if (this.pendingPayload !== null) {
          const out: SidebarDataMessage = { type: 'data', payload: this.pendingPayload };
          this.view?.webview.postMessage(out);
        }
        return;
      }

      case 'openModelDiagram':
        await vscode.commands.executeCommand(cmdId('showModelDiagram'));
        return;

      case 'openFile': {
        const { file, line } = msg as SidebarOpenFileMessage;
        if (!file) return;
        const uri = vscode.Uri.file(file);
        const doc = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(doc, {
          preview: false,
          viewColumn: vscode.ViewColumn.One,
        });
        const pos = new vscode.Position(zeroBasedLine(line), 0);
        editor.selection = new vscode.Selection(pos, pos);
        editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
        return;
      }

      case 'toggleLiveForView': {
        const { viewKey } = msg as SidebarToggleLiveMessage;
        if (!viewKey) return;
        await vscode.commands.executeCommand(cmdId('toggleLiveByName'), viewKey);
        return;
      }

      case 'validateForView': {
        const { viewKey } = msg as SidebarValidateMessage;
        if (!viewKey) return;
        await vscode.commands.executeCommand(cmdId('validateByName'), viewKey);
        return;
      }
    }
  }

  private buildHtml(webview: vscode.Webview): string {
    const nonce = crypto.randomBytes(16).toString('hex');
    // tailwind.css = Tailwind utility classes (fonts, colours, spacing…)
    // sidebar-app.css = esbuild-svelte scoped CSS (@keyframes fadeIn from SidebarSection.svelte)
    //
    // These are separate files on purpose: esbuild names extracted CSS after
    // the bundle's outfile, so Tailwind writing to dist/diagram-app.css was one
    // `<style>` block in a diagram component away from being overwritten by it.
    const tailwindCssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'tailwind.css'),
    );
    const sidebarCssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'sidebar-app.css'),
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'sidebar-app.js'),
    );
    const csp = [
      "default-src 'none'",
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`,
      `img-src ${webview.cspSource} data:`,
      `font-src ${webview.cspSource}`,
    ].join('; ');

    return /* html */ `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<link rel="stylesheet" href="${tailwindCssUri}">
<link rel="stylesheet" href="${sidebarCssUri}">
<style>
  :root { color-scheme: dark; }
  html, body { height: 100%; margin: 0; }
  body {
    background: var(--vscode-sideBar-background, var(--vscode-editor-background));
    color: var(--vscode-foreground);
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    /* When a section has more rows than the webview is tall, scroll instead of
       clipping. Without this the content silently overflows off the bottom
       (e.g. the last orphan/partial gets cut in half). */
    overflow-y: auto;
  }
  #sidebar-root { display: flex; flex-direction: column; min-height: 100%; }
</style>
</head>
<body data-section="${this.section}" class="font-vsc text-vsc-fg bg-vsc-bg">
  <div id="sidebar-root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
