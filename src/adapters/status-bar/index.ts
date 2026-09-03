/**
 * Status-bar adapter — aggregates orphan/include counts and shows a
 * single badge in the VS Code status bar. Clicking focuses the
 * Django sidebar ("focusDebtSidebar" command).
 *
 * The item is hidden when total == 0 (no permanent "0 issues" badge).
 * Counts are pushed from diagnostics adapters via the exported
 * `StatusBarController` — this adapter exposes the controller so other
 * adapters can update counts without importing vscode directly.
 */
import * as vscode from 'vscode';
import type { AdapterServices } from '$adapters/types';
import { cmdId } from '$adapters/_shared/command-helper';

const APP_NAME = 'Django Language Service';

export class StatusBarController {
  private orphanCount = 0;
  private includeCount = 0;

  constructor(private readonly item: vscode.StatusBarItem) {
    this.render();
  }

  setOrphans(count: number): void {
    if (count === this.orphanCount) return;
    this.orphanCount = count;
    this.render();
  }

  setIncludes(count: number): void {
    if (count === this.includeCount) return;
    this.includeCount = count;
    this.render();
  }

  private render(): void {
    const total = this.orphanCount + this.includeCount;
    if (total === 0) {
      this.item.hide();
      return;
    }

    const parts: string[] = [];
    if (this.orphanCount > 0) {
      parts.push(`${this.orphanCount} orphan template${this.orphanCount === 1 ? '' : 's'}`);
    }
    if (this.includeCount > 0) {
      parts.push(`${this.includeCount} multi-line include${this.includeCount === 1 ? '' : 's'}`);
    }

    this.item.text = `$(warning) ${APP_NAME}: ${total}`;
    this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    this.item.tooltip = new vscode.MarkdownString(
      `**${APP_NAME} — ${total} cleanup item${total === 1 ? '' : 's'}**\n\n` +
        parts.map(p => `• ${p}`).join('\n') +
        '\n\n*Click to open the Django sidebar.*',
    );
    this.item.show();
  }
}

/** Singleton controller — exported so diagnostics adapters can call
 *  `statusBarController.setOrphans(n)` after the adapter has registered. */
export let statusBarController: StatusBarController | null = null;

export function register(
  _ctx: vscode.ExtensionContext,
  _services: AdapterServices,
): vscode.Disposable {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  item.command = cmdId('focusDebtSidebar');

  statusBarController = new StatusBarController(item);

  return {
    dispose(): void {
      statusBarController = null;
      item.dispose();
    },
  };
}
