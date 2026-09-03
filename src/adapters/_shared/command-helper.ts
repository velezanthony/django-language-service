import * as vscode from 'vscode';
import { logError } from '$shared/logger';

/** Thin wrapper around `vscode.commands.registerCommand`.
 *
 * Centralises the boilerplate so every command adapter stays at ≤ 50 LOC.
 * The prefix `django-language-service.` is the literal package name from
 * `package.json` (no runtime resolution needed — commands are static).
 */
export const CMD_PREFIX = 'django-language-service';

/** Build a fully-qualified command id from a short suffix.
 *  e.g. `cmdId('toggleComment')` → `'django-language-service.toggleComment'`
 */
export function cmdId(suffix: string): string {
  return `${CMD_PREFIX}.${suffix}`;
}

/** Register a command and return its Disposable.
 *
 * The handler uses `...args: any[]` to match VS Code's registerCommand signature
 * without triggering implicit-any errors on the call sites — each adapter
 * casts `args[0]` to its expected type internally.
 *
 * Every command is wrapped here rather than in eighteen separate try/catch
 * blocks — some of which existed and some of which did not. A command handler
 * that throws or rejects reaches VS Code as a raw stack in a modal-ish error
 * toast, which tells the user nothing actionable about a click they may not
 * even have made deliberately (a CodeLens, a sidebar row). The details go to
 * the log, and the user gets one line and a way to read it.
 */

export function registerCmd(
  id: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (...args: any[]) => any,
): vscode.Disposable {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return vscode.commands.registerCommand(id, async (...args: any[]): Promise<unknown> => {
    try {
      const result = await handler(...args);
      return result as unknown;
    } catch (err) {
      logError(`command ${id} failed`, err);
      const pick = await vscode.window.showWarningMessage(
        `Django Language Service: "${id.slice(CMD_PREFIX.length + 1)}" could not complete.`,
        'Show log',
      );
      if (pick === 'Show log') {
        await vscode.commands.executeCommand(cmdId('showLog'));
      }
      return undefined;
    }
  });
}
