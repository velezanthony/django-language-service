/**
 * FileSystem port -- abstracts disk I/O behind a testable interface.
 *
 * FileSystem interface:     pure, no vscode imports
 * NodeFileSystem:           uses fs/promises + fast-glob (devDependency, NOT
 *                           shipped — see the class header below)
 * InMemoryFileSystem:       Map-backed, for tests
 *
 * POSIX normalization happens at the boundary in NodeFileSystem.
 * Downstream code can always assume forward-slash absolute paths.
 *
 * No vscode imports in this file -- purity is rg-verifiable.
 */

import { readFile as fsReadFile, stat as fsStat } from 'node:fs/promises';
import { resolve } from 'node:path';

// ----------------------------------------------------------------------------
// Interface
// ----------------------------------------------------------------------------

export interface FileSystem {
  readFile(path: string): Promise<string>;
  glob(patterns: readonly string[], excludes: readonly string[]): Promise<readonly string[]>;
  stat(path: string): Promise<{ readonly mtime: number; readonly size: number } | null>;
}

// ----------------------------------------------------------------------------
// NodeFileSystem
// ----------------------------------------------------------------------------

/**
 * fs/promises + fast-glob implementation. Results are POSIX absolute paths.
 *
 * NOT SHIPPED. Production uses `VsCodeFileSystem`; this class exists for unit
 * tests, the scanner fixture test and any headless use. esbuild tree-shakes it
 * out of `dist/extension.js`, which is why `fast-glob` is a devDependency and
 * `.vscodeignore` can exclude `node_modules/**`.
 *
 * If you ever wire this back into `extension.ts`, you MUST move `fast-glob`
 * back into `dependencies` and stop excluding `node_modules` — otherwise the
 * published extension throws at the first scan and no test will catch it,
 * because tests resolve the package straight from the repo's node_modules.
 */
export class NodeFileSystem implements FileSystem {
  async readFile(path: string): Promise<string> {
    return fsReadFile(toPosix(resolve(path)), 'utf8');
  }

  async glob(patterns: readonly string[], excludes: readonly string[]): Promise<readonly string[]> {
    // Dynamic import keeps fast-glob out of the bundle until called
    const fg = (await import('fast-glob')).default;
    const results = await fg([...patterns], {
      ignore: excludes as string[],
      absolute: true,
      onlyFiles: true,
    });
    return results.map(toPosix);
  }

  async stat(path: string): Promise<{ readonly mtime: number; readonly size: number } | null> {
    try {
      const s = await fsStat(toPosix(resolve(path)));
      return { mtime: s.mtimeMs, size: s.size };
    } catch {
      return null;
    }
  }
}

// ----------------------------------------------------------------------------
// InMemoryFileSystem
// ----------------------------------------------------------------------------

type MemEntry = { content: string; mtime: number; size: number };

/**
 * Test double backed by a Map.
 * Glob uses minimal glob matching (covers ** patterns used by scanner).
 * No vscode imports -- safe for unit tests.
 */
export class InMemoryFileSystem implements FileSystem {
  private readonly files = new Map<string, MemEntry>();

  // Helpers for test setup

  addFile(path: string, content: string, mtime = Date.now()): void {
    this.files.set(path, { content, mtime, size: content.length });
  }

  removeFile(path: string): void {
    this.files.delete(path);
  }

  clear(): void {
    this.files.clear();
  }

  // FileSystem interface

  async readFile(path: string): Promise<string> {
    const entry = this.files.get(path);
    if (!entry) {
      throw new Error(`InMemoryFileSystem: file not found: ${path}`);
    }
    return entry.content;
  }

  async glob(patterns: readonly string[], excludes: readonly string[]): Promise<readonly string[]> {
    const paths = [...this.files.keys()];
    return paths.filter(p => {
      const matchesInclude = patterns.some(pat => matchesGlob(p, pat));
      const matchesExclude = excludes.some(pat => matchesGlob(p, pat));
      return matchesInclude && !matchesExclude;
    });
  }

  async stat(path: string): Promise<{ readonly mtime: number; readonly size: number } | null> {
    const entry = this.files.get(path);
    if (!entry) return null;
    return { mtime: entry.mtime, size: entry.size };
  }
}

// ----------------------------------------------------------------------------
// Internal utilities
// ----------------------------------------------------------------------------

/** Normalize any path to POSIX forward-slash form. */
function toPosix(p: string): string {
  return p.split('\\').join('/');
}

/**
 * Minimal glob matcher for InMemoryFileSystem.
 * Supports:
 *   **  -- any path segment sequence (including none)
 *   *   -- any characters except /
 *   ?   -- any single character except /
 * Anchored: pattern must match the FULL path string.
 */
function matchesGlob(path: string, pattern: string): boolean {
  // Build regex by processing the pattern character by character
  // to correctly handle ** vs * without regex-escape interference.
  let regex = '^';
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i]!;
    if (ch === '*' && pattern[i + 1] === '*') {
      // ** -- match any sequence of characters (including path separators)
      regex += '.*';
      i += 2;
      // Skip a trailing slash after ** so **/foo also matches at root level
      if (pattern[i] === '/') {
        regex += '/?';
        i += 1;
      }
    } else if (ch === '*') {
      // * -- match any characters except /
      regex += '[^/]*';
      i += 1;
    } else if (ch === '?') {
      // ? -- match any single character except /
      regex += '[^/]';
      i += 1;
    } else {
      // Escape regex special chars
      regex += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
      i += 1;
    }
  }
  regex += '$';
  return new RegExp(regex).test(path);
}
