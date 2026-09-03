/**
 * DTL-019 — Include-pretty diagnostics.
 *
 * Detects multi-line `{% include %}` tags and emits a hint-level diagnostic
 * on each one, prompting the user to collapse them.
 *
 * Also:
 * - Paints an opening-line border decoration on each multi-line include.
 * - Updates the `file-decoration/include.ts` singleton so the Explorer
 *   tree shows a count badge on affected files.
 * - Pushes the total count to `statusBarController.setIncludes(n)`.
 *
 * Subscribes to VS Code document events (active editor, visible editors,
 * change, close).
 * NOT debounced (synchronous scan is fast enough for includes).
 */
import * as vscode from 'vscode';
import type { AdapterServices } from '$adapters/types';
import { includeDecorationProvider } from '$adapters/file-decoration/include';
import { statusBarController } from '$adapters/status-bar';
import { findMultiLineIncludes } from '$domain/include-pretty/include-finder';
import { logError, logInfo } from '$shared/logger';
import { DTL_LANGUAGES } from '$adapters/_shared/languages';

const COLLECTION_NAME = 'django-include';

/** Ceiling on the activation badge sweep. Past it, badges arrive on open. */
const MAX_BADGE_SCAN_FILES = 5000;

class IncludePrettyDiagnosticsAdapter {
  private readonly collection: vscode.DiagnosticCollection;
  private readonly openingLineDecoration: vscode.TextEditorDecorationType;
  private readonly openingRangesByUri = new Map<string, vscode.Range[]>();

  constructor() {
    this.collection = vscode.languages.createDiagnosticCollection(COLLECTION_NAME);
    this.openingLineDecoration = vscode.window.createTextEditorDecorationType({
      isWholeLine: false,
      borderStyle: 'solid',
      borderColor: new vscode.ThemeColor('editorWarning.foreground'),
      borderWidth: '0 0 0 3px',
      backgroundColor: new vscode.ThemeColor('editorWarning.border'),
      overviewRulerColor: new vscode.ThemeColor('editorWarning.foreground'),
      overviewRulerLane: vscode.OverviewRulerLane.Left,
    });
  }

  /** Scan document, update diagnostics + decorations + badges. Returns count. */
  update(document: vscode.TextDocument): number {
    if (!DTL_LANGUAGES.has(document.languageId)) {
      this.collection.delete(document.uri);
      this.openingRangesByUri.delete(document.uri.toString());
      this.applyDecorationsForDocument(document);
      return 0;
    }

    const diagnostics: vscode.Diagnostic[] = [];
    const openingRanges: vscode.Range[] = [];

    try {
      // The scan itself is `findMultiLineIncludes`, shared with the workspace
      // badge pass below so the two can never disagree about what counts.
      for (const found of findMultiLineIncludes(document.getText())) {
        const fullRange = new vscode.Range(
          found.startLine,
          0,
          found.endLine,
          document.lineAt(found.endLine).text.length,
        );

        const diag = new vscode.Diagnostic(
          fullRange,
          'Multi-line include — collapse with Format Document or click "Collapse to inline" above',
          vscode.DiagnosticSeverity.Hint,
        );
        diag.source = 'django';
        diagnostics.push(diag);

        // Opening-line decoration border
        openingRanges.push(
          new vscode.Range(found.startLine, found.openingStart, found.startLine, found.openingEnd),
        );
      }
    } catch (err) {
      logError('Include-pretty diagnostics scan failed', err);
    }

    this.collection.set(document.uri, diagnostics);
    this.openingRangesByUri.set(document.uri.toString(), openingRanges);
    this.applyDecorationsForDocument(document);

    const count = diagnostics.length;

    // Update file-decoration singleton (may be null if not registered yet)
    includeDecorationProvider?.update(document.uri, count);

    // Push total to status bar
    statusBarController?.setIncludes(includeDecorationProvider?.getTotalCount() ?? 0);

    return count;
  }

  /**
   * Record a badge count for a file nobody has opened.
   *
   * No diagnostics and no decorations: both belong to an editor, and there is
   * none. Deliberately does NOT populate `openingRangesByUri` — that map is
   * for open documents, and filling it from a workspace sweep is what made it
   * grow to the size of the project and never shrink.
   */
  countOnly(uri: vscode.Uri, count: number): void {
    includeDecorationProvider?.update(uri, count);
    statusBarController?.setIncludes(includeDecorationProvider?.getTotalCount() ?? 0);
  }

