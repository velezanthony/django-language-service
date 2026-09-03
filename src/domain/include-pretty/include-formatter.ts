/**
 * Pure include-pretty formatter.
 * No vscode dependency.
 */

import { parseIncludeTag, formatHtmlContent, collapseHtmlContent } from './include-parser';
import { preservingInk } from '$domain/parsers/_shared/ink';

/** Standard indentation unit for expanded include props. */
const INDENTATION_UNIT = '    ';

/**
 * Expand a Django `{% include %}` tag into a multi-line pretty format.
 *
 * Props that contain HTML values are expanded with proper indentation.
 * If no props contain HTML, the original text is returned unchanged.
 *
 * @param text - The raw single-line include tag text.
 * @param baseIndentation - The leading whitespace to use as the base indent.
 * @returns The pretty-formatted multi-line string, or the original text if not applicable.
 */
export function prettyFormatInclude(text: string, baseIndentation: string): string {
  return preservingInk(text, t => prettyFormatIncludeUnchecked(t, baseIndentation));
}

function prettyFormatIncludeUnchecked(text: string, baseIndentation: string): string {
  const parsedParts = parseIncludeTag(text);

  if (!parsedParts) {
    return text;
  }

  const hasHtmlProps = parsedParts.props.some(prop => prop.hasHTML);

  if (!hasHtmlProps) {
    return text;
  }

  const propIndentation = baseIndentation + INDENTATION_UNIT;
  const outputLines: string[] = [];

  const openingLine = `${baseIndentation}${parsedParts.openTag}${parsedParts.templatePath}`;
  outputLines.push(openingLine);

  if (parsedParts.hasWith) {
    outputLines.push(`${propIndentation}with`);
  }

  const valueIndentation = propIndentation + INDENTATION_UNIT;
  const propBaseIndentation = parsedParts.hasWith
    ? propIndentation + INDENTATION_UNIT
    : propIndentation;

  for (const prop of parsedParts.props) {
    if (prop.hasHTML) {
      // Collapsed FIRST, then expanded. Expanding a value that is already
      // expanded reads the previous pass's indentation as content — the
      // boundary spaces the expansion keeps would grow by one on every
      // run, so `pretty(pretty(x))` stopped equalling `pretty(x)`.
      // Normalising first makes idempotence structural rather than
      // something the line-breaking has to be careful about.
      const formattedHtml = formatHtmlContent(collapseHtmlContent(prop.value), valueIndentation);
      outputLines.push(`${propBaseIndentation}${prop.name}=${prop.quote}`);
      outputLines.push(formattedHtml);
      outputLines.push(`${propBaseIndentation}${prop.quote}`);
    } else {
      outputLines.push(
        `${propBaseIndentation}${prop.name}=${prop.quote}${prop.value}${prop.quote}`,
      );
    }
  }

  if (parsedParts.hasOnly) {
    outputLines.push(`${propBaseIndentation}only`);
  }

  outputLines.push(`${baseIndentation}${parsedParts.closeTag}`);

  return outputLines.join('\n');
}

/**
 * Collapse a multi-line Django `{% include %}` tag into a single line.
 *
 * All HTML prop values are collapsed to remove internal whitespace,
 * and the entire tag is flattened onto one line.
 */
export function collapseFormatInclude(text: string): string {
  return preservingInk(text, collapseFormatIncludeUnchecked);
}

function collapseFormatIncludeUnchecked(text: string): string {
  const parsedParts = parseIncludeTag(text);

  if (!parsedParts) {
    // Unreadable is not the same as collapsible. This used to flatten every
    // line onto one — and because that only moves whitespace, `preservingInk`
    // let it through, so an unclosed tag turned a region of markup into a
    // single line with nothing to warn the author.
    return text;
  }

  const leadingWhitespace = extractLeadingWhitespace(text);
  const segments: string[] = [`${parsedParts.openTag}${parsedParts.templatePath}`];

  if (parsedParts.hasWith) {
    segments.push('with');
  }

  for (const prop of parsedParts.props) {
    // Only a value that actually holds markup goes through the HTML
    // collapser. Running it over every value squeezed runs of spaces out of
    // ordinary text: a title of "Hola  mundo" came back with one.
    const collapsedValue = prop.hasHTML ? collapseHtmlContent(prop.value) : prop.value;
    segments.push(`${prop.name}=${prop.quote}${collapsedValue}${prop.quote}`);
  }

  if (parsedParts.hasOnly) {
    segments.push('only');
  }

  segments.push(parsedParts.closeTag);

  return leadingWhitespace + segments.join(' ');
}

function extractLeadingWhitespace(text: string): string {
  const whitespaceMatch = text.match(/^(\s*)/);
  return whitespaceMatch ? (whitespaceMatch[1] ?? '') : '';
}
