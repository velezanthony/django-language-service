/**
 * Context keys a class contributes through its `get_context_data`.
 *
 * A mixin is the other half of cross-file context: `class V(StatsMixin,
 * TemplateView)` inherits whatever StatsMixin puts in the dict, and the view
 * parser never sees mixins.py. The scanner follows the base classes and folds
 * those keys in, the same way it does for imported helper functions.
 *
 * Pure domain: no vscode / fs / path imports.
 */

import { extractContextSurface } from './context-keys';

export interface ClassContext {
  /** Base classes exactly as written, dots included. */
  readonly bases: readonly string[];
  /** Keys this class's own get_context_data adds. */
  readonly keys: readonly string[];
  /** Helper functions it calls in a context position. */
  readonly helperCalls: readonly string[];
  /** It injects through something this reader cannot follow. */
  readonly unresolved: boolean;
}

// `class Mixin:` with no bases at all is normal for a plain mixin, so the
// parenthesised list is optional.
const CLASS_RE = /^class\s+(\w+)\s*(?:\(([^)]*)\))?\s*:/;

const indentOf = (line: string): number => line.length - line.trimStart().length;

/**
 * Every class in a Python source, with the context its own body contributes.
 *
 * Bodies are sliced by indentation — the class ends at the first non-blank
 * line indented no deeper than its `class` line.
 */
export function extractClassContexts(source: string): Map<string, ClassContext> {
  const out = new Map<string, ClassContext>();
  if (!source.trim()) return out;

  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const m = CLASS_RE.exec(line.trimStart());
    if (!m) continue;

    const classIndent = indentOf(line);
    const body: string[] = [];
    let j = i + 1;
    for (; j < lines.length; j++) {
      const l = lines[j]!;
      if (l.trim() === '') {
        body.push(l);
        continue;
      }
      if (indentOf(l) <= classIndent) break;
      body.push(l);
    }

    const surface = extractContextSurface(body);
    const bases = (m[2] ?? '')
      .split(',')
      .map(b => b.trim())
      .filter(Boolean);
    out.set(m[1]!, {
      bases,
      keys: surface.keys,
      helperCalls: surface.helperCalls,
      unresolved: surface.unresolved,
    });
    i = j - 1;
  }
  return out;
}
