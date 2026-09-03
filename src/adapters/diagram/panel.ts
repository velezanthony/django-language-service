/**
 * WV-005, DGM-001..DGM-024 — Django Model Diagram panel adapter.
 *
 * Extension-side lifecycle for the model ER diagram WebviewPanel. The
 * diagram webview content (the Svelte/canvas bundle) lives in
 * `dist/diagram-app.js`. This adapter handles:
 *
 *  - Panel creation / focus-or-create singleton
 *  - Rendering initial HTML scaffold (empty-state or full diagram)
 *  - Live reload: re-renders when Scanner fires `onDidChange`
 *  - Inbound message routing from the webview:
 *      { type: 'refresh' }                → trigger refreshViewContext
 *      { type: 'navigate', model }        → open model source file in editor
 *      { type: 'webviewError', message }  → log + optional error toast
 *
 * The adapter is `register()`-able: it registers the showModelDiagram command
 * handler using the full panel lifecycle. `adapters/commands/show-model-diagram.ts`
 * is a deliberate no-op that defers to this file, which is why diagram/panel
 * MUST stay listed BEFORE commandsAdapter in the ADAPTERS barrel.
 *
 * NOTE: The panel itself should be a singleton — if one is already open,
 * `reveal()` it and update its data instead of creating a second panel.
 */
import * as vscode from 'vscode';
import * as crypto from 'crypto';
import type { AdapterServices } from '$adapters/types';
import type { Project } from '$infra/types';
import { cmdId } from '$adapters/_shared/command-helper';
import { logError, logInfo } from '$shared/logger';
import { serializeDiagram } from '$domain/diagram/diagram-serializer';
import { safeScriptJson } from './safe-script-json';
import { createBootWatchdog, type RenderedDocument } from './boot-watchdog';
import { describeInboundMessage, inboundMessageType } from './inbound-message';
import type {
  DiagramInbound,
  DiagramNavigateMessage,
  DiagramWebviewErrorMessage,
} from '$shared/protocol';

// ── Panel state ───────────────────────────────────────────────────────────────

let currentPanel: vscode.WebviewPanel | undefined;

/** True once the scanner has reported at least one completed pass. Until then an
 *  empty project means "still scanning" (show the hero), not "no models found". */
let scanSettledOnce = false;

/**
 * A scan finished while the panel was hidden, so its re-render is owed.
 *
 * Rendering swaps `webview.html`, which remounts the whole Svelte app. With
 * `retainContextWhenHidden` the hidden panel is alive to receive that, so
 * every save in another tab used to pay for a full re-render nobody could see
 * — and it tore down whatever transient UI the user had left open. Deferred
 * until the panel is visible again.
 */
let renderOwed = false;

/** How long a mount may take before we call it failed. */
const BOOT_TIMEOUT_MS = 10_000;

/**
 * Fires if `ready` never arrives for a document that should have sent one — a
 * blank panel with no error is a bug.
 *
 * It also answers "did the Svelte app really mount?", which the integration
 * suite reads through the internal `diagramBooted` command: asserting on a
 * tab's title proves only that VS Code opened a tab, which it does even when
 * the bundle fails to parse.
 *
 * The waiting is driven by `documentRendered()`, NOT by the panel opening. Two
 * of the documents this adapter renders — the scanning hero and the "no models
 * found" state — are static HTML with no script and no bundle. Arming on adopt
 * meant an empty workspace was told, ten seconds in, that the diagram "did not
 * finish loading", about a screen that had finished perfectly.
 */
const bootWatchdog = createBootWatchdog({
  timeoutMs: BOOT_TIMEOUT_MS,
  onTimeout: () => {
    if (!currentPanel) return;
    logError('Diagram webview never reported ready — the app did not mount', undefined);
    void vscode.window
      .showWarningMessage(
        'The Django model diagram did not finish loading. See the log for details.',
        'Show log',
      )
      .then(pick => {
        if (pick === 'Show log') return vscode.commands.executeCommand(cmdId('showLog'));
        return undefined;
      });
  },
});

/** Whether the open diagram panel has reported a successful mount. */
export function isDiagramBooted(): boolean {
  return bootWatchdog.isBooted();
}

