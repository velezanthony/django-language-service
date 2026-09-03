/**
 * Where to draw the squiggle for one context diagnostic.
 *
 * Split out of the adapter so it can be tested without a vscode runtime —
 * the adapter only turns the offsets into a `vscode.Range`.
 */

export interface DiagnosticAnchor {
  readonly variable: string;
  readonly root: string;
  /** 1-based column reported by the engine. */
  readonly col: number;
}

export interface ColumnSpan {
  /** 0-based, inclusive. */
  readonly start: number;
  /** 0-based, exclusive. */
  readonly end: number;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The engine already knows the column, so use it.
 *
 * Searching the line for the variable instead — the previous behaviour — finds
 * the FIRST occurrence every time, so `{{ x }} … {{ x }}` drew both squiggles
 * on the first one and left the second unmarked. The search stays as a
 * fallback for when the reported column does not line up with the text.
 */
export function resolveColumnSpan(lineText: string, d: DiagnosticAnchor): ColumnSpan {
  const at = d.col - 1;
  if (at >= 0 && lineText.startsWith(d.variable, at)) {
    return { start: at, end: at + d.variable.length };
  }
  if (at >= 0 && lineText.startsWith(d.root, at)) {
    return { start: at, end: at + d.root.length };
  }
  const match =
    lineText.match(new RegExp(`\\b${escapeRegex(d.variable)}\\b`)) ??
    lineText.match(new RegExp(`\\b${escapeRegex(d.root)}\\b`));
  const start = match?.index ?? Math.max(0, at);
  return { start, end: start + (match?.[0] ?? d.root).length };
}
