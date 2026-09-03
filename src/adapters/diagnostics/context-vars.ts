/**
 * CTX-001..CTX-016 (excl. CTX-011) — Context variable diagnostics.
 *
 * Validates that template variables used in `{{ var }}` and `{% tag var %}`
 * are defined in the view's context dictionary AND that dotted chains
 * resolve against the model graph ({{ post.author.username }}) — manager
 * attrs, reverse relations, annotations, values() projections and aggregate
 * dicts included — with did-you-mean suggestions.
 *
 * The extraction/validation core is the PURE engine
 * ($domain/view-context/diagnose.ts → diagnoseTemplate), which composes
 * parseTemplateVariables + buildIteratorTypes + resolveChain. The inline
 * simplified regex extraction this adapter used to carry is gone — one
 * source of truth for template-var extraction.
 *
 * Gated on Live Mode: automatic diagnostics ONLY run when a live view is
 * selected (same reasoning as context-vars completion). The stored value is
 * the QUALIFIED view key '<app>.<name>' (see compare-state.ts) so
 * `project.views.byKey()` resolves it directly.
 *
 * Also owns the REAL handler for the `validateContext` command (CMD-018):
 * one-shot validation of the active document against an explicitly chosen
 * view, independent of Live Mode — the commands/validate-context.ts file is
 * a deliberate no-op (same pattern as clearContextDiagnostics).
 *
 * Subscribes to VS Code document events (open, change, close).
 * Debounced at 300ms per document (spec §"Diagnostics Subscribe to Project Changes").
 */
import * as vscode from 'vscode';
import type { AdapterServices } from '$adapters/types';
import type { View } from '$domain/types/view';
import { diagnoseTemplate } from '$domain/view-context';
import { LIVE_VIEW_KEY } from '$adapters/sidebar/compare-state';
import { viewKey } from '$infra/view-key';
import { graphFor } from '$adapters/_shared/project-graph';
import { collectIncomingKwargs } from '$adapters/_shared/include-kwargs';
import { createScheduler } from './_shared/debounce';
import { resolveColumnSpan } from './_shared/diagnostic-range';
import { cmdId, registerCmd } from '$adapters/_shared/command-helper';
import { logError, logInfo } from '$shared/logger';
import { DTL_LANGUAGES } from '$adapters/_shared/languages';

const COLLECTION_NAME = 'django-view-context';

class ContextVarsDiagnosticsAdapter {
  private readonly collection: vscode.DiagnosticCollection;
  private readonly scheduler = createScheduler(300);

  constructor(
    private readonly services: AdapterServices,
    private readonly ctx: vscode.ExtensionContext,
  ) {
    this.collection = vscode.languages.createDiagnosticCollection(COLLECTION_NAME);
  }

  schedule(document: vscode.TextDocument): void {
    if (!DTL_LANGUAGES.has(document.languageId)) return;
    this.scheduler.schedule(document.uri.toString(), () => this.run(document));
  }

  /** Live-mode pass: validates `document` against the live view (if any). */
  run(document: vscode.TextDocument): void {
    if (!DTL_LANGUAGES.has(document.languageId)) {
      this.collection.delete(document.uri);
      return;
    }

    try {
      // Qualified '<app>.<name>' key — matches the scanner's view index.
      // NOTE: do NOT touch statusBarController here — the orphans counter is
      // owned by file-decoration/orphan.ts; clearing it from this adapter
      // wiped the badge whenever a template was visited without a live view.
      const liveViewKey = this.ctx.workspaceState.get<string>(LIVE_VIEW_KEY);
      if (!liveViewKey) {
        this.collection.delete(document.uri);
        return;
      }

      const project = this.services.getProject();
      const view = project.views.byKey(liveViewKey);
      if (!view) {
        this.collection.delete(document.uri);
        return;
      }

      this.publish(document, view, liveViewKey);
    } catch (err) {
      logError('Context vars diagnostics failed', err);
    }
  }

  /** One-shot validation of `document` against an explicit view — backs the
   *  `validateContext` command. Independent of the Live Mode gate. */
  validateFor(document: vscode.TextDocument, view: View): void {
    if (!DTL_LANGUAGES.has(document.languageId)) return;
    try {
      this.publish(document, view, viewKey(view));
    } catch (err) {
      logError('Context vars validation failed', err);
    }
  }

