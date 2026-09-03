/**
 * Pure DTL/HTML document formatter.
 * No vscode dependency — accepts and returns plain strings.
 */

import { EXTENDS_TAG_PATTERN, HTML_OPENING_TAG_PATTERN, DTL_MID_LEVEL_TAGS } from './patterns';
import { joinWrappedTags } from '$domain/parsers/_shared/dtl-lexer';
import { preservingInk } from '$domain/parsers/_shared/ink';
import {
  discoverBlockOpeners,
  extractDjangoTemplateTags,
  computeIndentationIncrease,
  computeIndentationDecrease,
  expandHtmlAttributes,
  computeBraceIndent,
} from './dtl-parser';

/** Options that control how the document is formatted. */
export interface FormatOptions {
  /** Number of spaces per indent level (ignored when useTabs is true). */
  readonly tabWidth: number;
  /** Use tab characters instead of spaces. */
  readonly useTabs: boolean;
  /** Expand HTML attributes to one-per-line when a line exceeds this width. */
  readonly printWidth: number;
  /** Expand HTML attributes to one-per-line when over printWidth. */
  readonly singleAttributePerLine: boolean;
}

/**
 * Default formatting options.
 *
 * CONTRACT: these values MUST mirror the `default`s declared under
 * `contributes.configuration` in package.json — the manifest is the public
 * contract. When the user has no explicit settings, VS Code hands the adapter
 * the manifest defaults; if these in-code defaults diverge, direct calls
 * (tests, tooling) format differently than the running extension.
 * A contract test in formatter.test.ts enforces the equality.
 */
export const DEFAULT_FORMAT_OPTIONS: FormatOptions = {
  tabWidth: 2,
  useTabs: false,
  printWidth: 120,
  singleAttributePerLine: false,
};

/**
 * Mutable state passed through every line-processing step.
 */
interface FormattingContext {
  readonly trimmedLine: string;
  readonly indentUnit: string;
  readonly blockOpeners: ReadonlySet<string>;
  readonly resolvedOptions: FormatOptions;
  indentationLevel: number;
  formattedLines: string[];
}

/**
 * Format a Django HTML document.
 *
 * Dynamically scans the document for `{% end___ %}` tags to discover which
 * tag names act as block openers. Works with ANY custom template tags without
 * hardcoding a fixed set.
 *
 * @param text - The raw document text to format.
 * @param options - Optional partial format options (merged with defaults).
 * @returns The formatted document text.
 */
export function formatDocument(text: string, options?: Partial<FormatOptions>): string {
  // Formatting moves whitespace. If a pass ever does more than that, the
  // document comes back as the author left it. A file that stayed unindented
  // is a complaint; a file that lost a tag is a support ticket nobody can
  // reconstruct.
  return preservingInk(text, t => formatDocumentUnchecked(t, options));
}

