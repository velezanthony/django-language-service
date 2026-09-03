/**
 * PRV-022 — Multi-line include file-tree decoration.
 *
 * Adds a count badge to template files in the Explorer that contain
 * one or more multi-line `{% include %}` tags.
 *
 * This provider is updated by the `diagnostics/include-pretty/diagnostics.ts`
 * adapter via the exported `includeDecorationProvider` singleton.
 * Decoupled registration lets the two adapters live in their own files
 * while still sharing state via the exported singleton reference.
 */
import * as vscode from 'vscode';
import type { AdapterServices } from '$adapters/types';

class IncludeFileDecorationProvider implements vscode.FileDecorationProvider {
  private readonly onDidChangeEmitter = new vscode.EventEmitter<
    vscode.Uri | vscode.Uri[] | undefined
  >();
  readonly onDidChangeFileDecorations = this.onDidChangeEmitter.event;

  private readonly counts = new Map<string, number>();

  /** Called by include-pretty diagnostics adapter after scanning a document. */
  update(uri: vscode.Uri, count: number): void {
    const key = uri.toString();
    const prev = this.counts.get(key) ?? 0;

    if (count <= 0) {
      if (prev > 0) {
        this.counts.delete(key);
        this.onDidChangeEmitter.fire(uri);
      }
      return;
    }
    if (prev !== count) {
      this.counts.set(key, count);
      this.onDidChangeEmitter.fire(uri);
    }
  }

  /** Total count across all files — used by status-bar via diagnostics adapter. */
  getTotalCount(): number {
    let total = 0;
    for (const n of this.counts.values()) total += n;
    return total;
  }

  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    const count = this.counts.get(uri.toString());
    if (!count) return undefined;

    const badge = count > 9 ? '9+' : String(count);
    const tooltip =
      count === 1
        ? '1 multi-line {% include %} — collapse with Format Document'
        : `${count} multi-line {% include %} blocks — collapse with Format Document`;

    return new vscode.FileDecoration(
      badge,
      tooltip,
      new vscode.ThemeColor('editorWarning.foreground'),
    );
  }

  dispose(): void {
    this.onDidChangeEmitter.dispose();
  }
}

/**
 * Singleton — exported so `diagnostics/include-pretty/diagnostics.ts` can
 * call `includeDecorationProvider?.update(uri, count)` after each diagnostic pass.
 * The `?` is REQUIRED: this adapter may not be registered before the diagnostics adapter.
 */
export let includeDecorationProvider: IncludeFileDecorationProvider | null = null;

export function register(
  _ctx: vscode.ExtensionContext,
  _services: AdapterServices,
): vscode.Disposable {
  includeDecorationProvider = new IncludeFileDecorationProvider();
  const registration = vscode.window.registerFileDecorationProvider(includeDecorationProvider);

  return {
    dispose(): void {
      includeDecorationProvider = null;
      registration.dispose();
      // provider.dispose() called indirectly via registration — leave emitter cleanup to GC
    },
  };
}