  /** Computes and sets the diagnostics for `document` against `view`.
   *  `sourceKey` labels the diagnostics (qualified view key). */
  private publish(document: vscode.TextDocument, view: View, sourceKey: string): void {
    // Noise guard: a view with NO context data at all (no keys extracted,
    // nothing inferred) would flag every template var as undefined. Publish
    // an empty set instead — same behavior the legacy had for views it
    // couldn't parse context from.
    if (view.contextVars.length === 0) {
      this.collection.set(document.uri, []);
      return;
    }

    const project = this.services.getProject();
    const graph = graphFor(project);
    const incomingKwargs = collectIncomingKwargs(project.templates.all(), document.uri.fsPath);

    const results = diagnoseTemplate({
      templateSource: document.getText(),
      contextVars: view.contextVars,
      graph,
      ...(incomingKwargs.length > 0 ? { incomingKwargs } : {}),
      ...(view.contextIncomplete ? { contextIncomplete: true } : {}),
    });

    const diagnostics: vscode.Diagnostic[] = results.map(d => {
      const line = Math.min(Math.max(0, d.line - 1), document.lineCount - 1);
      const span = resolveColumnSpan(document.lineAt(line).text, d);
      const range = new vscode.Range(line, span.start, line, span.end);

      const message = d.suggestion ? `${d.message} — did you mean '${d.suggestion}'?` : d.message;
      const diag = new vscode.Diagnostic(
        range,
        message,
        d.severity === 'info'
          ? vscode.DiagnosticSeverity.Information
          : vscode.DiagnosticSeverity.Warning,
      );
      diag.source = `django: ${sourceKey}`;
      diag.code = d.code;
      return diag;
    });

    this.collection.set(document.uri, diagnostics);
  }

  clear(uri: vscode.Uri): void {
    this.collection.delete(uri);
  }

  /** Clears ALL context-variable diagnostics across every document — backs the
   *  `clearContextDiagnostics` command (the "Clear Diagnostics" sidebar button). */
  clearAll(): void {
    this.collection.clear();
  }

  dispose(): void {
    this.scheduler.dispose();
    this.collection.dispose();
  }
}

/** Resolves the `validateContext` command argument to a View.
 *  Accepts { view: { key } } (live-mode helper / validateByName), a full View
 *  inside { view } (pickView), or a bare qualified key / name string. */
function resolveViewFromItem(item: unknown, services: AdapterServices): View | undefined {
  const project = services.getProject();

  if (typeof item === 'string') {
    return project.views.byKey(item) ?? project.views.all().find(v => v.name === item);
  }

  const v = (item as { view?: { key?: string; name?: string; filePath?: string } } | undefined)
    ?.view;
  if (!v) return undefined;
  if (v.key) return project.views.byKey(v.key);
  if (v.filePath && v.name)
    return project.views.byKey(viewKey({ filePath: v.filePath, name: v.name }));
  if (v.name) return project.views.all().find(x => x.name === v.name);
  return undefined;
}

export function register(
  ctx: vscode.ExtensionContext,
  services: AdapterServices,
): vscode.Disposable {
  const adapter = new ContextVarsDiagnosticsAdapter(services, ctx);

  // Initial pass over already-open documents
  for (const doc of vscode.workspace.textDocuments) {
    adapter.schedule(doc);
  }

  const disposables: vscode.Disposable[] = [
    vscode.workspace.onDidOpenTextDocument(doc => adapter.schedule(doc)),
    vscode.workspace.onDidChangeTextDocument(e => adapter.schedule(e.document)),
    vscode.workspace.onDidCloseTextDocument(doc => adapter.clear(doc.uri)),
    // clearContextDiagnostics ("Clear Diagnostics") — this adapter owns the
    // context-vars collection, so it registers the real handler. The
    // commands/clear-diagnostics.ts file is a deliberate no-op, mirroring the
    // showModelDiagram pattern (handler lives with the owning adapter).
    registerCmd(cmdId('clearContextDiagnostics'), () => adapter.clearAll()),
    // validateContext (CMD-018, "Validate Context Variables") — same owning-
    // adapter pattern: one-shot validation of the ACTIVE document against the
    // chosen view, independent of Live Mode. commands/validate-context.ts is
    // a deliberate no-op.
    registerCmd(cmdId('validateContext'), (item?: unknown) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        logInfo('validateContext: no active editor');
        return;
      }
      const view = resolveViewFromItem(item, services);
      if (!view) {
        logInfo('validateContext: could not resolve a view from the argument');
        return;
      }
      adapter.validateFor(editor.document, view);
    }),
    adapter,
  ];

  // Re-run diagnostics via the existing 300ms scheduler when the project
  // snapshot changes (e.g. after a background rescan).
  const projectChange = services.onProjectChange?.(() => {
    for (const editor of vscode.window.visibleTextEditors) {
      adapter.schedule(editor.document);
    }
  });
  if (projectChange) disposables.push(projectChange);

  return vscode.Disposable.from(...disposables);
}