  /** Drop the per-document state VS Code no longer has an editor for. */
  forget(uri: vscode.Uri): void {
    this.openingRangesByUri.delete(uri.toString());
  }

  applyDecorationsForDocument(document: vscode.TextDocument): void {
    const ranges = this.openingRangesByUri.get(document.uri.toString()) ?? [];
    for (const editor of vscode.window.visibleTextEditors) {
      if (editor.document.uri.toString() === document.uri.toString()) {
        editor.setDecorations(this.openingLineDecoration, ranges);
      }
    }
  }

  applyToEditor(editor: vscode.TextEditor): void {
    const ranges = this.openingRangesByUri.get(editor.document.uri.toString()) ?? [];
    editor.setDecorations(this.openingLineDecoration, ranges);
  }

  dispose(): void {
    this.collection.dispose();
    this.openingLineDecoration.dispose();
    this.openingRangesByUri.clear();
  }
}

export function register(
  _ctx: vscode.ExtensionContext,
  services: AdapterServices,
): vscode.Disposable {
  const adapter = new IncludePrettyDiagnosticsAdapter();

  // Initial scan of the active editor
  if (vscode.window.activeTextEditor) {
    adapter.update(vscode.window.activeTextEditor.document);
  }

  // Scan workspace for all template files on startup
  void scanWorkspaceForMultiLineIncludes(adapter);

  const disposables: vscode.Disposable[] = [
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor) {
        adapter.update(editor.document);
        adapter.applyToEditor(editor);
      }
    }),
    vscode.window.onDidChangeVisibleTextEditors(editors => {
      for (const editor of editors) adapter.applyToEditor(editor);
    }),
    vscode.workspace.onDidChangeTextDocument(event => {
      adapter.update(event.document);
    }),
    // The other three diagnostics adapters have this; this one did not, so the
    // per-document range map only ever grew.
    vscode.workspace.onDidCloseTextDocument(doc => {
      adapter.forget(doc.uri);
    }),
    adapter,
  ];

  // Re-run diagnostics for visible editors when the project snapshot changes
  // (e.g. after a background rescan). Include-pretty does not use a debouncer
  // by design — run directly.
  const projectChange = services.onProjectChange?.(() => {
    for (const editor of vscode.window.visibleTextEditors) {
      adapter.update(editor.document);
    }
  });
  if (projectChange) disposables.push(projectChange);

  return vscode.Disposable.from(...disposables);
}

/**
 * Fill the Explorer badge counts for templates the user has not opened.
 *
 * Reads bytes. It used to call `openTextDocument` on every hit — up to 5000
 * TextDocuments, each one resident in VS Code's document cache for the rest of
 * the session, and each one firing `onDidOpenTextDocument` into the four
 * adapters subscribed to it (three diagnostics debouncers plus the script
 * filter, which runs `new vm.Script` per `<script>` block). Counting includes
 * for a badge was waking the whole extension up on files nobody asked for.
 *
 * Only the badge is produced here. Diagnostics and decorations belong to open
 * editors, and `update()` still owns those.
 */
async function scanWorkspaceForMultiLineIncludes(
  adapter: IncludePrettyDiagnosticsAdapter,
): Promise<void> {
  try {
    const uris = await vscode.workspace.findFiles(
      '**/templates/**/*.{html,htm}',
      '**/{node_modules,.venv,venv,.git,dist,build,out}/**',
      MAX_BADGE_SCAN_FILES,
    );
    const BATCH_SIZE = 20;
    for (let i = 0; i < uris.length; i += BATCH_SIZE) {
      const batch = uris.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async uri => {
          try {
            const bytes = await vscode.workspace.fs.readFile(uri);
            const text = new TextDecoder().decode(bytes);
            adapter.countOnly(uri, findMultiLineIncludes(text).length);
          } catch {
            // Unreadable, binary or vanished — one missing badge, nothing more.
          }
        }),
      );
      await new Promise(resolve => setTimeout(resolve, 0)); // yield
    }
    if (uris.length === MAX_BADGE_SCAN_FILES) {
      logInfo(
        `Include badges: stopped at ${MAX_BADGE_SCAN_FILES} templates. ` +
          'Files past that are counted when opened.',
      );
    }
  } catch (err) {
    logError('Include workspace scan failed', err);
  }
}
