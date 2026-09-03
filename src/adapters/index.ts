/**
 * ADAPTERS barrel — ordered list of all adapters for registration in extension.ts.
 *
 * Registration order matters for singletons:
 *  1. status-bar BEFORE diagnostics (diagnostics push counts to statusBarController)
 *  2. file-decoration/include BEFORE diagnostics/include-pretty (singleton)
 *  3. diagram/panel BEFORE commandsAdapter (diagram registers showModelDiagram cmd)
 *
 * Each entry is a plain `Adapter` object: { id, register }.
 * The `register` function of each module is wrapped inline so individual
 * adapter files only need to export a single `register` function — no need
 * for each file to declare the full Adapter interface itself.
 */

import type * as vscode from 'vscode';
import type { Adapter, AdapterServices } from './types/adapter';

// ── Imports ───────────────────────────────────────────────────────────────────

import { register as registerStatusBar } from './status-bar';
import { commandsAdapter } from './commands';
import { register as registerFormatting } from './formatting';
import { register as registerFolding } from './folding';
import { register as registerScriptFilter } from './script-filter';

// Completion
import { register as registerCompletionTemplatePaths } from './completion/template-paths';
import { register as registerCompletionUrlNames } from './completion/url-names';
import { register as registerCompletionStaticFiles } from './completion/static-files';
import { register as registerCompletionDtlFilter } from './completion/dtl-filter';
import { register as registerCompletionDtlBlockName } from './completion/dtl-block-name';
import { register as registerCompletionPythonSnippets } from './completion/python-snippets';
import { register as registerCompletionContextVars } from './completion/context-vars';

// Hover
import { register as registerHoverDtlDocs } from './hover/dtl-docs';
import { register as registerHoverTemplatePaths } from './hover/template-paths';
import { register as registerHoverModelField } from './hover/model-field';
import { register as registerHoverUrlNames } from './hover/url-names';

// Definition
import { register as registerDefinitionTemplatePaths } from './definition/template-paths';
import { register as registerDefinitionUrlNames } from './definition/url-names';
import { register as registerDefinitionContextVar } from './definition/context-var';

// Document link
import { register as registerDocumentLinkTemplatePaths } from './document-link/template-paths';

// File decoration — include BEFORE diagnostics/include-pretty (singleton dependency)
import { register as registerFileDecorationInclude } from './file-decoration/include';
import { register as registerFileDecorationOrphan } from './file-decoration/orphan';

// Diagnostics
import { register as registerDiagnosticsContextVars } from './diagnostics/context-vars';
import { register as registerDiagnosticsIncludePretty } from './diagnostics/include-pretty/diagnostics';
import { register as registerDiagnosticsIncludeCodelens } from './diagnostics/include-pretty/codelens';
import { register as registerDiagnosticsDtlLoad } from './diagnostics/dtl-load';
import { register as registerDiagnosticsDtlLoadQuickFix } from './diagnostics/dtl-load-quickfix';
import { register as registerJoinWrappedTag } from './code-actions/join-wrapped-tag';
import { register as registerDiagnosticsUrlRefs } from './diagnostics/url-refs';

// Tag-pair highlight
import { register as registerTagPairHighlight } from './tag-pair-highlight';

// Sidebar
import { register as registerSidebarViews } from './sidebar/views';
import { register as registerSidebarLayouts } from './sidebar/layouts';
import { register as registerSidebarOrphans } from './sidebar/orphans';
import { register as registerSidebarModels } from './sidebar/models';

// Diagram panel — BEFORE commandsAdapter (registers showModelDiagram command)
import { register as registerDiagramPanel } from './diagram/panel';

// ── Helper ────────────────────────────────────────────────────────────────────

function a(
  id: string,
  reg: (ctx: vscode.ExtensionContext, services: AdapterServices) => vscode.Disposable,
): Adapter {
  return { id, register: reg };
}

// ── ADAPTERS list ─────────────────────────────────────────────────────────────

export const ADAPTERS: readonly Adapter[] = Object.freeze([
  // ── Infrastructure / singletons first ───────────────────────────────────────
  a('status-bar', registerStatusBar),
  a('file-decoration/include', registerFileDecorationInclude),

  // ── Diagram panel (registers showModelDiagram cmd — must precede commands) ──
  a('diagram/panel', registerDiagramPanel),

  // ── Commands (17 modules, 15 command ids, one combined adapter) ───────────────────────────
  commandsAdapter,

  // ── Simple providers ─────────────────────────────────────────────────────────
  a('formatting', registerFormatting),
  a('folding', registerFolding),
  a('script-filter', registerScriptFilter),

  // ── Completion ───────────────────────────────────────────────────────────────
  a('completion/template-paths', registerCompletionTemplatePaths),
  a('completion/url-names', registerCompletionUrlNames),
  a('completion/static-files', registerCompletionStaticFiles),
  a('completion/dtl-filter', registerCompletionDtlFilter),
  a('completion/dtl-block-name', registerCompletionDtlBlockName),
  a('completion/python-snippets', registerCompletionPythonSnippets),
  a('completion/context-vars', registerCompletionContextVars),

  // ── Hover ────────────────────────────────────────────────────────────────────
  a('hover/dtl-docs', registerHoverDtlDocs),
  a('hover/template-paths', registerHoverTemplatePaths),
  a('hover/model-field', registerHoverModelField),
  a('hover/url-names', registerHoverUrlNames),

  // ── Definition ───────────────────────────────────────────────────────────────
  a('definition/template-paths', registerDefinitionTemplatePaths),
  a('definition/url-names', registerDefinitionUrlNames),
  a('definition/context-var', registerDefinitionContextVar),

  // ── Document link ─────────────────────────────────────────────────────────────
  a('document-link/template-paths', registerDocumentLinkTemplatePaths),

  // ── File decoration (orphan after diagnostics are wired, OK here) ────────────
  a('file-decoration/orphan', registerFileDecorationOrphan),

  // ── Diagnostics (after status-bar + file-decoration/include) ─────────────────
  a('diagnostics/context-vars', registerDiagnosticsContextVars),
  a('diagnostics/include-pretty', registerDiagnosticsIncludePretty),
  a('diagnostics/include-pretty/codelens', registerDiagnosticsIncludeCodelens),
  a('diagnostics/dtl-load', registerDiagnosticsDtlLoad),
  a('diagnostics/dtl-load-quickfix', registerDiagnosticsDtlLoadQuickFix),
  a('code-actions/join-wrapped-tag', registerJoinWrappedTag),
  a('diagnostics/url-refs', registerDiagnosticsUrlRefs),

  // ── Tag-pair highlight ────────────────────────────────────────────────────────
  a('tag-pair-highlight', registerTagPairHighlight),

  // ── Sidebar ───────────────────────────────────────────────────────────────────
  a('sidebar/views', registerSidebarViews),
  a('sidebar/layouts', registerSidebarLayouts),
  a('sidebar/orphans', registerSidebarOrphans),
  a('sidebar/models', registerSidebarModels),
]);
