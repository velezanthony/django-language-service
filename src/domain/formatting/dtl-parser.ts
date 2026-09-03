/**
 * Internal parse/indent helpers for the DTL formatter.
 * Pure TypeScript — no vscode dependency.
 */

import {
  HTML_VOID_ELEMENTS,
  DTL_MID_LEVEL_TAGS,
  END_TAG_PATTERN,
  TEMPLATE_TAG_PATTERN,
  HTML_OPENING_TAG_PATTERN,
  HTML_CLOSING_TAG_PATTERN,
  HTML_TAG_WITH_ATTRIBUTES_PATTERN,
  HTML_ATTRIBUTE_PATTERN,
} from './patterns';
import { freshRegex } from '$domain/contracts/fresh-regex';

/**
 * Scan the document text for `{% end___ %}` tags and collect the base tag names
 * that act as block openers.
 */
export function discoverBlockOpeners(documentText: string): Set<string> {
  const blockOpeners = new Set<string>();
  const endTagPattern = freshRegex(END_TAG_PATTERN);
  let patternMatch: RegExpExecArray | null;

  while ((patternMatch = endTagPattern.exec(documentText)) !== null) {
    if (patternMatch[1] !== undefined) blockOpeners.add(patternMatch[1]);
  }

  return blockOpeners;
}

/**
 * Extract all Django template tag names from a line.
 */
export function extractDjangoTemplateTags(line: string): string[] {
  const templateTags: string[] = [];
  const templateTagPattern = freshRegex(TEMPLATE_TAG_PATTERN);
  let patternMatch: RegExpExecArray | null;

  while ((patternMatch = templateTagPattern.exec(line)) !== null) {
    if (patternMatch[1] !== undefined) templateTags.push(patternMatch[1]);
  }

  return templateTags;
}

/**
 * Compute how much to INCREASE the indentation level AFTER printing this line.
 */
export function computeIndentationIncrease(
  line: string,
  blockOpeners: ReadonlySet<string>,
): number {
  let indentationDelta = 0;
  const djangoTemplateTags = extractDjangoTemplateTags(line);

  const closerBaseNames: string[] = [];
  for (const tagName of djangoTemplateTags) {
    if (tagName.startsWith('end')) {
      closerBaseNames.push(tagName.substring(3));
    }
  }

  const consumedClosers = new Set<number>();
  for (const tagName of djangoTemplateTags) {
    if (tagName.startsWith('end')) {
      continue;
    }

    if (blockOpeners.has(tagName)) {
      const matchIndex = closerBaseNames.findIndex(
        (base, index) => base === tagName && !consumedClosers.has(index),
      );

      if (matchIndex >= 0) {
        consumedClosers.add(matchIndex);
      } else {
        indentationDelta++;
      }
    }

    if (DTL_MID_LEVEL_TAGS.has(tagName)) {
      indentationDelta++;
    }
    if (tagName === 'extends') {
      indentationDelta++;
    }
  }

  const htmlOpenTagMatch = line.match(HTML_OPENING_TAG_PATTERN);
  if (
    htmlOpenTagMatch &&
    htmlOpenTagMatch[1] !== undefined &&
    !line.startsWith('</') &&
    !line.endsWith('/>')
  ) {
    const htmlTagName = htmlOpenTagMatch[1].toLowerCase();
    if (!HTML_VOID_ELEMENTS.has(htmlTagName)) {
      const closingTagPattern = new RegExp(`</${htmlTagName}\\b`, 'i');
      if (!closingTagPattern.test(line)) {
        indentationDelta++;
      }
    }
  }

  return indentationDelta;
}

/**
 * Compute how much to DECREASE the indentation level BEFORE printing this line.
 */
export function computeIndentationDecrease(line: string): number {
  let decreaseDelta = 0;
  const djangoTemplateTags = extractDjangoTemplateTags(line);

  const openerNamesOnLine: string[] = djangoTemplateTags.filter(
    tagName => !tagName.startsWith('end') && !DTL_MID_LEVEL_TAGS.has(tagName),
  );
  const consumedOpeners = new Set<number>();

  for (const tagName of djangoTemplateTags) {
    if (tagName.startsWith('end')) {
      const baseName = tagName.substring(3);
      const matchIndex = openerNamesOnLine.findIndex(
        (name, index) => name === baseName && !consumedOpeners.has(index),
      );

      if (matchIndex >= 0) {
        consumedOpeners.add(matchIndex);
      } else {
        decreaseDelta++;
      }
    }
    if (DTL_MID_LEVEL_TAGS.has(tagName)) {
      decreaseDelta++;
    }
  }

  if (HTML_CLOSING_TAG_PATTERN.test(line)) {
    decreaseDelta++;
  }

  return decreaseDelta;
}

/**
 * Expand HTML attributes to one-per-line when the fully indented line
 * exceeds the configured print width.
 */
export function expandHtmlAttributes(
  line: string,
  indentationLevel: number,
  indentUnit: string,
  printWidth: number,
): string[] | null {
  const fullyIndentedLine = indentUnit.repeat(indentationLevel) + line;

  if (fullyIndentedLine.length <= printWidth) {
    return null;
  }

  const htmlTagMatch = line.match(HTML_TAG_WITH_ATTRIBUTES_PATTERN);
  if (!htmlTagMatch) {
    return null;
  }

  const tagOpening = htmlTagMatch[1] ?? '';
  const rawAttributes = (htmlTagMatch[2] ?? '').trim();
  const tagClosing = htmlTagMatch[3] ?? '';

  const attributes: string[] = [];
  const attributePattern = freshRegex(HTML_ATTRIBUTE_PATTERN);
  let attributeMatch: RegExpExecArray | null;

  while ((attributeMatch = attributePattern.exec(rawAttributes)) !== null) {
    attributes.push(attributeMatch[0]);
  }

  if (attributes.length < 2) {
    return null;
  }

  const baseIndentation = indentUnit.repeat(indentationLevel);
  const attributeIndentation = baseIndentation + indentUnit;
  const expandedLines = [`${baseIndentation}${tagOpening}`];

  for (const attribute of attributes) {
    expandedLines.push(`${attributeIndentation}${attribute}`);
  }

  const lastLineIndex = expandedLines.length - 1;
  const lastLine = expandedLines[lastLineIndex] ?? '';
  expandedLines[lastLineIndex] =
    lastLine + (tagClosing.startsWith('/') ? ` ${tagClosing}` : tagClosing);

  return expandedLines;
}

/**
 * Compute brace/bracket indent for a JS/CSS line.
 */
export function computeBraceIndent(line: string): { leadingClosers: number; netOpeners: number } {
  let leadingClosers = 0;
  for (const ch of line) {
    if (ch === '}' || ch === ']') leadingClosers++;
    else if (ch !== ' ' && ch !== '\t' && ch !== ',' && ch !== ';') break;
  }

  let depth = 0;
  let inString = false;
  let stringChar = '';
  for (const ch of line) {
    if (inString) {
      if (ch === stringChar) inString = false;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = true;
      stringChar = ch;
      continue;
    }
    if (ch === '{' || ch === '[') depth++;
    if (ch === '}' || ch === ']') depth--;
  }

  const netOpeners = Math.max(0, depth + leadingClosers);
  return { leadingClosers, netOpeners };
}
