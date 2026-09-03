/** Shared HTML/DTL regex constants. Pure — no vscode / fs / path imports. */

import { PY_IDENT } from './python-tokens';

/** Strip Django comments {# ... #} and <script>…</script> blocks in one pass. */
export const STRIP_RE = /\{#.*?#\}|<script[\s>][\s\S]*?<\/script>/gi;

/** Match {{ expression }} in a template source. */
export const VAR_TAG_RE = /\{\{(.+?)\}\}/g;

/** Match {% tagname ... %} in a template source. */
export const BLOCK_TAG_RE = /\{%[-+]?\s*(.+?)\s*[-+]?%\}/g;

/**
 * `{% extends 'path' %}`. Here and in the three below, group 1 is the quote and
 * group 2 the path — the OPENING quote closes the string. `[-+]?` is required:
 * `{%- extends %}` is valid Django.
 */
export const EXTENDS_RE = new RegExp(
  String.raw`\{%[-+]?\s*extends\s+(['"])((?:(?!\1)[^\\]|\\.)*)\1\s*[-+]?%\}`,
);

/** `{% block name %}`. */
export const BLOCK_NAME_RE = new RegExp(String.raw`\{%[-+]?\s*block\s+(${PY_IDENT})`, 'gu');

/** Any `{% tagname … %}`. */
export const TAG_RE = /\{%[-+]?\s*(\w+)[\s\S]*?[-+]?%\}/g;

/**
 * `{% include 'path' [with …] [only] %}`. Group 3 is everything after the path;
 * `parseTemplate` trims its trailing modifier. `(?:[^%]|%(?!\}))*` not
 * `[^%]*?`: the lazy class loses `width="50%"` and backtracks quadratically.
 */
export const INCLUDE_RE = new RegExp(
  String.raw`\{%[-+]?\s*include\s+(['"])((?:(?!\1)[^\\]|\\.)*)\1((?:[^%]|%(?!\}))*)%\}`,
  'g',
);

/** `{% url 'name' ... %}`. */
export const URL_TAG_RE = new RegExp(
  String.raw`\{%[-+]?\s*url\s+(['"])((?:(?!\1)[^\\]|\\.)*)\1`,
  'g',
);

/** `{% static 'path' %}`. */
export const STATIC_TAG_RE = new RegExp(
  String.raw`\{%[-+]?\s*static\s+(['"])((?:(?!\1)[^\\]|\\.)*)\1`,
  'g',
);

/** `{% load tagname %}` — group 1 is the library. */
export const LOAD_TAG_RE = new RegExp(String.raw`\{%[-+]?\s*load\s+(${PY_IDENT})`, 'gu');
