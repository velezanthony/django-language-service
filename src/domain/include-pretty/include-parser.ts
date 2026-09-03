/**
 * Pure parser for Django `{% include %}` tags.
 * No vscode dependency.
 */

/** Parsed structure of a Django {% include %} tag. */
export interface IncludeParts {
  /** The opening portion: "{% include" or "{%- include". */
  readonly openTag: string;
  /** The quoted template path: '"component.html"'. */
  readonly templatePath: string;
  /** The parsed prop entries. */
  readonly props: ReadonlyArray<IncludeProp>;
  /** Whether the "with" keyword was present. */
  readonly hasWith: boolean;
  /** Whether the "only" keyword was present. */
  readonly hasOnly: boolean;
  /** The closing portion: "%}" or "-%}". */
  readonly closeTag: string;
}

/** A single prop inside a Django {% include %} tag. */
export interface IncludeProp {
  readonly name: string;
  readonly quote: string;
  readonly value: string;
  readonly hasHTML: boolean;
}

/**
 * Parse a Django `{% include %}` tag into its structural parts.
 *
 * Handles the full syntax including `with`, `only`, and arbitrarily complex
 * prop values (including nested HTML and mixed quote characters).
 *
 * @param text - The raw text of the include tag (may span multiple lines).
 * @returns The parsed structure, or null if the text is not a valid include tag.
 */
