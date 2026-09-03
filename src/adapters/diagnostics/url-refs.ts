/**
 * URL reference diagnostics — flags `{% url 'name' %}` where 'name' is not a
 * known URL in the project index. Restores the OLD DjangoUrlDiagnosticProvider.
 *
 * Pure detection lives in domain/parsers/url-references.ts (vscode-free,
 * unit-tested). This adapter supplies the known-names set from the project URL
 * index and maps unresolved refs to VS Code Diagnostics. Matching is exact and
 * namespace-aware, mirroring URL-name completion — and it bails when the index
 * is empty so an incomplete scan doesn't flag every reference.
 */
import * as vscode from 'vscode';
import type { AdapterServices } from '$adapters/types';
import { createScheduler } from './_shared/debounce';
import { findUnknownUrlReferences } from '$domain/parsers/url-references';
import { logError } from '$shared/logger';
import { DTL_LANGUAGES } from '$adapters/_shared/languages';

const COLLECTION_NAME = 'django-url-refs';

class UrlRefsDiagnosticsAdapter {
  private readonly collection: vscode.DiagnosticCollection;
  private readonly scheduler = createScheduler(300);

  constructor(private readonly services: AdapterServices) {
    this.collection = vscode.languages.createDiagnosticCollection(COLLECTION_NAME);
  }

  schedule(document: vscode.TextDocument): void {
    if (!DTL_LANGUAGES.has(document.languageId)) return;
    this.scheduler.schedule(document.uri.toString(), () => this.run(document));
  }

  run(document: vscode.TextDocument): void {
    if (!DTL_LANGUAGES.has(document.languageId)) {
      this.collection.delete(document.uri);
      return;
    }

    try {
      const project = this.services.getProject();
      const knownNames = new Set(project.urls.all().map(u => u.name));
      const unknown = findUnknownUrlReferences(document.getText(), knownNames);

      const diagnostics: vscode.Diagnostic[] = unknown.map(ref => {
        const range = new vscode.Range(ref.line, ref.startCol, ref.line, ref.startCol + ref.length);
        const diag = new vscode.Diagnostic(
          range,
          `URL name '${ref.name}' is not defined in any urls.py`,
          vscode.DiagnosticSeverity.Warning,
        );
        diag.source = 'django';
        diag.code = 'undefined-url-name';
        return diag;
      });

      this.collection.set(document.uri, diagnostics);
    } catch (err) {
      logError('URL reference diagnostics failed', err);
    }
  }

  clear(uri: vscode.Uri): void {
    this.collection.delete(uri);
  }

  dispose(): void {
    this.scheduler.dispose();
    this.collection.dispose();
  }
}

export function register(
  _ctx: vscode.ExtensionContext,
  services: AdapterServices,
): vscode.Disposable {
  const adapter = new UrlRefsDiagnosticsAdapter(services);

  // Initial pass over already-open documents
  for (const doc of vscode.workspace.textDocuments) {
    adapter.schedule(doc);
  }

  const disposables: vscode.Disposable[] = [
    vscode.workspace.onDidOpenTextDocument(doc => adapter.schedule(doc)),
    vscode.workspace.onDidChangeTextDocument(e => adapter.schedule(e.document)),
    vscode.workspace.onDidCloseTextDocument(doc => adapter.clear(doc.uri)),
    adapter,
  ];

  // Re-run when the project snapshot changes (e.g. after a background rescan),
  // so newly-added or removed URL names update existing diagnostics.
  const projectChange = services.onProjectChange?.(() => {
    for (const editor of vscode.window.visibleTextEditors) {
      adapter.schedule(editor.document);
    }
  });
  if (projectChange) disposables.push(projectChange);

  return vscode.Disposable.from(...disposables);
}
