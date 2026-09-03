/**
 * PRV-021 — Orphan template file-tree decoration.
 *
 * Adds a visual badge to template files in the Explorer that are not
 * referenced by any view (via templateName) or any include chain
 * (via the Project templates index).
 *
 * Updates whenever the Project snapshot changes (scanner.onDidChange).
 * The decorator marks files with a badge so the user can spot templates
 * that are no longer connected to the application.
 *
 * Count is pushed to the statusBarController so the status-bar badge
 * aggregates orphan + multi-line-include counts.
 */
import * as vscode from 'vscode';
import type { AdapterServices } from '$adapters/types';
import { statusBarController } from '$adapters/status-bar';
import { logError } from '$shared/logger';
import { computeOrphanTemplates } from './orphan-logic';

class OrphanFileDecorationProvider implements vscode.FileDecorationProvider {
  private readonly onDidChangeEmitter = new vscode.EventEmitter<
    vscode.Uri | vscode.Uri[] | undefined
  >();
  readonly onDidChangeFileDecorations = this.onDidChangeEmitter.event;

  private readonly orphans = new Set<string>();

  setOrphans(uris: readonly vscode.Uri[]): void {
    const prev = new Set(this.orphans);
    this.orphans.clear();
    for (const u of uris) this.orphans.add(u.toString());

    // Fire change for uris that were added or removed
    const changed: vscode.Uri[] = [];
    for (const u of uris) {
      if (!prev.has(u.toString())) changed.push(u);
    }
    for (const key of prev) {
      if (!this.orphans.has(key)) changed.push(vscode.Uri.parse(key));
    }

    if (changed.length > 0) this.onDidChangeEmitter.fire(changed);
  }

  getCount(): number {
    return this.orphans.size;
  }

  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    if (!this.orphans.has(uri.toString())) return undefined;
    return new vscode.FileDecoration(
      '?',
      'Orphan template — not referenced by any view, include or extends',
      new vscode.ThemeColor('editorWarning.foreground'),
    );
  }

  dispose(): void {
    this.onDidChangeEmitter.dispose();
  }
}

export function register(
  _ctx: vscode.ExtensionContext,
  services: AdapterServices,
): vscode.Disposable {
  const provider = new OrphanFileDecorationProvider();

  const updateOrphans = (): void => {
    try {
      const project = services.getProject();
      const templates = project.templates.all();
      const views = project.views.all();

      // Pure computation (see orphan-logic.ts): a template is an orphan when
      // no view renders it, no include targets it, and no template extends it.
      const orphanUris = computeOrphanTemplates(templates, views).map(tmpl =>
        vscode.Uri.file(tmpl.filePath),
      );

      provider.setOrphans(orphanUris);
      statusBarController?.setOrphans(provider.getCount());
    } catch (err) {
      logError('Orphan template decoration update failed', err);
    }
  };

  const registration = vscode.window.registerFileDecorationProvider(provider);
  // Initial update
  updateOrphans();

  // Subscribe to project changes (Scanner.onDidChange via AdapterServices)
  // so orphan decorations refresh after each workspace rescan.
  const projectChange = services.onProjectChange?.(() => updateOrphans());

  const disposables: vscode.Disposable[] = [
    registration,
    {
      dispose(): void {
        provider.dispose();
      },
    },
  ];
  if (projectChange) disposables.push(projectChange);
  return vscode.Disposable.from(...disposables);
}
