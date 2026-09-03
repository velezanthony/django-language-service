/**
 * Replace the DTL inside a <script> or <style> body with filler of EXACTLY the
 * same shape, so the JS or CSS parser sees valid syntax and every position it
 * reports still points at the right character of the user's document.
 *
 * Pure domain: no vscode / fs / path imports.
 */

const DTL_VAR_RE = /\{\{[\s\S]*?\}\}/g;
const DTL_TAG_RE = /\{%[\s\S]*?%\}/g;
const DTL_COMMENT_RE = /\{#[\s\S]*?#\}/g;
const HAS_DTL_RE = /\{\{|\{%|\{#/;

// ── DTL cleaners ──
//
// The replacement must occupy EXACTLY the same characters and the same lines as
// what it replaces: the syntax error that comes back carries a line and column
// which are reported straight onto the user's document. Building the
// replacement line by line, never longer than the line it stands in for, is
// what makes a drift impossible rather than merely fixed.

/**
 * Filler of exactly `match`'s shape: the token once on the first line, blanks
 * elsewhere. Not once per line, and never truncated — a clipped `(0` is a
 * syntax error this feature exists to prevent.
 *
 * `fallback` is a shorter token for a first line too narrow for the main one;
 * when even that will not fit, blanks are the honest answer.
 */
function blankLines(match: string, token: string, fallback: string): string {
  return match
    .split('\n')
    .map((line, index) => {
      if (index > 0) return ' '.repeat(line.length);
      const filler =
        token.length <= line.length ? token : fallback.length <= line.length ? fallback : '';
      return filler.padEnd(line.length);
    })
    .join('\n');
}

export function cleanDtlForJs(script: string): string {
  if (!HAS_DTL_RE.test(script)) return script;
  let s = script;
  // A value, so the surrounding expression still parses.
  s = s.replace(DTL_VAR_RE, m => blankLines(m, '(0)', '0'));
  s = s.replace(DTL_TAG_RE, m => blankLines(m, '//', ''));
  s = s.replace(DTL_COMMENT_RE, m => blankLines(m, '//', ''));
  return s;
}

export function cleanDtlForCss(style: string): string {
  if (!HAS_DTL_RE.test(style)) return style;
  let s = style;
  s = s.replace(DTL_VAR_RE, m => blankLines(m, 'inherit', '0'));
  s = s.replace(DTL_TAG_RE, m => blankLines(m, '/**/', ''));
  s = s.replace(DTL_COMMENT_RE, m => blankLines(m, '/**/', ''));
  return s;
}
