/**
 * Pure helpers to locate `{% include %}` tags inside a document.
 * No vscode dependency — operates on plain string arrays.
 */

export const INCLUDE_TAG_PATTERN = /\{%[-+]?\s*include\b/;

export interface IncludeTagBound {
  /** The full tag text, joined by `\n` if multi-line. */
  readonly tagText: string;
  /** Zero-based index of the first line of the tag. */
  readonly startLine: number;
  /** Zero-based index of the last line of the tag (inclusive). */
  readonly endLine: number;
}

/**
 * Scan a list of document lines and return every `{% include %}` tag found.
 *
 * Tags that span multiple lines are merged; each bound spans from the
 * line where `{% include` opens to the line where `%}` closes.
 *
 * Lines are NOT re-scanned after a tag closes — two includes on the
 * same physical line are not both captured.
 */
export function findAllIncludeTagBoundsInLines(lines: string[]): IncludeTagBound[] {
  const bounds: IncludeTagBound[] = [];
  let lineIndex = 0;

  while (lineIndex < lines.length) {
    const lineText = lines[lineIndex] ?? '';

    if (!INCLUDE_TAG_PATTERN.test(lineText)) {
      lineIndex++;
      continue;
    }

    let endLine = lineIndex;
    let fullTagText = lineText;

    while (!fullTagText.includes('%}') && endLine < lines.length - 1) {
      // A new `{% include` opening means this one was never closed. Without
      // this stop the walk borrows the NEXT tag's `%}` and reports one
      // bound spanning both, plus whatever markup sat between them.
      if (INCLUDE_TAG_PATTERN.test(lines[endLine + 1] ?? '')) break;
      endLine++;
      fullTagText += '\n' + (lines[endLine] ?? '');
    }

    if (!fullTagText.includes('%}')) {
      // Not a tag — an include the author has not finished typing, which
      // is an ordinary state while editing. It used to run to end of file
      // and hand the whole remainder to the collapser as tag text.
      lineIndex++;
      continue;
    }

    bounds.push({ tagText: fullTagText, startLine: lineIndex, endLine });
    lineIndex = endLine + 1;
  }

  return bounds;
}

/** One `{% include %}` the author wrapped across lines. */
export interface MultiLineInclude {
  /** Zero-based line where `{% include` opens. */
  readonly startLine: number;
  /** Zero-based line where `%}` closes it. */
  readonly endLine: number;
  /** Column of `{%` on the opening line — past the indentation. */
  readonly openingStart: number;
  /** Column at the end of the opening line. */
  readonly openingEnd: number;
}

/**
 * Every `{% include %}` that spans more than one line.
 *
 * A function over text, not over a TextDocument, so the two callers can share
 * it: the diagnostics adapter, which has an open document, and the workspace
 * badge pass, which only has bytes. That pass used to open a TextDocument per
 * template — thousands of them, resident for the session, each one firing
 * `onDidOpenTextDocument` into every adapter subscribed to it.
 *
 * An unterminated tag is not reported: while it is being typed there is
 * nothing to collapse yet, and the old code would have run to end of file.
 */
export function findMultiLineIncludes(text: string): MultiLineInclude[] {
  // `\r` dropped so a CRLF file reports the same columns VS Code does —
  // `TextDocument.lineAt().text` has already stripped it.
  const lines = text.split('\n').map(l => (l.endsWith('\r') ? l.slice(0, -1) : l));
  const found: MultiLineInclude[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const lineText = lines[lineIndex] ?? '';
    if (!INCLUDE_TAG_PATTERN.test(lineText)) continue;
    if (lineText.includes('%}')) continue; // single-line — nothing to collapse

    let endLine = lineIndex + 1;
    while (endLine < lines.length && !(lines[endLine] ?? '').includes('%}')) {
      endLine++;
    }
    if (endLine >= lines.length) continue; // never closed

    found.push({
      startLine: lineIndex,
      endLine,
      openingStart: /^\s*/.exec(lineText)?.[0].length ?? 0,
      openingEnd: lineText.length,
    });
    lineIndex = endLine;
  }

  return found;
}
