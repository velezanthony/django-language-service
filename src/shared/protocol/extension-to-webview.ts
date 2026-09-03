/**
 * Messages the extension sends to webview panels/views.
 * Discriminated on `type` (matches the ad-hoc protocol already in use by all
 * adapters and the Svelte apps — the original seed used `kind`, this rewrites
 * it to the correct discriminant).
 *
 * This file is intentionally IMPORT-FREE (no imports from adapters or domain).
 * It must remain resolvable by BOTH the extension tsconfig (which knows $infra/$domain)
 * and the webview tsconfig (which does not). Payload shapes are defined inline here;
 * the canonical payload types in sidebar-data.ts and diagram-serializer.ts must
 * remain structurally compatible (TypeScript structural typing enforces this).
 */

// ── Sidebar payload shapes (wire format) ─────────────────────────────────────

/** Wire-level payload for the views section.
 *  Structurally compatible with `ViewsPayload` in sidebar-data.ts. */
export interface SidebarViewsPayload {
  readonly mode: 'no-template' | 'chain';
  readonly currentTemplatePath: string | null;
  readonly currentFileName: string | null;
  readonly chainViews: ReadonlyArray<{
    readonly view: {
      /** Qualified index key '<app>.<name>' — identity for Live Mode. */
      readonly key: string;
      /** Bare view name — display only. */
      readonly name: string;
      readonly type: 'fbv' | 'cbv';
      readonly file: string;
      readonly line: number;
      readonly templateName: string | null;
    };
    readonly templateChain: readonly string[];
  }>;
  readonly templateFiles: Readonly<Record<string, string>>;
  /** Qualified key of the view with Live Mode active (matches view.key). */
  readonly liveViewKey: string | null;
}

/** Wire-level payload for the layouts section.
 *  Structurally compatible with `LayoutsPayload` in sidebar-data.ts. */
export interface SidebarLayoutsPayload {
  readonly layouts: ReadonlyArray<{
    readonly templatePath: string;
    readonly file: string;
    readonly childCount: number;
  }>;
  readonly partials: ReadonlyArray<{
    readonly templatePath: string;
    readonly file: string;
    readonly includerCount: number;
  }>;
}

/** Wire-level payload for the orphans section.
 *  Structurally compatible with `OrphansPayload` in sidebar-data.ts. */
export interface SidebarOrphansPayload {
  readonly orphans: ReadonlyArray<{
    readonly templatePath: string;
    readonly file: string;
  }>;
  readonly totalTemplates: number;
}

/** Wire-level payload for the models section.
 *  Structurally compatible with `ModelsPayload` in sidebar-data.ts. */
export interface SidebarModelsPayload {
  readonly totalModels: number;
  readonly totalApps: number;
  readonly topApps: ReadonlyArray<{ readonly app: string; readonly count: number }>;
}

/** Union of all valid sidebar section payload shapes. */
export type SidebarSectionPayload =
  SidebarViewsPayload | SidebarLayoutsPayload | SidebarOrphansPayload | SidebarModelsPayload;

// ── Sidebar: extension → webview ─────────────────────────────────────────────

/**
 * Sent when the extension pushes fresh section data to a sidebar webview view.
 * Each `SidebarWebviewProvider` instance serves a single section; the payload
 * field is a loose union of all valid section payloads.
 */
export interface SidebarDataMessage {
  readonly type: 'data';
  readonly payload: SidebarSectionPayload;
}

// ── Combined union ────────────────────────────────────────────────────────────

/**
 * Full discriminated union of every message the extension may post to any
 * webview. The diagram panel has NO extension→webview messages: scan results
 * arrive by replacing `webview.html` wholesale (the post-2b9a7b6 contract),
 * so only the sidebar receives pushed messages.
 */
export type ExtensionToWebview = SidebarDataMessage;
