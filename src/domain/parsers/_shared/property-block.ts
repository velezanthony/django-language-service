/**
 * Pull a whole `@property` out of a model body, source included.
 *
 * Blocks end where Python says they end: at the first non-blank line indented
 * no deeper than the `def`. Everything is dedented to the `def`'s own level so
 * the snippet reads standalone.
 */

import { PY_IDENT } from './python-tokens';

export interface PropertyBlock {
  readonly name: string;
  /** Decorator + def + body, dedented. */
  readonly source: string;
  /** First line after the block — where the caller resumes. */
  readonly nextIdx: number;
}

const DEF_RE = new RegExp(String.raw`^def\s+(${PY_IDENT})\s*\(`, 'u');

const indentOf = (line: string): number => line.length - line.trimStart().length;

export function extractPropertyBlock(
  lines: readonly string[],
  decoratorIdx: number,
): PropertyBlock | null {
  const decorator = lines[decoratorIdx];
  if (decorator === undefined) return null;

  // Skip blanks and comments between the decorator and its def.
  let defIdx = decoratorIdx + 1;
  while (defIdx < lines.length) {
    const t = (lines[defIdx] ?? '').trim();
    if (t !== '' && !t.startsWith('#')) break;
    defIdx++;
  }

  const defLine = lines[defIdx];
  const defMatch = defLine?.trimStart().match(DEF_RE);
  if (!defLine || !defMatch) return null;

  const baseIndent = indentOf(defLine);

  // Body: everything indented deeper, blank lines included while more body follows.
  let end = defIdx + 1;
  let lastContent = defIdx;
  while (end < lines.length) {
    const line = lines[end] ?? '';
    if (line.trim() === '') {
      end++;
      continue;
    }
    if (indentOf(line) <= baseIndent) break;
    lastContent = end;
    end++;
  }

  const body = lines
    .slice(defIdx, lastContent + 1)
    .map(l => (l.length >= baseIndent ? l.slice(baseIndent) : l.trimStart()));

  return {
    name: defMatch[1]!,
    source: [decorator.trimStart(), ...body].join('\n'),
    nextIdx: lastContent + 1,
  };
}
