// ── Extension → Webview ───────────────────────────────────────────────────────
export type {
  ExtensionToWebview,
  SidebarDataMessage,
  SidebarSectionPayload,
  SidebarViewsPayload,
  SidebarLayoutsPayload,
  SidebarOrphansPayload,
  SidebarModelsPayload,
} from './extension-to-webview';

// ── Webview → Extension ───────────────────────────────────────────────────────
export type {
  WebviewToExtension,
  SidebarInbound,
  SidebarReadyMessage,
  SidebarOpenModelDiagramMessage,
  SidebarOpenFileMessage,
  SidebarToggleLiveMessage,
  SidebarValidateMessage,
  DiagramInbound,
  DiagramRefreshMessage,
  DiagramNavigateMessage,
  DiagramWebviewErrorMessage,
} from './webview-to-extension';