function formatDocumentUnchecked(text: string, options?: Partial<FormatOptions>): string {
  const resolvedOptions: FormatOptions = { ...DEFAULT_FORMAT_OPTIONS, ...options };
  const indentUnit = resolvedOptions.useTabs ? '\t' : ' '.repeat(resolvedOptions.tabWidth);

  // The document's own line ending. Everything below works in LF and the
  // result is re-joined with what came in: `split('\n')` leaves a stray
  // `\r` on every line, `trim()` eats it, and the join put back `\n` — so a
  // CRLF file came back entirely rewritten, every line marked changed, on
  // every save. `\r` is whitespace, so the ink guard never saw it.
  const eol = text.includes('\r\n') ? '\r\n' : '\n';

  // Pre-pass: collapse multi-line {% include %} tags to single lines
  const normalizedText = collapseMultilineIncludes(text).replace(/\r\n/g, '\n');
  const blockOpeners = discoverBlockOpeners(normalizedText);

  const sourceLines = normalizedText.split('\n');
  const formattedLines: string[] = [];
  let indentationLevel = 0;
  let inRawBlock = false;
  let rawBlockBaseIndent = 0;
  let inMultiLineTag = false;
  let inPreserveBlock = false;
  let preserveBaseIndent = 0;
  // A `{% … %}` left open on this line. Django allows a tag to wrap, and long
  // {% if %} conditions do; without this the opener was never recognised as
  // one, so its whole body stayed at the wrong indent.
  let pendingTag: string | null = null;

  for (const rawLine of sourceLines) {
    const trimmedLine = rawLine.trim();

    // ── Continuation of a DTL tag that wrapped ────────────────────────
    // Held one indent in from the tag it belongs to, the same shape used
    // for wrapped HTML attributes. Block tracking waits for the closing
    // `%}` and then judges the COMPLETE tag.
    if (pendingTag !== null) {
      pendingTag += ' ' + trimmedLine;
      formattedLines.push(indentUnit.repeat(indentationLevel + 1) + trimmedLine);
      if (!trimmedLine.includes('%}')) continue;

      const whole = pendingTag;
      pendingTag = null;
      const tag = /\{%[-+]?\s*(\w+)/.exec(whole)?.[1];
      if (tag) {
        if (tag.startsWith('end')) indentationLevel = Math.max(0, indentationLevel - 1);
        else if (blockOpeners.has(tag)) indentationLevel++;
      }
      continue;
    }

    // ── Inside <pre>/<textarea> → emit verbatim ────────────────────────
    // Whitespace in these two is RENDERED (HTML spec), so re-indenting
    // them changes the page: ASCII art shifts, code samples lose their
    // structure, a textarea's value gains leading spaces. The closing tag
    // line goes through untouched too — whitespace before </pre> is part
    // of the content.
    if (inPreserveBlock) {
      formattedLines.push(rawLine);
      if (PRESERVE_CLOSE_RE.test(rawLine)) {
        inPreserveBlock = false;
        indentationLevel = preserveBaseIndent;
      }
      continue;
    }

    // ── Multi-line HTML tag continuation (attributes spanning lines) ──
    if (inMultiLineTag) {
      formattedLines.push(indentUnit.repeat(indentationLevel + 1) + trimmedLine);
      if (/>\s*$/.test(trimmedLine)) {
        inMultiLineTag = false;
        if (trimmedLine.endsWith('/>')) {
          // Self-closing — no indent change
        } else {
          const closingsOnLine = (trimmedLine.match(/<\/[\w-]+\s*>/g) ?? []).length;
          indentationLevel += Math.max(0, 1 - closingsOnLine);
        }
      }
      continue;
    }

    // ── Inside <script>/<style> → format with brace-based indentation ──
    if (inRawBlock) {
      if (/^<\/(script|style)\s*>/i.test(trimmedLine)) {
        inRawBlock = false;
        indentationLevel = rawBlockBaseIndent;
        formattedLines.push(indentUnit.repeat(indentationLevel) + trimmedLine);
        continue;
      }

      if (trimmedLine === '') {
        if (!shouldCollapseBlankLine(formattedLines)) formattedLines.push('');
        continue;
      }

      const { leadingClosers, netOpeners } = computeBraceIndent(trimmedLine);

      const dtlTags = extractDjangoTemplateTags(trimmedLine);
      let dtlDecrease = 0;
      let dtlIncrease = 0;
      for (const tag of dtlTags) {
        if (tag.startsWith('end')) dtlDecrease++;
        else if (DTL_MID_LEVEL_TAGS.has(tag)) {
          dtlDecrease++;
          dtlIncrease++;
        } else if (blockOpeners.has(tag)) dtlIncrease++;
      }

      indentationLevel = Math.max(0, indentationLevel - leadingClosers - dtlDecrease);
      formattedLines.push(indentUnit.repeat(indentationLevel) + trimmedLine);
      indentationLevel += netOpeners + dtlIncrease;
      continue;
    }

    // ── Detect <script>/<style> opening → enter block mode ──
    if (/^<(script|style)[\s>]/i.test(trimmedLine) && !/<\/(script|style)\s*>/i.test(trimmedLine)) {
      rawBlockBaseIndent = indentationLevel;
      const context: FormattingContext = {
        trimmedLine,
        indentUnit,
        blockOpeners,
        resolvedOptions,
        indentationLevel,
        formattedLines,
      };
      processDocumentLine(context);
      indentationLevel = context.indentationLevel;
      inRawBlock = true;
      continue;
    }

    const context: FormattingContext = {
      trimmedLine,
      indentUnit,
      blockOpeners,
      resolvedOptions,
      indentationLevel,
      formattedLines,
    };

    processDocumentLine(context);
    indentationLevel = context.indentationLevel;

    // The opening line itself is ordinary markup — whitespace BEFORE <pre>
    // sits outside the element — so it is formatted, and only what follows
    // is preserved.
    if (opensPreserveBlock(trimmedLine)) {
      preserveBaseIndent = Math.max(0, indentationLevel - 1);
      inPreserveBlock = true;
      // Everything after `<pre>` is already inside the element, trailing
      // spaces included — and a browser draws them. The line was pushed
      // trimmed, so put back exactly what was cut off the end.
      const trailing = rawLine.slice(rawLine.trimEnd().length);
      const pushed = formattedLines[formattedLines.length - 1];
      if (trailing !== '' && pushed !== undefined) {
        formattedLines[formattedLines.length - 1] = pushed + trailing;
      }
      continue;
    }

    if (!inRawBlock && HTML_OPENING_TAG_PATTERN.test(trimmedLine) && !trimmedLine.includes('>')) {
      inMultiLineTag = true;
      indentationLevel = Math.max(0, indentationLevel - 1);
    }

    // A `{%` with no `%}` after it: the tag continues on the next line.
    if (opensDtlTagAcrossLines(trimmedLine)) {
      pendingTag = trimmedLine;
      // processDocumentLine already judged the fragment; a partial tag
      // opens nothing, so undo any level it took for it.
      const fragmentTag = /\{%[-+]?\s*(\w+)/.exec(trimmedLine)?.[1];
      if (fragmentTag && blockOpeners.has(fragmentTag)) {
        indentationLevel = Math.max(0, indentationLevel - 1);
      }
    }
  }

  return removeTrailingBlankLines(formattedLines).join(eol) + eol;
}

// <pre> and <textarea> are the two elements whose text content preserves
// whitespace. <script>/<style> do not — those are reindented on purpose.
//
// {% verbatim %} joins them for the same reason: Django emits everything
// between the tags exactly as written, so re-indenting it changes the rendered
// page. The tag exists precisely to say "do not touch this".
const PRESERVE_OPEN_RE = /<(pre|textarea)(?=[\s>])|\{%[-+]?\s*verbatim\b/gi;
const PRESERVE_CLOSE_RE = /<\/(pre|textarea)\s*>|\{%[-+]?\s*endverbatim\s*[-+]?%\}/i;

/** True when the line opens a `{% … %}` that is not closed on it. */
function opensDtlTagAcrossLines(line: string): boolean {
  const lastOpen = line.lastIndexOf('{%');
  return lastOpen !== -1 && line.indexOf('%}', lastOpen) === -1;
}

/**
 * The line with every quoted attribute value blanked, same length.
 *
 * `<div data-hint="use <pre> for code">` opened a preservation block that never
 * closed, and the whole rest of the file came back verbatim — no indentation,
 * no warning. Text inside a quoted value is data, not markup.
 */
function withoutAttributeValues(line: string): string {
  return line.replace(/"[^"]*"|'[^']*'/g, m => ' '.repeat(m.length));
}

/** True when the line leaves a <pre>/<textarea> open. */
function opensPreserveBlock(line: string): boolean {
  const markup = withoutAttributeValues(line);
  const opens = (markup.match(PRESERVE_OPEN_RE) ?? []).length;
  const closes = (markup.match(/<\/(pre|textarea)\s*>|\{%[-+]?\s*endverbatim\s*[-+]?%\}/gi) ?? [])
    .length;
  return opens > closes;
}

/**
 * Process a single line of the document, mutating the formatting context.
 */
function processDocumentLine(context: FormattingContext): void {
  const { trimmedLine, indentUnit, blockOpeners, resolvedOptions, formattedLines } = context;

  if (isBlankLine(trimmedLine)) {
    if (!shouldCollapseBlankLine(formattedLines)) {
      formattedLines.push('');
    }
    return;
  }

  context.indentationLevel = Math.max(
    0,
    context.indentationLevel - computeIndentationDecrease(trimmedLine),
  );

  if (EXTENDS_TAG_PATTERN.test(trimmedLine)) {
    context.indentationLevel = 0;
  }

  if (resolvedOptions.singleAttributePerLine) {
    const expandedLines = expandHtmlAttributes(
      trimmedLine,
      context.indentationLevel,
      indentUnit,
      resolvedOptions.printWidth,
    );

    if (expandedLines) {
      formattedLines.push(...expandedLines);
      context.indentationLevel += computeIndentationIncrease(trimmedLine, blockOpeners);
      context.indentationLevel = Math.max(0, context.indentationLevel);
      return;
    }
  }

  formattedLines.push(indentUnit.repeat(context.indentationLevel) + trimmedLine);

  context.indentationLevel += computeIndentationIncrease(trimmedLine, blockOpeners);
  context.indentationLevel = Math.max(0, context.indentationLevel);
}

function isBlankLine(trimmedLine: string): boolean {
  return trimmedLine === '';
}

function shouldCollapseBlankLine(formattedLines: string[]): boolean {
  if (formattedLines.length === 0) {
    return true;
  }
  return (formattedLines[formattedLines.length - 1] ?? '').trim() === '';
}

function removeTrailingBlankLines(lines: string[]): string[] {
  const result = [...lines];
  while (result.length > 0 && (result[result.length - 1] ?? '').trim() === '') {
    result.pop();
  }
  return result;
}

/**
 * Collapse multi-line `{% include %}` tags to single lines.
 */
export function collapseMultilineIncludes(text: string): string {
  // Inside <pre> and <textarea> the author's own formatting is left alone.
  // Joining the tag would not change the RENDERED page — Django consumes the
  // whole `{% … %}` and its internal newline never reaches the browser — but
  // this formatter's rule for those two elements is "do not touch", and
  // reaching past it from a pre-pass is how the rule got broken in the first
  // place. {% verbatim %} is not listed: the lexer already marks its body
  // inert, and there the tag really is literal text.
  const kept = preserveSpans(text);
  return joinWrappedTags(
    text,
    t => t.name === 'include' && !kept.some(([a, b]) => t.start >= a && t.start < b),
  );
}

/** Ranges of `<pre>` / `<textarea>` content, including an unclosed one. */
function preserveSpans(text: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  const paired = /<(pre|textarea)(?=[\s>])[\s\S]*?<\/\1\s*>/gi;
  for (const m of text.matchAll(paired)) {
    spans.push([m.index ?? 0, (m.index ?? 0) + m[0].length]);
  }
  for (const m of text.matchAll(/<(pre|textarea)(?=[\s>])/gi)) {
    const at = m.index ?? 0;
    if (!spans.some(([a, b]) => at >= a && at < b)) spans.push([at, text.length]);
  }
  return spans;
}
