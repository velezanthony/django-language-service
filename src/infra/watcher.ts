/**
 * Watcher — debounced FileSystem change adapter.
 *
 * vscode import is AUTHORIZED in this file (design §5, AD#5).
 * All other modules MUST NOT import from 'vscode'.
 *
 * Architecture:
 *  - WatchAdapter: abstract interface (testable without vscode)
 *  - VsCodeWatchAdapter: wraps vscode.workspace.createFileSystemWatcher
 *  - DebouncedWatcher: takes adapter + scanner, accumulates paths, fires once per window
 *
 * Debounce window: 200ms (design §6).
 *
 * Watch scope comes from `./watch-globs`, which derives it from the scanner's
 * own INCLUDE_PATTERNS. Do NOT widen it back to `**​/*.py`: an in-workspace
 * `.venv` would then turn every `pip install` into a full project rescan.
 */

import type { Scanner } from './scanner';
import { buildWatchGlobs, isWatchablePath } from './watch-globs';

// ── WatchAdapter ──────────────────────────────────────────────────────────────

export interface WatchDisposable {
  dispose(): void;
}

/**
 * Abstract filesystem watcher interface — decouples DebouncedWatcher from vscode.
 * The three event callbacks (onChange, onDelete, onCreate) each return a disposable.
 */
export interface WatchAdapter {
  onChange(handler: (path: string) => void): WatchDisposable;
  onDelete(handler: (path: string) => void): WatchDisposable;
  onCreate(handler: (path: string) => void): WatchDisposable;
}

// ── VsCodeWatchAdapter ────────────────────────────────────────────────────────

/**
 * Production WatchAdapter wrapping vscode.workspace.createFileSystemWatcher.
 * One of the three places in infra/ that touch vscode directly — the others are
 * `VsCodeFileSystem` (vscode-file-system.ts) and the scanner's EventEmitter
 * fallback (scanner.ts).
 */
export class VsCodeWatchAdapter implements WatchAdapter {
  /** One watcher per glob from `buildWatchGlobs()` — never `**​/*.py`. */
  private readonly watchers: import('vscode').FileSystemWatcher[];

  /** @param excludeSegments user override for the never-watched directories. */
  constructor(private readonly excludeSegments?: readonly string[]) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const vscode = require('vscode') as typeof import('vscode');
    this.watchers = buildWatchGlobs().map(glob => vscode.workspace.createFileSystemWatcher(glob));
  }

  /** Subscribe `handler` to one event across every watcher, filtering out any
   *  path the scanner would not index (a `.venv` write must never rescan). */
  private subscribe(
    pick: (w: import('vscode').FileSystemWatcher) => import('vscode').Event<import('vscode').Uri>,
    handler: (path: string) => void,
  ): WatchDisposable {
    const subs = this.watchers.map(w =>
      pick(w)(uri => {
        const path = toPosix(uri.fsPath);
        if (isWatchablePath(path, this.excludeSegments)) handler(path);
      }),
    );
    return {
      dispose: () => {
        for (const s of subs) s.dispose();
      },
    };
  }

  onChange(handler: (path: string) => void): WatchDisposable {
    return this.subscribe(w => w.onDidChange, handler);
  }

  onDelete(handler: (path: string) => void): WatchDisposable {
    return this.subscribe(w => w.onDidDelete, handler);
  }

  onCreate(handler: (path: string) => void): WatchDisposable {
    return this.subscribe(w => w.onDidCreate, handler);
  }

  /** Dispose the underlying vscode watchers. */
  dispose(): void {
    for (const w of this.watchers) w.dispose();
  }
}

// ── DebouncedWatcher ──────────────────────────────────────────────────────────

/**
 * Debounced watcher: accumulates changed paths in a Set, waits 200ms after the
 * last event, then calls scanner.invalidateBatch(batch) once.
 *
 * Dispose drains pending paths and cancels the timer — no events fire after dispose.
 */
export class DebouncedWatcher {
  private readonly pending = new Set<string>();
  /** A pending event was a create or a delete — see handleEvent. */
  private pendingStructural = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  private readonly disposables: WatchDisposable[] = [];

  constructor(
    adapter: WatchAdapter,
    private readonly scanner: Pick<Scanner, 'invalidateBatch'>,
    private readonly debounceMs: number = 200,
    /** Where a failed rescan is reported. Injected so infra stays vscode-free. */
    private readonly onError?: (err: unknown) => void,
  ) {
    // Create and delete change the SET of files; a plain change does not, and
    // that difference is what lets the scanner skip re-globbing the workspace
    // on an ordinary save. Only the watcher knows which event fired.
    this.disposables.push(adapter.onChange(p => this.handleEvent(p, false)));
    this.disposables.push(adapter.onDelete(p => this.handleEvent(p, true)));
    this.disposables.push(adapter.onCreate(p => this.handleEvent(p, true)));
  }

  /** Release all resources. Cancels any pending debounce. */
  dispose(): void {
    this.disposed = true;

    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    this.pending.clear();
    this.pendingStructural = false;

    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables.length = 0;
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private handleEvent(path: string, structural: boolean): void {
    if (this.disposed) return;

    this.pending.add(path);
    if (structural) this.pendingStructural = true;

    if (this.timer !== null) {
      clearTimeout(this.timer);
    }

    this.timer = setTimeout(() => {
      if (this.disposed) return;

      const batch = [...this.pending];
      const structural = this.pendingStructural;
      this.pending.clear();
      this.pendingStructural = false;
      this.timer = null;

      // Fire-and-forget is fine — the Scanner really does sequence internally
      // now (see its `_queue`), so a batch arriving mid-pass is queued rather
      // than run alongside. This comment used to assert that with no queue on
      // the other side; a comment that claims an invariant nobody enforces is
      // worse than no comment, because the next reader believes it.
      //
      // The rejection still has to go somewhere: it is the only signal that a
      // rescan died, and dropping it left the project silently frozen.
      this.scanner.invalidateBatch(batch, { structural }).catch((err: unknown) => {
        this.onError?.(err);
      });
    }, this.debounceMs);
  }
}

// ── Internal utilities ────────────────────────────────────────────────────────

function toPosix(p: string): string {
  return p.split('\\').join('/');
}
