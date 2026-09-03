/**
 * Messages webview panels/views send back to the extension host.
 * Discriminated on `type` (matches the ad-hoc protocol already in use by all
 * adapters and the Svelte apps — the original seed used `kind`, this rewrites
 * it to the correct discriminant).
 */

// ── Sidebar: webview → extension ─────────────────────────────────────────────

/** Webview posts this once its message listener is live. The extension flushes
 *  any `pendingPayload` in response (pull-based handshake). */
export interface SidebarReadyMessage {
  readonly type: 'ready';
}

/** User clicked "Open Diagram" in the Models section. */
export interface SidebarOpenModelDiagramMessage {
  readonly type: 'openModelDiagram';
}

/** User clicked a file link (template or view) in the sidebar. */
export interface SidebarOpenFileMessage {
  readonly type: 'openFile';
  readonly file: string;
  readonly line: number;
}

/** User toggled live validation for a specific view.
 *  `viewKey` is the QUALIFIED index key '<app>.<name>' (ViewLeaf.key), never
 *  the bare display name — it must round-trip into `project.views.byKey()`. */
export interface SidebarToggleLiveMessage {
  readonly type: 'toggleLiveForView';
  readonly viewKey: string;
}

/** User triggered on-demand validation for a specific view.
 *  `viewKey` is the qualified index key (see SidebarToggleLiveMessage). */
export interface SidebarValidateMessage {
  readonly type: 'validateForView';
  readonly viewKey: string;
}

/** All messages a sidebar webview may send. */
export type SidebarInbound =
  | SidebarReadyMessage
  | SidebarOpenModelDiagramMessage
  | SidebarOpenFileMessage
  | SidebarToggleLiveMessage
  | SidebarValidateMessage;

// ── Diagram: webview → extension ─────────────────────────────────────────────

/** User pressed the Refresh button in the diagram toolbar. */
export interface DiagramRefreshMessage {
  readonly type: 'refresh';
}

/** User clicked the source-navigate action on a model box. */
export interface DiagramNavigateMessage {
  readonly type: 'navigate';
  readonly model: string;
}

/** Uncaught error in the diagram webview (logged + optional toast). */
export interface DiagramWebviewErrorMessage {
  readonly type: 'webviewError';
  readonly message: string;
  readonly filename?: string;
  readonly line?: number;
  readonly stack?: string;
}

/**
 * The diagram app mounted successfully.
 *
 * `webviewError` only fires when something THROWS. A bundle that fails to
 * parse, or a mount that silently produces nothing, left the panel showing an
 * empty frame with no signal on either side — and the integration test could
 * only see that a tab with the right title existed, which it does regardless.
 */
export interface DiagramReadyMessage {
  readonly type: 'ready';
}

/** All messages the diagram webview may send. */
export type DiagramInbound =
  DiagramReadyMessage | DiagramRefreshMessage | DiagramNavigateMessage | DiagramWebviewErrorMessage;

// ── Combined union ────────────────────────────────────────────────────────────

/**
 * Full discriminated union of every message any webview may post to the
 * extension host. When handling messages, use the narrower `SidebarInbound` /
 * `DiagramInbound` unions in each adapter so the switch is exhaustive.
 */
export type WebviewToExtension = SidebarInbound | DiagramInbound;