/** Show the panel (or focus it if already open) with the current project data. */
export function showDiagramPanel(ctx: vscode.ExtensionContext, services: AdapterServices): void {
  const project = services.getProject();

  if (currentPanel) {
    currentPanel.reveal(vscode.ViewColumn.Beside);
    renderPanel(currentPanel, project, ctx.extensionUri);
    return;
  }

  adoptPanel(
    vscode.window.createWebviewPanel(
      'djangoModelDiagram',
      'Django Model Diagram',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        ...webviewOptions(ctx),
      },
    ),
    ctx,
    services,
  );
}

/**
 * The webview's capabilities, in one place.
 *
 * `enableCommandUris` is an ALLOWLIST: exactly these two commands may be
 * invoked from a link in the rendered markup, and nothing else. It is the kind
 * of thing that must be written once — see `adoptPanel`, which used to state it
 * again and got it wrong.
 */
function webviewOptions(ctx: vscode.ExtensionContext): vscode.WebviewOptions {
  return {
    enableScripts: true,
    localResourceRoots: [vscode.Uri.joinPath(ctx.extensionUri, 'dist')],
    enableCommandUris: [cmdId('showLog'), cmdId('refreshViewContext')],
  };
}

/**
 * Take ownership of a panel: wire its messages, view state and disposal, and
 * render it.
 *
 * Shared by the two ways a panel comes into existence — the command creating
 * one, and VS Code handing back a tab it restored after a window reload. The
 * restore path had no wiring at all, so a reloaded window showed a dead frame
 * that the extension did not know about.
 */
