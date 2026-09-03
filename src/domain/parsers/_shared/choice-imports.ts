/**
 * Following `from .enums import StockStatus` to the module that defines it.
 *
 * Models resolve across files by GLOBAL NAME lookup — every models.py is
 * indexed, so a bare `Post` is found wherever it lives. Choice symbols get no
 * such index: `enums.py` is not in INCLUDE_PATTERNS, so the scanner never even
 * reads it. The only way to reach one is to read the import and open that file.
 *
 * Pure: no fs, no vscode. The scanner does the reading.
 */

import type { Choice } from '$domain/types/choice';
import { parseModuleConstants, parseTextChoicesClasses } from './models-choice-indexes';

/** `from <module> import a, b as c` — the parenthesised form spans lines. */
const FROM_IMPORT_RE = /^[ \t]*from[ \t]+([.\w]+)[ \t]+import[ \t]+(\([\s\S]*?\)|[^\n]+)/gm;

/** One `from <module> import <original> as <local>` binding. */
export interface ImportBinding {
  readonly module: string;
  /** Name as DEFINED in the module — differs from the local name on aliases,
   *  and it is the defining name a lookup in that file has to match. */
  readonly original: string;
}

/**
 * Map every imported local name to where it came from.
 * Keyed by the LOCAL name, which is what the importing file references.
 */
export function parseImportBindings(source: string): Map<string, ImportBinding> {
  const result = new Map<string, ImportBinding>();
  if (!source.trim()) return result;

  FROM_IMPORT_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = FROM_IMPORT_RE.exec(source)) !== null) {
    const moduleRef = match[1]!;
    const names = match[2]!.replace(/^\(|\)$/g, '');
    for (const raw of names.split(',')) {
      const name = raw.trim().replace(/\s+/g, ' ');
      if (!name || name === '*') continue;
      const aliased = name.match(/^(\w+)\s+as\s+(\w+)$/);
      const local = aliased ? aliased[2]! : name;
      const original = aliased ? aliased[1]! : name;
      if (/^\w+$/.test(local)) result.set(local, { module: moduleRef, original });
    }
  }
  return result;
}

/**
 * Map every imported local name to the module it came from.
 * Aliases are keyed by the LOCAL name, which is what a field references.
 */
export function parseChoiceImports(source: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const [local, binding] of parseImportBindings(source)) {
    result.set(local, binding.module);
  }
  return result;
}

/**
 * Files a module reference could live in, most likely first.
 *
 * Leading dots are relative: one means "this package", each extra one walks up.
 * A dotless reference needs `root` to anchor it; without one there is nothing
 * to resolve against and the caller gets an empty list.
 */
export function candidateModulePaths(
  fromFilePath: string,
  moduleRef: string,
  root?: string,
): string[] {
  const dots = /^\.+/.exec(moduleRef)?.[0].length ?? 0;
  const tail = moduleRef.slice(dots).split('.').filter(Boolean);

  let baseDir: string;
  if (dots === 0) {
    if (!root) return [];
    baseDir = root.replace(/\/+$/, '');
  } else {
    const segments = fromFilePath.replace(/\\/g, '/').split('/');
    segments.pop(); // the file itself
    // One dot is the containing package; each additional dot climbs one more.
    for (let i = 1; i < dots; i++) {
      if (segments.length <= 1) return [];
      segments.pop();
    }
    baseDir = segments.join('/');
  }

  const stem = [baseDir, ...tail].join('/');
  return [`${stem}.py`, `${stem}/__init__.py`];
}

/** Every choice symbol a module publishes: TextChoices classes and constants. */
export function collectChoiceSymbols(source: string): Map<string, readonly Choice[]> {
  const result = new Map<string, readonly Choice[]>();
  for (const [name, values] of parseTextChoicesClasses(source)) result.set(name, values);
  for (const [name, values] of parseModuleConstants(source)) {
    if (!result.has(name)) result.set(name, values);
  }
  return result;
}