export function parseIncludeTag(text: string): IncludeParts | null {
  // NOT flattened first. Joining the lines with a space turned the newlines
  // inside a prop's value into spaces before anyone could tell them apart, so
  // collapsing an expanded include gave back `<b> hi </b>` where the author
  // had written `<b>hi</b>`. The prop reader walks characters and handles
  // newlines by itself; `\s` in the patterns below already crosses them.
  const flattenedText = text.trim();

  const openingMatch = flattenedText.match(/^(\{%[-+]?\s*include\s+)("[^"]+"|'[^']+')\s*/);

  if (!openingMatch) {
    return null;
  }

  const openTag = openingMatch[1] ?? '';
  const templatePath = openingMatch[2] ?? '';
  let remainingText = flattenedText.substring(openingMatch[0]?.length ?? 0);

  const closingMatch = remainingText.match(/\s*([-+]?%\})$/);

  if (!closingMatch) {
    return null;
  }

  const closeTag = closingMatch[1] ?? '';
  remainingText = remainingText.substring(0, remainingText.length - (closingMatch[0]?.length ?? 0));

  let hasOnly = false;
  if (/\bonly\s*$/.test(remainingText)) {
    hasOnly = true;
    remainingText = remainingText.replace(/\bonly\s*$/, '').trim();
  }

  let hasWith = false;
  if (/^with\s+/.test(remainingText)) {
    hasWith = true;
    remainingText = remainingText.replace(/^with\s+/, '');
  }

  const props = parseIncludeProps(remainingText);

  return { openTag, templatePath, props, hasWith, hasOnly, closeTag };
}

/**
 * Parse prop entries from a raw string like `key1="value1" key2='value2'`.
 *
 * Uses a stateful character-by-character parser to correctly handle nested
 * quotes, escaped characters, and HTML content inside values.
 */
export function parseIncludeProps(text: string): IncludeProp[] {
  const props: IncludeProp[] = [];
  let characterIndex = 0;

  while (characterIndex < text.length) {
    // Skip whitespace
    while (characterIndex < text.length && /\s/.test(text[characterIndex] ?? '')) {
      characterIndex++;
    }

    if (characterIndex >= text.length) {
      break;
    }

    // Read the prop name
    const nameStartIndex = characterIndex;
    while (characterIndex < text.length && /[\w-]/.test(text[characterIndex] ?? '')) {
      characterIndex++;
    }

    if (characterIndex === nameStartIndex) {
      characterIndex++;
      continue;
    }

    const propName = text.substring(nameStartIndex, characterIndex);

    // Skip whitespace and equals sign
    while (characterIndex < text.length && /\s/.test(text[characterIndex] ?? '')) {
      characterIndex++;
    }

    if (characterIndex >= text.length || text[characterIndex] !== '=') {
      continue;
    }

    characterIndex++; // skip '='

    while (characterIndex < text.length && /\s/.test(text[characterIndex] ?? '')) {
      characterIndex++;
    }

    if (characterIndex >= text.length) {
      break;
    }

    const quoteCharacter = text[characterIndex];

    // An UNQUOTED value: `product=product`, `n=3`, `flag=True`, `x=a.b` —
    // the commonest form there is. This used to `continue`, which not only
    // skipped the prop but left the cursor on the value, so the value was
    // then read as the next prop name and dropped in turn. Everything
    // unquoted vanished, and collapsing an include DELETED it from the
    // document.
    if (quoteCharacter !== '"' && quoteCharacter !== "'") {
      const bareStart = characterIndex;
      while (characterIndex < text.length && !/\s/.test(text[characterIndex] ?? '')) {
        characterIndex++;
      }
      const bare = text.substring(bareStart, characterIndex);
      if (bare) props.push({ name: propName, quote: '', value: bare, hasHTML: false });
      continue;
    }

    characterIndex++; // skip opening quote

    const valueStartIndex = characterIndex;

    while (characterIndex < text.length) {
      if (text[characterIndex] === '\\') {
        characterIndex += 2;
        continue;
      }
      if (text[characterIndex] === quoteCharacter) {
        break;
      }
      characterIndex++;
    }

    const propValue = text.substring(valueStartIndex, characterIndex);

    if (characterIndex < text.length) {
      characterIndex++; // skip closing quote
    }

    const containsHtml = /<[a-zA-Z]/.test(propValue) && propValue.includes('>');

    props.push({
      name: propName,
      quote: quoteCharacter,
      value: propValue,
      hasHTML: containsHtml,
    });
  }

  return props;
}

/**
 * Format an HTML string with proper indentation.
 *
 * Parses the HTML character by character, tracking tag nesting depth,
 * and outputs each tag and text node on its own indented line.
 */
export function formatHtmlContent(html: string, indentation: string): string {
  const trimmedHtml = html.trim();

  if (!trimmedHtml) {
    return '';
  }

  const formattedLines: string[] = [];
  let nestingLevel = 0;
  let characterIndex = 0;

  while (characterIndex < trimmedHtml.length) {
    if (trimmedHtml[characterIndex] === '<') {
      const isClosingTag = (trimmedHtml[characterIndex + 1] ?? '') === '/';

      let tagEndIndex = characterIndex + 1;
      let insideQuote = '';

      while (tagEndIndex < trimmedHtml.length) {
        const currentCharacter = trimmedHtml[tagEndIndex] ?? '';

        if (insideQuote) {
          if (currentCharacter === insideQuote) {
            insideQuote = '';
          }
        } else {
          if (currentCharacter === '"' || currentCharacter === "'") {
            insideQuote = currentCharacter;
          } else if (currentCharacter === '>') {
            break;
          }
        }
        tagEndIndex++;
      }

      const fullTag = trimmedHtml.substring(characterIndex, tagEndIndex + 1);
      const isSelfClosing = fullTag.endsWith('/>');
      const isVoidElement =
        /^<(?:area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr|path|circle|rect|line|polyline|polygon)\b/i.test(
          fullTag,
        );

      if (isClosingTag) {
        nestingLevel = Math.max(0, nestingLevel - 1);
      }

      formattedLines.push(
        indentation + '  '.repeat(nestingLevel) + fullTag.replace(/\s{2,}/g, ' '),
      );

      if (!isClosingTag && !isSelfClosing && !isVoidElement) {
        nestingLevel++;
      }

      characterIndex = tagEndIndex + 1;
    } else {
      const nextTagIndex = trimmedHtml.indexOf('<', characterIndex);
      const rawText =
        nextTagIndex === -1
          ? trimmedHtml.substring(characterIndex)
          : trimmedHtml.substring(characterIndex, nextTagIndex);
      const textContent = rawText.trim();

      // Whitespace at the boundary between text and markup is CONTENT: a
      // browser draws it, and `hi <b>there</b> friend` is two spaces on
      // the page. Trimming it away meant Pretty followed by Collapse —
      // two commands on the same menu, inverses as far as the author is
      // concerned — returned `hi<b>there</b>friend`. Only whitespace had
      // changed, so the ink guard allowed it.
      //
      // It is kept at the END of the preceding line, because collapsing
      // removes a newline together with the indentation that follows it
      // and would take a leading space with them.
      const previous = formattedLines.length - 1;
      if (/^\s/.test(rawText) && previous >= 0) {
        formattedLines[previous] += ' ';
      }

      if (textContent) {
        formattedLines.push(
          indentation + '  '.repeat(nestingLevel) + textContent + (/\s$/.test(rawText) ? ' ' : ''),
        );
      }

      characterIndex = nextTagIndex === -1 ? trimmedHtml.length : nextTagIndex;
    }
  }

  return formattedLines.join('\n');
}

/**
 * Collapse an HTML string into a single line by removing extra whitespace.
 */
export function collapseHtmlContent(html: string): string {
  return html
    .replace(/\n\s*/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
