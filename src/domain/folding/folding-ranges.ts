/**
 * Pure folding-range computation for Django templates.
 * No vscode dependency — operates on plain string arrays.
 */
import { offsetMapper } from '$domain/parsers/_shared/offsets';

/** Mirrors vscode.FoldingRangeKind without importing vscode. */
export const FoldingRangeKind = {
  Comment: 1,
  Imports: 2,
  Region: 3,
} as const;

export type FoldingRangeKindValue = (typeof FoldingRangeKind)[keyof typeof FoldingRangeKind];

export interface FoldingRange {
  /** Zero-based start line (inclusive). */
  readonly start: number;
  /** Zero-based end line (inclusive). */
  readonly end: number;
  readonly kind: FoldingRangeKindValue;
}

/**
 * Scan the document text for `{% end___ %}` tags and collect the base tag names
 * that act as block openers.
 */
function discoverBlockOpeners(documentText: string): Set<string> {
  const blockOpeners = new Set<string>();
  const endTagPattern = /\{%[-+]?\s*end(\w+)\b/g;
  let m: RegExpExecArray | null;
  while ((m = endTagPattern.exec(documentText)) !== null) {
    if (m[1] !== undefined) blockOpeners.add(m[1]);
  }
  return blockOpeners;
}

/**
 * Compute all foldable ranges for a Django template document.
 *
 * @param lines - The document lines (split on `\n`, without trailing newlines).
 * @returns An array of folding ranges.
 */
export function getFoldingRanges(lines: string[]): FoldingRange[] {
  const documentText = lines.join('\n');
  const ranges: FoldingRange[] = [];

  collectTemplateTagRanges(lines, documentText, ranges);
  collectHtmlCommentRanges([], documentText, ranges);

  return ranges;
}

/**
 * Discover DTL block openers and match them with their closers.
 */
function collectTemplateTagRanges(
  lines: string[],
  documentText: string,
  ranges: FoldingRange[],
): void {
  const blockOpeners = discoverBlockOpeners(documentText);
  const openerLineStacks = new Map<string, number[]>();

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const lineText = lines[lineIndex] ?? '';
    const templateTagPattern = /\{%[-+]?\s*(\w+)\b/g;
    let tagMatch: RegExpExecArray | null;

    while ((tagMatch = templateTagPattern.exec(lineText)) !== null) {
      const tagName = tagMatch[1];
      if (tagName === undefined) continue;

      if (blockOpeners.has(tagName)) {
        if (!openerLineStacks.has(tagName)) {
          openerLineStacks.set(tagName, []);
        }
        openerLineStacks.get(tagName)!.push(lineIndex);
      } else if (tagName.startsWith('end')) {
        const baseTagName = tagName.substring(3);
        const openerStack = openerLineStacks.get(baseTagName);

        if (openerStack && openerStack.length > 0) {
          const openerLineNumber = openerStack.pop()!;

          if (lineIndex > openerLineNumber + 1) {
            ranges.push({
              start: openerLineNumber,
              end: lineIndex - 1,
              kind: FoldingRangeKind.Region,
            });
          }
        }
      }
    }
  }
}

/**
 * Find multi-line HTML comments and create comment-type folding ranges.
 */
function collectHtmlCommentRanges(
  _lines: string[],
  documentText: string,
  ranges: FoldingRange[],
): void {
  // One line table for the whole document, binary-searched per hit.
  // `offsetToLine` counted newlines from offset zero and ran twice per
  // comment, so a page of 8000 comments — 192 KB, which a generated page
  // reaches easily — took over ten seconds on the extension host while the
  // author waited to fold a region. Three parsers already shared this helper.
  const at = offsetMapper(documentText);
  const lineOf = (offset: number): number => at(offset).line - 1;

  const htmlCommentOpenPattern = /<!--/g;
  let commentMatch: RegExpExecArray | null;

  while ((commentMatch = htmlCommentOpenPattern.exec(documentText)) !== null) {
    const startOffset = commentMatch.index;
    const closeIndex = documentText.indexOf('-->', startOffset + 4);

    if (closeIndex <= startOffset) {
      continue;
    }

    const startLine = lineOf(startOffset);
    const endLine = lineOf(closeIndex + 3);

    if (endLine > startLine) {
      ranges.push({ start: startLine, end: endLine, kind: FoldingRangeKind.Comment });
    }
  }
}
