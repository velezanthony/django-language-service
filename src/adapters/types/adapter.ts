import type * as vscode from 'vscode';
import type { Project } from '$infra/types';
import type { Scanner } from '$infra/scanner';
// NOTE: $infra/scanner path alias maps per tsconfig: "$infra/*" → "src/infra/*"

/**
 * Services injected into every adapter. Call `getProject()` inside handlers,
 * never at registration time, or the snapshot is the one from startup.
 */
export interface AdapterServices {
  readonly getProject: () => Project;

  /** Only for adapters that trigger rescans. Most should not use it. */
  readonly getScanner?: () => Scanner;

  /** Fires after every successful scan. */
  readonly onProjectChange?: vscode.Event<Project>;
}

/** One VS Code capability. Implementations live in `src/adapters/<capability>/`. */
export interface Adapter {
  readonly id: string;

  /** Registers this adapter's providers; the Disposable undoes all of them. */
  register(ctx: vscode.ExtensionContext, services: AdapterServices): vscode.Disposable;
}
