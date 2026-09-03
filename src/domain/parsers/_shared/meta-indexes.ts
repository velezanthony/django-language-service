/**
 * Table-level indexes and unique constraints declared in a model's Meta.
 *
 * Django spells the same idea four ways and the docs push you between them:
 *   unique_together  — deprecated in favour of UniqueConstraint, still everywhere
 *   index_together   — removed in 5.1, still in older code
 *   indexes          — models.Index(fields=[...], name=...)
 *   constraints      — models.UniqueConstraint(fields=[...], name=...)
 *
 * All four normalize to ModelIndex. Parsing runs over the whole Meta body text
 * rather than line by line: every one of these is routinely written across
 * several lines, and a line-oriented regex sees only fragments.
 */

import type { ModelIndex } from '../../types/model';

/** Text between `open` at `from` and its matching close, or null if unbalanced. */
function balanced(text: string, from: number, open: string, close: string): string | null {
  let depth = 0;
  for (let i = from; i < text.length; i++) {
    const ch = text[i];
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return text.slice(from + 1, i);
    }
  }
  return null;
}

/** Value of `key = <literal>`, brackets balanced. Handles [] and (). */
function assignedValue(text: string, key: string): string | null {
  const m = new RegExp(`\\b${key}\\s*=\\s*`).exec(text);
  if (!m) return null;
  const start = m.index + m[0].length;
  const ch = text[start];
  if (ch === '[') return balanced(text, start, '[', ']');
  if (ch === '(') return balanced(text, start, '(', ')');
  return null;
}

const quotedNames = (text: string): string[] =>
  [...text.matchAll(/['"](-?[\w.]+)['"]/g)].map(m => m[1]!);

/**
 * unique_together / index_together accept a flat sequence for one constraint
 * OR a sequence of sequences for several. Django's own docs show both, and
 * treating the flat form as N single-column constraints is the classic misread.
 */
function parseTogether(value: string, unique: boolean): ModelIndex[] {
  const groups = [...value.matchAll(/[([]([^()[\]]*)[)\]]/g)]
    .map(m => quotedNames(m[1]!))
    .filter(f => f.length > 0);
  if (groups.length > 0) {
    return groups.map(fields => ({ fields, ...(unique && { unique: true as const }) }));
  }
  const flat = quotedNames(value);
  return flat.length > 0 ? [{ fields: flat, ...(unique && { unique: true as const }) }] : [];
}

/** Every call matching `calleePattern` in `text`, with balanced argument text.
 *  The pattern is dotted-prefix tolerant so `models.Index` and PostgreSQL's
 *  `GinIndex` / `BTreeIndex` are all picked up — they share the fields= API. */
function callsTo(text: string, calleePattern: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`${calleePattern}\\s*\\(`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const args = balanced(text, m.index + m[0].length - 1, '(', ')');
    if (args !== null) out.push(args);
  }
  return out;
}

function parseIndexCall(args: string, unique: boolean): ModelIndex | null {
  const fieldsText = assignedValue(args, 'fields');
  // Expression indexes (positional args) carry no column list we can render.
  if (fieldsText === null) return null;
  const fields = quotedNames(fieldsText);
  if (fields.length === 0) return null;
  const name = /\bname\s*=\s*['"]([^'"]+)['"]/.exec(args)?.[1];
  const partial = /\bcondition\s*=/.test(args);
  return {
    fields,
    ...(name !== undefined && { name }),
    ...(unique && { unique: true as const }),
    ...(partial && { partial: true as const }),
  };
}

/** De-dup on (columns, unique): the same set often appears twice while a
 *  codebase migrates from unique_together to UniqueConstraint. */
function dedupe(indexes: readonly ModelIndex[]): ModelIndex[] {
  const seen = new Set<string>();
  const out: ModelIndex[] = [];
  for (const idx of indexes) {
    const key = `${idx.unique ? 'u' : 'i'}:${idx.fields.join(',')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(idx);
  }
  return out;
}

export function parseMetaIndexes(metaBody: string): ModelIndex[] {
  const out: ModelIndex[] = [];

  const uniqueTogether = assignedValue(metaBody, 'unique_together');
  if (uniqueTogether !== null) out.push(...parseTogether(uniqueTogether, true));

  const indexTogether = assignedValue(metaBody, 'index_together');
  if (indexTogether !== null) out.push(...parseTogether(indexTogether, false));

  const indexesText = assignedValue(metaBody, 'indexes');
  if (indexesText !== null) {
    for (const args of callsTo(indexesText, '[\\w.]*Index')) {
      const idx = parseIndexCall(args, false);
      if (idx) out.push(idx);
    }
  }

  const constraintsText = assignedValue(metaBody, 'constraints');
  if (constraintsText !== null) {
    for (const args of callsTo(constraintsText, '[\\w.]*UniqueConstraint')) {
      const idx = parseIndexCall(args, true);
      if (idx) out.push(idx);
    }
  }

  return dedupe(out);
}
