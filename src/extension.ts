import * as vscode from 'vscode';
import { getOutputChannel, logInfo, logWarn, logError } from '$shared/logger';
import {
  Scanner,
  VsCodeFileSystem,
  ParseCache,
  VsCodeWatchAdapter,
  DebouncedWatcher,
  resolveExcludeSegments,
} from '$infra/index';
import { ADAPTERS } from './adapters';
import { EMPTY_PROJECT } from './adapters/_shared/empty-project';
import { clearTemplateResolveCache } from './adapters/_shared/template-resolve';
import type { Project } from '$infra/types/project';

export function activate(ctx: vscode.ExtensionContext): void {
  ctx.subscriptions.push(getOutputChannel());

  // VsCodeFileSystem, not NodeFileSystem: scanning goes through VS Code's own
  // native search service instead of a JS directory walk, which is what makes
  // the first scan bearable when the workspace is a devcontainer or
  // Remote-SSH bind mount. It also honours the user's files.exclude.
  // Read AND resolved once at the composition root so infra stays
  // vscode-config-free and every consumer sees the same list. Resolving here
  // rather than inside each consumer is what keeps the scanner and the watcher
  // from disagreeing about what exists.
  // Requires a reload to take effect, which the setting's description says.
  const excludeSegments = resolveExcludeSegments(
    vscode.workspace.getConfiguration('djangoLanguageService').get<string[]>('excludePaths'),
  );

  const scanner = new Scanner({
    fs: new VsCodeFileSystem(),
    cache: new ParseCache(),
    excludeSegments,
    // Without this the Scanner defaults to `{ warn: () => undefined }`, so
    // every unresolved include, extends and url — and every file it had to
    // skip — went nowhere. An extension that cannot say what it could not read
    // is not diagnosable.
    logger: { warn: logWarn },
  });

  let latestProject: Project = EMPTY_PROJECT;

  // Keep latest project reference fresh on every scan completion. The shared
  // template-path resolver is dropped at the same moment: a template created
  // since the last lookup must become resolvable without waiting out its TTL.
  ctx.subscriptions.push(
    scanner.onDidChange((p: Project) => {
      latestProject = p;
      clearTemplateResolveCache();
    }),
  );

  const services = {
    getProject: (): Project => latestProject,
    getScanner: (): Scanner => scanner,
    onProjectChange: scanner.onDidChange,
  };

  // Register all adapters in declared dependency order (see src/adapters/index.ts)
  for (const adapter of ADAPTERS) {
    try {
      ctx.subscriptions.push(adapter.register(ctx, services));
    } catch (err) {
      logError(`adapter ${adapter.id} register failed`, err);
    }
  }

  // Keep the project fresh after the initial scan: watch .py/.html/.txt files
  // and feed debounced change batches into scanner.invalidateBatch (which
  // re-fires onDidChange, so adapters and webviews pick up the new data).
  const watchAdapter = new VsCodeWatchAdapter(excludeSegments);
  const watcher = new DebouncedWatcher(watchAdapter, scanner, undefined, err =>
    logError('rescan after file change failed', err),
  );
  ctx.subscriptions.push({
    dispose(): void {
      watcher.dispose();
      watchAdapter.dispose();
    },
  });

  // Kick off initial workspace scan (fires onDidChange on completion)
  const currentRoots = (): string[] =>
    vscode.workspace.workspaceFolders?.map(f => f.uri.fsPath) ?? [];
  scanner.scan(currentRoots()).catch((err: unknown) => logError('initial scan failed', err));

  // Roots used to be read once, so a folder added to the workspace afterwards
  // was never indexed and one removed stayed in the index until reload.
  ctx.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      scanner
        .scan(currentRoots())
        .catch((err: unknown) => logError('rescan after workspace folder change failed', err));
    }),
  );

  logInfo(`Django Language Service activated — ${ADAPTERS.length} adapters registered`);
}

export function deactivate(): void {
  /* no-op */
}
