/**
 * PRV-005, DTL-012, DTL-013, DTL-014, DTL-018 — DTL {% load %} diagnostics.
 *
 * Diagnoses two categories of `{% load %}` problems in Django templates:
 *
 * - DTL-012: Tag used without `{% load library %}` (missing-load)
 * - DTL-013: Filter used without `{% load library %}` (missing-load)
 * - DTL-014: Library loaded but never used (unused-load)
 * - DTL-018: Unknown custom library (unknown-load) — reserved for Batch 5
 *
 * Uses the domain tag-registry to identify which library each tag/filter
 * belongs to, and emits Warning/Information diagnostics accordingly.
 *
 * Subscribes to VS Code document events (open, change, close).
 * Debounced at 300ms per document.
 */
import * as vscode from 'vscode';
import type { AdapterServices } from '$adapters/types';
import { diagnoseLoads } from '$domain/dtl-tag-registry/diagnose-loads';
import { createScheduler } from './_shared/debounce';
import { logError } from '$shared/logger';
import { DTL_LANGUAGES } from '$adapters/_shared/languages';

const COLLECTION_NAME = 'django-dtl-load';

class DtlLoadDiagnosticsAdapter {
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

      // Build custom libraries map from scanner-indexed helpers
      const customLibraries = new Map<string, { tags: string[]; filters: string[] }>();
      for (const helper of project.helpers.all()) {
        const existing = customLibraries.get(helper.library) ?? { tags: [], filters: [] };
        if (helper.helperKind === 'tag' && !existing.tags.includes(helper.name)) {
          existing.tags.push(helper.name);
        } else if (helper.helperKind === 'filter' && !existing.filters.includes(helper.name)) {
          existing.filters.push(helper.name);
        }
        customLibraries.set(helper.library, existing);
      }

      const source = document.getText();
      const rawDiags = diagnoseLoads(source, customLibraries);

      const vsDiags: vscode.Diagnostic[] = rawDiags.map(d => {
        const line = Math.max(0, d.line - 1);
        const lineText = document.lineAt(Math.min(line, document.lineCount - 1)).text;

        let col = 0;
        let len = lineText.length;

        if (d.type === 'missing-load' && d.tagOrFilter) {
          const idx = lineText.indexOf(d.tagOrFilter);
          if (idx >= 0) {
            col = idx;
            len = d.tagOrFilter.length;
          }
        } else if (d.type === 'unused-load' && d.requiredLibrary) {
          const idx = lineText.indexOf(d.requiredLibrary);
          if (idx >= 0) {
            col = idx;
            len = d.requiredLibrary.length;
          }
        }

        const range = new vscode.Range(line, col, line, col + len);
        const severity =
          d.type === 'missing-load'
            ? vscode.DiagnosticSeverity.Warning
            : vscode.DiagnosticSeverity.Information;

        const diag = new vscode.Diagnostic(range, d.message, severity);
        diag.source = 'django';
        diag.code = d.type;
        return diag;
      });

      this.collection.set(document.uri, vsDiags);
    } catch (err) {
      logError('DTL load diagnostics failed', err);
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
  const adapter = new DtlLoadDiagnosticsAdapter(services);

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