function adoptPanel(
  panel: vscode.WebviewPanel,
  ctx: vscode.ExtensionContext,
  services: AdapterServices,
): void {
  // A restored panel arrives with whatever options were serialised, so the
  // options must be re-stated for its webview to load the bundle.
  //
  // They were written out a second time here and the copy was WRONG: it left
  // out `enableCommandUris`, so after a window reload the "Refresh scan" link
  // in the diagram was dead. Stating an allowlist twice is how one of the two
  // ends up saying something nobody meant.
  panel.webview.options = webviewOptions(ctx);

  currentPanel = panel;
  currentPanel.iconPath = new vscode.ThemeIcon('symbol-class');

  // A different panel is taking over: forget the previous one's boot record.
  // The clock starts in renderPanel, once there is a document to wait for.
  bootWatchdog.reset();

  renderPanel(currentPanel, services.getProject(), ctx.extensionUri);

  // Error toast throttle
  let lastErrorToastAt = 0;
  const ERROR_TOAST_GAP_MS = 10_000;

  // VS Code does not await this handler, so a rejection inside it goes
  // nowhere: clicking a row whose file has since been moved simply did
  // nothing, with no toast and no log line to explain it.
  const handleMessage = async (message: DiagramInbound): Promise<void> => {
    // Read through the same guard as the catch below, so a malformed payload
    // falls off the end of the switch instead of throwing on `.type`. Each
    // case re-asserts the shape it needs, exactly as before.
    switch (inboundMessageType(message)) {
      case 'ready':
        bootWatchdog.ready();
        return;

      case 'refresh':
        await vscode.commands.executeCommand(cmdId('refreshViewContext'));
        return;

      case 'webviewError': {
        const err = message as DiagramWebviewErrorMessage;
        const origin = err.filename ? ` at ${err.filename}:${err.line ?? '?'}` : '';
        logError(`[diagram webview]${origin} ${err.message}`, err.stack);
        const now = Date.now();
        if (now - lastErrorToastAt > ERROR_TOAST_GAP_MS) {
          lastErrorToastAt = now;
          const pick = await vscode.window.showWarningMessage(
            `Django Model Diagram error: ${err.message}`,
            'Show log',
          );
          if (pick === 'Show log') {
            await vscode.commands.executeCommand(cmdId('showLog'));
          }
        }
        return;
      }

      case 'navigate': {
        const nav = message as DiagramNavigateMessage;
        const latest = services.getProject();
        const modelKey = nav.model;
        const model =
          latest.models.byKey(modelKey) ??
          latest.models
            .all()
            .find(m => m.name === modelKey || `${m.appLabel}.${m.name}` === modelKey);
        if (!model) return;

        const uri = vscode.Uri.file(model.filePath);
        const line = model.line > 0 ? Math.max(0, model.line - 1) : 0;
        const doc = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(doc, {
          preview: false,
          viewColumn: vscode.ViewColumn.One,
        });
        const pos = new vscode.Position(line, 0);
        editor.selection = new vscode.Selection(pos, pos);
        editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
        return;
      }
    }
  };

  // `message` is annotated, not validated: whatever the webview handed to
  // postMessage arrives as it is. Reading `.type` off it inside the `.catch()`
  // used to throw a TypeError for a nullish payload — inside the handler that
  // exists to report failures, where nothing is left to catch it, so the
  // rejection escaped unhandled and took the original failure with it.
  currentPanel.webview.onDidReceiveMessage((message: DiagramInbound) => {
    handleMessage(message).catch((err: unknown) => {
      logError(`diagram webview action '${describeInboundMessage(message)}' failed`, err);
      if (inboundMessageType(message) === 'navigate') {
        void vscode.window.showWarningMessage(
          'Could not open that model — the file may have moved. Refreshing the diagram will re-read the project.',
        );
      }
    });
  });

  // Pay back a render that was skipped while the panel was hidden.
  currentPanel.onDidChangeViewState(e => {
    if (!e.webviewPanel.visible || !renderOwed) return;
    renderOwed = false;
    renderPanel(e.webviewPanel, services.getProject(), ctx.extensionUri);
  });

  currentPanel.onDidDispose(() => {
    currentPanel = undefined;
    renderOwed = false;
    bootWatchdog.dispose();
    logInfo('Django Model Diagram panel closed');
  });
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function renderPanel(panel: vscode.WebviewPanel, project: Project, extensionUri: vscode.Uri): void {
  const models = project.models.all();
  // tailwind.css, not diagram-app.css. esbuild names a bundle's extracted CSS
  // after its outfile, so the moment any component in the diagram graph grows
  // a `<style>` block, esbuild would write dist/diagram-app.css — and in
  // `npm run package` it runs AFTER Tailwind, so the whole utility stylesheet
  // would be silently replaced by a few scoped rules. Nothing renders wrong
  // today because no diagram component has styles; that is not a guarantee.
  const cssUri = panel.webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'tailwind.css'),
  );

  if (models.length === 0) {
    // No models yet. If the scanner hasn't reported a completed pass, this is
    // the first-load window → show the animated scanning hero (it gets upgraded
    // to the diagram by the onProjectChange subscription below). Otherwise the
    // workspace genuinely has no Django models.
    panel.webview.html = emptyStateHtml(
      scanSettledOnce ? 'no-models' : 'scanning',
      cssUri,
      panel.webview.cspSource,
    );
    // Static HTML: no script, no bundle, nothing that could ever post `ready`.
    renderedDocument(panel, 'static');
    return;
  }

  const nonce = crypto.randomBytes(16).toString('hex');
  const scriptUri = panel.webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'diagram-app.js'),
  );

  // Serialize the full DiagramDataPayload from domain — the Svelte webview
  // reads window.__DIAGRAM_DATA__ (see src/domain/diagram/diagram-serializer.ts).
  const diagramData = serializeDiagram(project);
  const serializedData = safeScriptJson(diagramData);

  panel.webview.html = diagramHtml(
    nonce,
    scriptUri.toString(),
    cssUri.toString(),
    panel.webview.cspSource,
    serializedData,
  );
  renderedDocument(panel, 'app');
}

/**
 * Start (or stop) waiting for the document just written into `panel`.
 *
 * Guarded on the panel being the current one: `renderPanel` is also reachable
 * with the panel handed back by `onDidChangeViewState`, and a render into
 * something that is no longer the live panel must not disturb the live panel's
 * boot state.
 */
function renderedDocument(panel: vscode.WebviewPanel, kind: RenderedDocument): void {
  if (panel !== currentPanel) return;
  bootWatchdog.documentRendered(kind);
}

// ── HTML builders ─────────────────────────────────────────────────────────────

