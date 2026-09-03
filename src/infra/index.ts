/**
 * src/infra/index.ts — barrel for the infra layer.
 *
 * Re-exports every public symbol from the infra modules so consumers
 * can import from '$infra' instead of reaching into submodules.
 *
 * NOTE: this file is the BARREL.
 *       The Index<T,K> implementation lives at './index-impl'.
 */

export { IndexImpl } from './index-impl';
export type { FileSystem } from './file-system';
export { NodeFileSystem, InMemoryFileSystem } from './file-system';
export { VsCodeFileSystem } from './vscode-file-system';
export { ParseCache } from './cache';
export type { ParserRegistry, ScannerOpts } from './scanner';
export { Scanner } from './scanner';
export type { WatchAdapter, WatchDisposable } from './watcher';
export { VsCodeWatchAdapter, DebouncedWatcher } from './watcher';
export { DEFAULT_EXCLUDE_SEGMENTS, STATIC_SEARCH_ROOTS } from './exclude-paths';
export { excludesForStaticSearch, resolveExcludeSegments } from './exclude-paths';
