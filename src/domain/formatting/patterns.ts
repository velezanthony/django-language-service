// ── Domain Constants ──

/** HTML void elements that do not require closing tags. */
export const HTML_VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'keygen',
  'link',
  'menuitem',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

/** DTL tags at the same indent level as their opener (else, elif, empty). */
export const DTL_MID_LEVEL_TAGS = new Set(['else', 'elif', 'empty', 'plural']);

// ── Regex Patterns ──

/** Matches `{% end___ %}` to discover block openers dynamically. */
export const END_TAG_PATTERN = /\{%[-+]?\s*end(\w+)\b/g;

/**
 * Any `{% … %}`. The body is "anything, or a `%` that does not close the tag",
 * not `[^%]*` — `{% trans "100% free" %}` is ordinary. The alternatives are
 * disjoint on their first character, so the scan stays linear.
 */
export const TEMPLATE_TAG_PATTERN = /\{%[-+]?\s*(\w+)\b(?:[^%]|%(?!\}))*%\}/g;

/** Matches `{% extends %}` to force column-zero positioning. */
export const EXTENDS_TAG_PATTERN = /\{%[-+]?\s*extends\b/;

/** Matches an HTML opening tag at the start of a line. */
export const HTML_OPENING_TAG_PATTERN = /^<([\w.:_-]+)/;

/** Matches an HTML closing tag at the start of a line. */
export const HTML_CLOSING_TAG_PATTERN = /^<\/[\w.:_-]+/;

/**
 * An HTML tag with attributes, ONLY when it is the whole line. Attributes are
 * quoted strings or non-`>` characters; `[\s\S]*?` would anchor on the last `>`
 * and swallow the element's text. A bare `>` makes this refuse the line.
 */
export const HTML_TAG_WITH_ATTRIBUTES_PATTERN =
  /^(<[\w.:_-]+)\s+((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?>)$/;

/**
 * Individual HTML attributes. A whole `{% … %}` or `{{ … }}` counts as ONE unit
 * and is tried first, or `<button {% if x %}disabled{% endif %}>` expands into
 * bare words with the delimiters gone.
 *
 * DTL inside a quoted value stays part of that attribute: the attribute branch
 * reaches it first, because the scan starts at the name.
 */
export const HTML_ATTRIBUTE_PATTERN =
  /\{%[\s\S]*?%\}|\{\{[\s\S]*?\}\}|[:@\w.-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/g;
