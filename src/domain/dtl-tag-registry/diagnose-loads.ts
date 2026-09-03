/**
 * DTL-012..DTL-014 — which `{% load %}` a template is missing, and which it
 * does not need.
 *
 * Pure domain so it can be tested without a vscode runtime; the adapter only
 * builds the custom-library map and turns the result into vscode diagnostics.
 */

import {
  BUILTIN_TAGS,
  BUILTIN_FILTERS,
  extractLoadedLibraries,
  getAvailableTagsAndFilters,
  findLibraryForTag,
  findLibraryForFilter,
  librariesProviding,
} from './tag-registry';
import type { TagLibrary } from './tag-registry';
import { liveTokens } from '$domain/parsers/_shared/dtl-lexer';
import { offsetMapper } from '$domain/parsers/_shared/offsets';
import { PY_IDENT } from '$domain/parsers/_shared/python-tokens';
import { freshRegex } from '$domain/contracts/fresh-regex';

export interface LoadDiagnostic {
  readonly type: 'missing-load' | 'unused-load';
  readonly tagOrFilter: string;
  readonly requiredLibrary: string;
  readonly line: number;
  readonly message: string;
}

// Structural halves of a block — they are never a library's tag.
const SKIP_TAGS = new Set(['else', 'elif', 'empty', 'csrf_token']);

const FILTER_RE = new RegExp(String.raw`\|\s*(${PY_IDENT})`, 'gu');
const STRING_RE = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g;

/** Filter names in an expression. String literals are blanked first: the pipe
 *  in `default:"a|b"` is text, not a filter. */
function filtersIn(expression: string): string[] {
  const bare = expression.replace(STRING_RE, '""');
  return [...bare.matchAll(freshRegex(FILTER_RE))].map(m => m[1]!);
}

export function diagnoseLoads(
  templateSource: string,
  customLibraries: Map<string, TagLibrary>,
): LoadDiagnostic[] {
  const loadedLibs = extractLoadedLibraries(templateSource);
  const { tags: availableTags, filters: availableFilters } = getAvailableTagsAndFilters(
    loadedLibs,
    customLibraries,
  );

  // A tag mentioned inside a comment or {% verbatim %} is not a use — it does
  // not need a load, and it does not keep an otherwise-unused load alive.
  const source = templateSource;

  // Built once. Slicing the source and splitting it per token is O(n) per
  // token and so quadratic over the file — 2000 blocks took 294ms, the same
  // shape that made parseUrls slow.
  const lineAt = offsetMapper(source);

  const usedLibraries = new Set<string>();
  const seen = new Set<string>();
  const diagnostics: LoadDiagnostic[] = [];

  // Marking a use: EVERY library declaring the name is kept alive, not just the
  // first one found. Asking `findLibraryFor*` — a single best guess, meant for
  // the "you should load X" message — reported a load as dead whenever some
  // OTHER library happened to declare the same name first.
  const markUsed = (name: string, kind: 'tag' | 'filter'): void => {
    for (const lib of librariesProviding(name, kind, customLibraries)) usedLibraries.add(lib);
  };

  const reportFilter = (name: string, line: number): void => {
    markUsed(name, 'filter');
    const lib = findLibraryForFilter(name, customLibraries);
    if (availableFilters.has(name) || BUILTIN_FILTERS.has(name) || !lib) return;
    const key = `f:${name}:${line}`;
    if (seen.has(key)) return;
    seen.add(key);
    diagnostics.push({
      type: 'missing-load',
      tagOrFilter: name,
      requiredLibrary: lib,
      line,
      message: `Filter '${name}' requires {% load ${lib} %}`,
    });
  };

  for (const token of liveTokens(source)) {
    const line = lineAt(token.start).line;

    if (token.kind === 'var') {
      for (const f of filtersIn(token.inner)) reportFilter(f, line);
      continue;
    }

    const tagName = token.name;
    // Django allows filters in ANY tag expression, not just in {{ }} — a
    // missing load for one of those went unreported entirely.
    for (const f of filtersIn(token.inner.slice(tagName.length))) reportFilter(f, line);

    if (tagName === 'load' || tagName.startsWith('end') || SKIP_TAGS.has(tagName)) continue;

    markUsed(tagName, 'tag');
    const lib = findLibraryForTag(tagName, customLibraries);
    if (availableTags.has(tagName) || BUILTIN_TAGS.has(tagName) || !lib) continue;

    const key = `t:${tagName}:${line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    diagnostics.push({
      type: 'missing-load',
      tagOrFilter: tagName,
      requiredLibrary: lib,
      line,
      message: `Tag '${tagName}' requires {% load ${lib} %}`,
    });
  }

  // Where the {% load %} was written. Built from tokens like everything else:
  // a `{% load %}` inside a comment is not the one being reported, and the
  // regex it replaced would have matched it.
  const loadLineOf = new Map<string, number>();
  for (const token of liveTokens(source)) {
    if (token.kind !== 'tag' || token.name !== 'load') continue;
    for (const lib of token.inner.split(/\s+/).slice(1)) {
      if (!loadLineOf.has(lib)) loadLineOf.set(lib, lineAt(token.start).line);
    }
  }

  for (const lib of loadedLibs) {
    if (usedLibraries.has(lib)) continue;
    const loadLine = (loadLineOf.get(lib) ?? 0) - 1;
    diagnostics.push({
      type: 'unused-load',
      tagOrFilter: '',
      requiredLibrary: lib,
      line: loadLine + 1,
      message: `Library '${lib}' is loaded but never used`,
    });
  }

  return diagnostics;
}
