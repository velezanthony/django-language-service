/**
 * VsCodeFileSystem — the production `FileSystem`, backed by the VS Code API.
 *
 * vscode import is AUTHORIZED in this file, alongside watcher.ts and the
 * scanner's EventEmitter fallback. Every other infra module stays vscode-free.
 *
 * WHY NOT NodeFileSystem (fast-glob + fs/promises)?
 *
 *  - Devcontainers and Remote-SSH. The extension host runs inside the
 *    container, so Node `fs` works, but the workspace is a bind mount: a
 *    recursive JS directory walk pays a syscall per entry across that
 *    boundary. `workspace.findFiles` is served by VS Code's own native,
 *    ripgrep-backed search service, which is dramatically faster on exactly
 *    that layout. This mirrors how django-cotton-props scans.
 *  - It honours the user's `files.exclude` / `search.exclude` for free, so a
 *    directory the user has already hidden is not indexed behind their back.
 *  - It is the same code path VS Code uses everywhere else, so behaviour under
 *    multi-root workspaces and symlinks matches the rest of the editor.
 *
 * `NodeFileSystem` stays in the tree: it is what the unit and integration tests
 * use, and it is the fallback for any host without a workspace service.
 */

import type { FileSystem } from './file-system';
import { splitGlobBase, joinExcludes } from './glob-translate';

/** Narrow slice of the vscode API this adapter needs — keeps it mockable. */
interface VsCodeApi {
  workspace: {
    findFiles(
      include: unknown,
      exclude?: string | null,
      maxResults?: number,
    ): Thenable<{ fsPath: string }[]>;
    fs: {
      readFile(uri: unknown): Thenable<Uint8Array>;
      stat(uri: unknown): Thenable<{ mtime: number; size: number }>;
    };
  };
  RelativePattern: new (base: string, pattern: string) => unknown;
  Uri: { file(path: string): unknown };
}

function toPosix(p: string): string {
  return p.replace(/\\/g, '/');
}

export class VsCodeFileSystem implements FileSystem {
  private readonly vscode: VsCodeApi;

  constructor(api?: VsCodeApi) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    this.vscode = api ?? (require('vscode') as unknown as VsCodeApi);
  }

  async readFile(path: string): Promise<string> {
    const bytes = await this.vscode.workspace.fs.readFile(this.vscode.Uri.file(path));
    return new TextDecoder('utf-8').decode(bytes);
  }

  /**
   * One `findFiles` call per include pattern, in parallel.
   *
   * findFiles takes a single GlobPattern, and brace-joining the includes would
   * lose the per-pattern base directory that RelativePattern needs. Results are
   * de-duplicated because `**​/views.py` and `**​/views/**​/*.py` legitimately
   * overlap on a package named `views` containing a `views.py`.
   */
  async glob(patterns: readonly string[], excludes: readonly string[]): Promise<readonly string[]> {
    const exclude = joinExcludes(excludes) ?? null;

    const perPattern = await Promise.all(
      patterns.map(async absolute => {
        const { base, pattern } = splitGlobBase(absolute);
        const relative = new this.vscode.RelativePattern(base, pattern);
        const uris = await this.vscode.workspace.findFiles(relative, exclude);
        return uris.map(u => toPosix(u.fsPath));
      }),
    );

    return [...new Set(perPattern.flat())];
  }

  async stat(path: string): Promise<{ readonly mtime: number; readonly size: number } | null> {
    try {
      const s = await this.vscode.workspace.fs.stat(this.vscode.Uri.file(path));
      return { mtime: s.mtime, size: s.size };
    } catch {
      return null;
    }
  }
}
