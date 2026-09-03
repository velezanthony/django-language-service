/**
 * Pure toggle-comment logic for Django template files.
 * No vscode dependency — operates on plain strings and returns edit descriptors.
 */

/** Opening delimiter for an inline Django template comment. */
const INLINE_COMMENT_OPEN = '{# ';

/** Closing delimiter for an inline Django template comment. */
const INLINE_COMMENT_CLOSE = ' #}';

/**
 * Matches one complete `{# ... #}` inline comment (non-greedy), capturing the
 * inner content with at most one padding space stripped on each side.
 * Global so a single line containing SEVERAL inline comments unwraps each pair
 * independently — a naive slice(2, -2) on `{# a #} texto {# b #}` would rip the
 * outer delimiters only and corrupt the line.
 */
const INLINE_COMMENT_PAIR_RE = /\{#\s?([\s\S]*?)\s?#\}/g;

/** Opening tag for a Django block comment. */
const BLOCK_COMMENT_OPEN = '{% comment %}';

/** Closing tag for a Django block comment. */
const BLOCK_COMMENT_CLOSE = '{% endcomment %}';

/**
 * The opening tag as written, anywhere on the line. Django allows an optional
 * note — `{% comment "why this is off" %}` — so the body is not empty-only.
 * `[^%]*?` cannot reach past the closing `%`, which makes the match unambiguous
 * and linear: there is exactly one way to reach the terminator.
 *
 * `\s*comment\b` does not match `{% endcomment %}`: the word there starts `end`.
 */
const BLOCK_COMMENT_OPEN_RE = /\{%-?\s*comment\b[^%]*?-?%\}/;

/** The closing tag as written, anywhere on the line. */
const BLOCK_COMMENT_CLOSE_RE = /\{%-?\s*endcomment\s*-?%\}/;

/** A range within a document expressed as zero-based line/column offsets. */
export interface TextRange {
  readonly startLine: number;
  readonly startCol: number;
  readonly endLine: number;
  readonly endCol: number;
}

/** Describes a single text replacement. */
export interface TextEdit {
  /** Zero-based line number of the line to replace entirely. */
  readonly line: number;
  /** New text for that line (no trailing newline). */
  readonly newText: string;
}

/** Result of a toggle-comment operation. */
export interface ToggleCommentResult {
  /** Whether lines should be inserted (block comment add) or deleted (block comment remove). */
  readonly op: 'replace-lines' | 'insert-before-after' | 'delete-lines';
  /** For 'replace-lines': the changed lines. */
  readonly replacements?: ReadonlyArray<TextEdit>;
  /** For 'insert-before-after': line index to insert before (opener) and after (closer). */
  readonly insertBeforeLine?: number;
  readonly insertAfterLine?: number;
  readonly insertBeforeText?: string;
  readonly insertAfterText?: string;
  /**
   * Line indices to delete whole. Accompanies 'replace-lines' when unwrapping
   * a block comment leaves one tag line empty and the other holding text the
   * author wrote; both must be applied, and they never touch the same line.
   */
  readonly deleteLines?: ReadonlyArray<number>;
}

/**
 * Compute the comment-toggle edits for a selection spanning one or more lines.
 *
 * - Empty/single-line: uses `{# inline #}` syntax.
 * - Multi-line: uses `{% comment %}...{% endcomment %}` block syntax.
 *
 * The caller is responsible for applying the returned edits to the document.
 *
 * @param lines - ALL document lines (zero-based).
 * @param selection - The active selection range.
 * @returns A descriptor of the edits to apply.
 */
export function toggleDtlComment(
  lines: ReadonlyArray<string>,
  selection: TextRange,
): ToggleCommentResult {
  const isSingleLine = selection.startLine === selection.endLine;

  if (isSingleLine) {
    return toggleInlineComment(lines, selection.startLine);
  }

  return toggleBlockComment(lines, selection.startLine, selection.endLine);
}

/**
 * Toggle an inline `{# ... #}` comment on a single line.
 */
function toggleInlineComment(lines: ReadonlyArray<string>, lineIndex: number): ToggleCommentResult {
  const lineText = lines[lineIndex] ?? '';
  const trimmedText = lineText.trim();

  // Commented means NOTHING on the line is live — not merely that it opens
  // and closes with a comment. `{# hidden #} <p>visible</p> {# note #}`
  // satisfied `startsWith` and `endsWith`, so pressing toggle on a live line
  // UNCOMMENTED it and revealed text the author had deliberately hidden.
  const liveOutsideComments = trimmedText.replace(INLINE_COMMENT_PAIR_RE, '').trim() === '';

  if (trimmedText.startsWith('{#') && trimmedText.endsWith('#}') && liveOutsideComments) {
    // Remove comment delimiters — pairwise, so lines holding more than one
    // inline comment ({# a #} texto {# b #}) unwrap cleanly to `a texto b`.
    const innerContent = trimmedText.replace(INLINE_COMMENT_PAIR_RE, '$1');

    const leadingWhitespace = lineText.substring(0, lineText.indexOf(trimmedText));
    return {
      op: 'replace-lines',
      replacements: [{ line: lineIndex, newText: `${leadingWhitespace}${innerContent}` }],
    };
  }

  // A line already holding `#}` cannot be wrapped in `{# … #}`: Django ends
  // the comment at the FIRST `#}` it meets, so the tail — and the stray
  // closer — would render as visible text. Commenting out a line that carries
  // a trailing inline comment is an ordinary thing to do, so it gets the
  // block form, which nests fine.
  if (trimmedText.includes(INLINE_COMMENT_CLOSE.trim())) {
    return toggleBlockComment(lines, lineIndex, lineIndex);
  }

  // Wrap in inline comment
  const leadingWhitespace =
    lineText.length - lineText.trimStart().length > 0
      ? lineText.substring(0, lineText.length - lineText.trimStart().length)
      : '';
  return {
    op: 'replace-lines',
    replacements: [
      {
        line: lineIndex,
        newText: `${leadingWhitespace}${INLINE_COMMENT_OPEN}${trimmedText}${INLINE_COMMENT_CLOSE}`,
      },
    ],
  };
}

/**
 * Toggle a `{% comment %}...{% endcomment %}` block comment around multiple lines.
 */
function toggleBlockComment(
  lines: ReadonlyArray<string>,
  startLine: number,
  endLine: number,
): ToggleCommentResult {
  const firstLine = lines[startLine] ?? '';
  const lastLine = lines[endLine] ?? '';

  const isAlreadyCommented =
    BLOCK_COMMENT_OPEN_RE.test(firstLine) && BLOCK_COMMENT_CLOSE_RE.test(lastLine);

  if (isAlreadyCommented) {
    // Remove the two TAGS, not the two LINES. `{% comment %}` and
    // `{% endcomment %}` are tags the author may share a line with: a note
    // after the opener, live markup after the closer. Deleting the line took
    // that text with it, silently, on a keystroke.
    //
    // A line that held nothing but its tag is still deleted — otherwise
    // comment→uncomment would leave a blank line behind and stop being a
    // round-trip.
    const replacements: TextEdit[] = [];
    const deleteLines: number[] = [];

    for (const [line, tagRe] of [
      [startLine, BLOCK_COMMENT_OPEN_RE],
      [endLine, BLOCK_COMMENT_CLOSE_RE],
    ] as const) {
      const residue = (lines[line] ?? '').replace(tagRe, '');
      if (residue.trim() === '') deleteLines.push(line);
      else replacements.push({ line, newText: residue });
    }

    return replacements.length === 0
      ? { op: 'delete-lines', deleteLines }
      : { op: 'replace-lines', replacements, deleteLines };
  }

  const leadingWhitespace =
    firstLine.length - firstLine.trimStart().length > 0
      ? firstLine.substring(0, firstLine.length - firstLine.trimStart().length)
      : '';

  return {
    op: 'insert-before-after',
    insertBeforeLine: startLine,
    insertAfterLine: endLine,
    insertBeforeText: `${leadingWhitespace}${BLOCK_COMMENT_OPEN}`,
    insertAfterText: `${leadingWhitespace}${BLOCK_COMMENT_CLOSE}`,
  };
}