function diagramHtml(
  nonce: string,
  scriptUri: string,
  cssUri: string,
  cspSource: string,
  serializedData: string,
): string {
  return /* html */ `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${cspSource} data:; font-src ${cspSource};">
<link rel="stylesheet" href="${cssUri}">
<style>
  :root { color-scheme: dark; }
  html, body { height: 100%; margin: 0; overflow: hidden; }
  body { background: var(--vscode-editor-background); color: var(--vscode-foreground); font-family: var(--vscode-font-family); }
  #app { width: 100%; height: 100%; }
</style>
</head>
<body>
  <div id="app"></div>
  <script nonce="${nonce}">window.__DIAGRAM_DATA__ = ${serializedData};</script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function emptyStateHtml(
  kind: 'scanning' | 'no-models',
  cssUri: vscode.Uri,
  cspSource: string,
): string {
  const name = 'Django Language Service';
  const refreshCmd = `command:${cmdId('refreshViewContext')}`;

  // Themed "scanning" hero: a mini ER diagram (three node cards + a hub
  // connected by relation lines) sitting inside a stack of pulsing accent
  // rings. CSS-only — inline SVG + Tailwind animate utilities. Communicates
  // the product visually instead of a generic spinner. (Ported from the OLD
  // diagram-panel scanning hero so the first-load experience matches.)
  const scanningHero = /* html */ `
        <div class="relative flex items-center justify-center w-[180px] h-[180px]">
            <span class="absolute inset-0 rounded-full bg-vsc-link/[0.10] animate-ping" style="animation-duration: 2.2s;"></span>
            <span class="absolute inset-[18px] rounded-full bg-vsc-link/[0.10] animate-ping" style="animation-duration: 2.2s; animation-delay: 0.4s;"></span>
            <span class="absolute inset-[34px] rounded-full bg-vsc-link/[0.10] animate-ping" style="animation-duration: 2.2s; animation-delay: 0.8s;"></span>
            <svg viewBox="0 0 140 100" class="relative w-[120px] h-[86px]" aria-hidden="true">
                <defs>
                    <style>
                        .er-node { fill: var(--color-vsc-card-bg); stroke: var(--color-vsc-link); stroke-width: 1.5; }
                        .er-line { stroke: var(--color-fk); stroke-width: 1.5; stroke-linecap: round; opacity: 0.85; }
                        .er-dim  { opacity: 0.55; }
                    </style>
                </defs>
                <line class="er-line" x1="30" y1="50" x2="58" y2="22">
                    <animate attributeName="opacity" values="0.3;1;0.3" dur="2s" repeatCount="indefinite" />
                </line>
                <line class="er-line" x1="30" y1="50" x2="58" y2="78">
                    <animate attributeName="opacity" values="0.3;1;0.3" dur="2s" begin="0.4s" repeatCount="indefinite" />
                </line>
                <line class="er-line" x1="82" y1="22" x2="110" y2="22">
                    <animate attributeName="opacity" values="0.3;1;0.3" dur="2s" begin="0.8s" repeatCount="indefinite" />
                </line>
                <rect class="er-node" x="5"  y="40" width="28" height="20" rx="3" />
                <rect class="er-node" x="55" y="12" width="28" height="20" rx="3" />
                <rect class="er-node er-dim" x="55" y="68" width="28" height="20" rx="3" />
                <rect class="er-node er-dim" x="107" y="12" width="24" height="20" rx="3" />
            </svg>
        </div>
    `;

  // Filled folder glyph for the no-models state.
  const noModelsIcon = /* html */ `
        <svg viewBox="0 0 24 24" width="44" height="44" fill="currentColor" class="text-vsc-desc/60" aria-hidden="true">
            <path d="M9.17 6l2 2H20v10H4V6h5.17M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
        </svg>
    `;

  const body =
    kind === 'scanning'
      ? /* html */ `
            <div class="flex flex-col items-center gap-6 max-w-[440px]">
                ${scanningHero}
                <div class="flex flex-col items-center gap-2">
                    <h1 class="text-[18px] font-semibold m-0 text-vsc-editor-fg">Scanning workspace</h1>
                    <p class="text-[13px] leading-[1.55] text-vsc-desc m-0">${name} is indexing your templates, views, and models. The diagram will appear automatically once the first pass finishes.</p>
                </div>
            </div>
        `
      : /* html */ `
            <div class="flex flex-col items-center gap-5 max-w-[460px]">
                ${noModelsIcon}
                <div class="flex flex-col items-center gap-2">
                    <h1 class="text-[18px] font-semibold m-0 text-vsc-editor-fg">No Django models found</h1>
                    <p class="text-[13px] leading-[1.55] text-vsc-desc m-0 [&_code]:bg-vsc-code-bg [&_code]:px-1.5 [&_code]:py-px [&_code]:rounded-sm [&_code]:text-[12px]">${name} scanned your workspace and didn't find any <code>models.py</code> files with Django model classes. Make sure this workspace contains a Django project (look for <code>manage.py</code>), then try again.</p>
                </div>
                <a href="${refreshCmd}" class="inline-flex items-center gap-2 px-4 py-2 mt-1 text-[13px] font-medium text-vsc-link no-underline bg-vsc-link/10 border border-vsc-link/30 rounded-md hover:bg-vsc-link/20 hover:border-vsc-link/60 transition-colors">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
                    Refresh scan
                </a>
            </div>
        `;

  // Critical inline CSS — base colors + the ping keyframe so the hero renders
  // correctly the instant the panel opens, even before the external tailwind
  // bundle finishes loading off the local file:// URL.
  const criticalCss = /* css */ `
    :root { color-scheme: dark; }
    body { margin: 0; background: var(--vscode-editor-background); color: var(--vscode-foreground); font-family: var(--vscode-font-family); }
    @keyframes ping { 75%, 100% { transform: scale(2); opacity: 0; } }
  `;

  return /* html */ `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; img-src data:;">
<style>${criticalCss}</style>
<link rel="stylesheet" href="${cssUri}">
</head>
<body class="m-0 p-0 font-vsc text-vsc-fg bg-vsc-bg">
  <div class="flex items-center justify-center min-h-screen px-5 py-10 text-center">${body}</div>
</body>
</html>`;
}

// ── Adapter register ──────────────────────────────────────────────────────────

export function register(
  ctx: vscode.ExtensionContext,
  services: AdapterServices,
): vscode.Disposable {
  // Wire the showModelDiagram command to the full panel lifecycle
  const cmdDisposable = vscode.commands.registerCommand(cmdId('showModelDiagram'), () =>
    showDiagramPanel(ctx, services),
  );

  // Internal, deliberately absent from package.json — same arrangement as
  // codeLensToggleInclude. It exists so the integration suite can ask whether
  // the webview actually mounted; there is nothing here a user would invoke.
  const bootedProbe = vscode.commands.registerCommand(cmdId('diagramBooted'), () =>
    isDiagramBooted(),
  );

  // VS Code restores a webview TAB across a window reload whether or not the
  // extension asks it to. Without a serializer the restored tab is a dead
  // frame, `currentPanel` is undefined, and running Show Model Diagram opens a
  // SECOND panel beside the corpse. Adopting it puts the one panel back under
  // the same lifecycle everything else here assumes.
  const serializerDisposable = vscode.window.registerWebviewPanelSerializer('djangoModelDiagram', {
    deserializeWebviewPanel: async (panel: vscode.WebviewPanel): Promise<void> => {
      adoptPanel(panel, ctx, services);
      await Promise.resolve();
    },
  });

  // React to scan completion: flag that the scan has settled (so an empty
  // project now reads as "no models" rather than "still scanning") and
  // re-render the open panel with the fresh data. This is the webview's
  // designed contract (see diagram-boot.ts: the Refresh button posts
  // {type:'refresh'} and waits for the html swap to clear its spinner);
  // pan/zoom/positions survive the swap via vscode getState/setState.
  //
  // Only while the panel is VISIBLE, though. Swapping `webview.html` remounts
  // the whole Svelte app, and with `retainContextWhenHidden` the hidden panel
  // is still alive to receive it — so every save in another tab was paying for
  // a full re-render nobody could see, and would drop any transient UI state
  // the user left open. A render owed to a hidden panel is deferred until it
  // comes back.
  const changeDisposable = services.onProjectChange?.(project => {
    scanSettledOnce = true;
    if (!currentPanel) return;
    if (!currentPanel.visible) {
      renderOwed = true;
      return;
    }
    renderPanel(currentPanel, project, ctx.extensionUri);
  });

  return {
    dispose(): void {
      cmdDisposable.dispose();
      bootedProbe.dispose();
      serializerDisposable.dispose();
      changeDisposable?.dispose();
      if (currentPanel) {
        currentPanel.dispose();
        currentPanel = undefined;
      }
      renderOwed = false;
      bootWatchdog.dispose();
    },
  };
}
