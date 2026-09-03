/**
 * models-choice-indexes.ts
 *
 * Helpers for building per-file symbol indexes used by parseModels to resolve
 * `choices=` arguments in field definitions.
 *
 * Three indexes are built:
 *   - textChoicesIndex       — top-level `class X(models.TextChoices)` declarations
 *   - moduleConstantsIndex   — top-level `NAME = [(value, label), ...]` constants
 *   - classConstantsIndex    — class-level `NAME = [...]` constants (per enclosing class)
 *
 * Additionally parseNestedTextChoicesClasses resolves nested TextChoices classes
 * declared inside a model body (e.g. `class Product: class Status(TextChoices): ...`).
 *
 * All functions are pure: no vscode / fs / path imports.
 */

import type { Choice } from '$domain/types/choice';
import { splitTopLevelTuples, extractBracketed, PY_IDENT } from './python-tokens';
import { detectModelClasses } from './model-classes';

// ── Regex patterns ────────────────────────────────────────────────────────────

/**
 * Matches any `class Name(bases):` header, top-level or indented, capturing the
 * indentation, the name, and the base list verbatim.
 *
 * Deliberately does NOT try to find the choices base itself. The pattern that
 * did — `(?:[^,)]+,\s*)*` in front of an alternation — could split a base list
 * more ways than there are bases, and a header it had to REJECT cost 693 ms at
 * 26 bases and 3.2 s at 28. `[^)]*` has one way to match and costs one pass.
 * Which base it is, is a question for `split(',')`, exactly as `model-classes.ts`
 * and `models.ts` already ask it.
 */
const CLASS_HEADER_RE = new RegExp(String.raw`^(\s*)class\s+(${PY_IDENT})\s*\(([^)]*)\)\s*:`, 'u');

/** The Django base classes that turn a class into an enumeration of choices. */
const CHOICES_BASES: ReadonlySet<string> = new Set(['TextChoices', 'IntegerChoices', 'Choices']);

/** Whether a captured base list names one of `CHOICES_BASES`, qualified or not. */
function declaresChoicesBase(baseList: string): boolean {
  return baseList
    .split(',')
    .map(b => b.trim())
    .filter(Boolean)
    .some(b => CHOICES_BASES.has(b.startsWith('models.') ? b.slice('models.'.length) : b));
}

/** The name of a TOP-LEVEL choices class declared on `line`, or null. */
function topLevelChoicesClass(line: string): string | null {
  const m = CLASS_HEADER_RE.exec(line);
  if (!m || m[1] !== '' || !declaresChoicesBase(m[3]!)) return null;
  return m[2]!;
}

/** The indent and name of a NESTED choices class declared on `line`, or null. */
function nestedChoicesClass(line: string): { indent: number; name: string } | null {
  const m = CLASS_HEADER_RE.exec(line);
  if (!m || m[1] === '' || !declaresChoicesBase(m[3]!)) return null;
  return { indent: m[1]!.length, name: m[2]! };
}

/** Matches a Model class definition (to scope class-level scanning). */
const MODEL_CLASS_RE = new RegExp(String.raw`^class\s+(${PY_IDENT})\s*\(([^)]*)\)\s*:`, 'u');

// ── Bracket walker ────────────────────────────────────────────────────────────

/**
 * Walk forward from an opening bracket/paren in `source`, tracking depth and
 * string literals. Returns the content between the opener and its matching
 * closer, or an empty array when unmatched.
 */
function extractBracketedTuples(source: string, openIdx: number): Choice[] {
  const openChar = source[openIdx];
  if (openChar !== '[' && openChar !== '(') return [];
  const closeChar = openChar === '[' ? ']' : ')';

  let depth = 0;
  let endIdx = -1;
  let inStr: '"' | "'" | null = null;

  for (let k = openIdx; k < source.length; k++) {
    const c = source[k];
    if (inStr) {
      if (c === inStr && source[k - 1] !== '\\') inStr = null;
      continue;
    }
    if (c === '"' || c === "'") {
      inStr = c as '"' | "'";
      continue;
    }
    if (c === openChar) depth++;
    else if (c === closeChar) {
      depth--;
      if (depth === 0) {
        endIdx = k;
        break;
      }
    }
  }

  if (endIdx === -1) return [];
  const body = source.slice(openIdx + 1, endIdx);
  const choices: Choice[] = [];
  for (const tupleText of splitTopLevelTuples(body)) {
    const choice = parseChoicePair(tupleText.trim());
    if (choice) choices.push(choice);
  }
  return choices;
}

// ── Choice pair parser ────────────────────────────────────────────────────────

/**
 * Parse a single `(value, label)` tuple text into a Choice.
 * Accepts quoted strings, signed integers, and gettext-style labels.
 * Returns null when the value cannot be extracted.
 */
function parseChoicePair(tupleText: string): Choice | null {
  if (tupleText.length < 2 || tupleText[0] !== '(' || tupleText[tupleText.length - 1] !== ')')
    return null;
  const inner = tupleText.slice(1, -1);

  // Find the first top-level comma
  let commaIdx = -1;
  let depth = 0;
  let inStr: '"' | "'" | null = null;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (inStr) {
      if (c === inStr && inner[i - 1] !== '\\') inStr = null;
      continue;
    }
    if (c === '"' || c === "'") {
      inStr = c as '"' | "'";
      continue;
    }
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === ',' && depth === 0) {
      commaIdx = i;
      break;
    }
  }

  const valueText = (commaIdx === -1 ? inner : inner.slice(0, commaIdx)).trim();
  const labelText =
    commaIdx === -1
      ? undefined
      : inner
          .slice(commaIdx + 1)
          .trim()
          .replace(/,$/, '')
          .trim();

  // Value: quoted string or signed integer
  let value: string | undefined;
  const valueStr = valueText.match(/^(['"])(.*)\1$/);
  if (valueStr) value = valueStr[2];
  else if (/^-?\d+$/.test(valueText)) value = valueText;
  if (value === undefined) return null;

  // Label: quoted string or gettext-style call
  let label: string | undefined;
  if (labelText !== undefined && labelText.length > 0) {
    const labelStr = labelText.match(/^(['"])(.*)\1$/);
    if (labelStr) {
      label = labelStr[2];
    } else {
      const gettextMatch = labelText.match(
        /^(?:_|gettext|gettext_lazy|ugettext|ugettext_lazy|pgettext|pgettext_lazy)\s*\(\s*.*?(['"])([^'"]*)\1\s*\)$/,
      );
      if (gettextMatch) label = gettextMatch[2];
    }
  }

  return label !== undefined ? { value, label } : { value };
}

// ── Member line parser ────────────────────────────────────────────────────────

function parseTextChoicesMemberInto(line: string, values: Choice[]): void {
  const m = line.match(/^\s+(\w+)\s*=\s*(.+?)\s*$/);
  if (!m || m[1]!.startsWith('__')) return;
  const rhs = m[2]!;
  const pair = parseChoicePair('(' + rhs + ')');
  if (pair) values.push(pair);
}

// ── Exported index builders ───────────────────────────────────────────────────

/**
 * Build an index of top-level `class X(models.TextChoices)` declarations.
 * Maps class name → Choice[].
 */
export function parseTextChoicesClasses(source: string): Map<string, Choice[]> {
  const result = new Map<string, Choice[]>();
  if (!source.trim()) return result;

  const lines = source.split('\n');
  let i = 0;
  while (i < lines.length) {
    const rawLine = lines[i];
    if (!rawLine) {
      i++;
      continue;
    }
    const className = topLevelChoicesClass(rawLine);
    if (className === null) {
      i++;
      continue;
    }

    const values: Choice[] = [];
    i++;

    while (i < lines.length) {
      const line = lines[i] ?? '';
      const trimmed = line.trimStart();
      if (trimmed !== '' && line.length === trimmed.length && !trimmed.startsWith('#')) break;
      parseTextChoicesMemberInto(line, values);
      i++;
    }

    if (values.length > 0) result.set(className, values);
  }
  return result;
}

/**
 * Build an index of top-level module-level constant assignments.
 * Only `NAME = [(value, label), ...]` shapes are captured.
 * Maps constant name → Choice[].
 */
export function parseModuleConstants(source: string): Map<string, Choice[]> {
  const result = new Map<string, Choice[]>();
  if (!source.trim()) return result;

  const re = /^([A-Za-z_]\w*)\s*=\s*[[(]/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    const name = match[1]!;
    const openIdx = match.index + match[0]!.length - 1;
    const values = extractBracketedTuples(source, openIdx);
    if (values.length > 0) result.set(name, values);
  }
  return result;
}

/**
 * Build a per-class index of class-level constant assignments.
 * Maps modelClassName → Map<constName, Choice[]>.
 */
export function parseClassLevelConstants(source: string): Map<string, Map<string, Choice[]>> {
  const result = new Map<string, Map<string, Choice[]>>();
  if (!source.trim()) return result;
  const modelClasses = detectModelClasses(source);

  const lines = source.split('\n');
  let i = 0;
  let lineOffset = 0;

  while (i < lines.length) {
    const line = lines[i] ?? '';
    const classMatch = line.match(MODEL_CLASS_RE);
    if (!classMatch || !modelClasses.has(classMatch[1]!)) {
      lineOffset += line.length + 1;
      i++;
      continue;
    }

    const className = classMatch[1]!;
    const classConsts = new Map<string, Choice[]>();
    lineOffset += line.length + 1;
    i++;

    // The first content line of the body establishes its base indentation.
    // We only capture assignments AT that base level — matching Python's own
    // block semantics and avoiding the 4-space assumption. Deeper lines belong
    // to nested blocks (Meta, nested classes) and must not leak in here.
    let bodyIndent = -1;

    while (i < lines.length) {
      const bodyLine = lines[i] ?? '';
      const trimmed = bodyLine.trimStart();
      if (trimmed !== '' && bodyLine.length === trimmed.length && !trimmed.startsWith('#')) break;

      if (trimmed !== '' && !trimmed.startsWith('#')) {
        const indent = bodyLine.length - trimmed.length;
        if (bodyIndent === -1) bodyIndent = indent;

        if (indent === bodyIndent) {
          const constMatch = trimmed.match(/^([A-Za-z_]\w*)\s*=\s*([[(])/);
          if (constMatch) {
            const name = constMatch[1]!;
            const openIdxInLine = indent + constMatch[0]!.length - 1;
            const openIdx = lineOffset + openIdxInLine;
            const values = extractBracketedTuples(source, openIdx);
            if (values.length > 0) classConsts.set(name, values);
          }
        }
      }
      lineOffset += bodyLine.length + 1;
      i++;
    }

    if (classConsts.size > 0) result.set(className, classConsts);
  }
  return result;
}

/**
 * Find TextChoices/IntegerChoices classes nested INSIDE model class bodies.
 * Returns Map<modelName, Map<nestedClassName, Choice[]>>.
 */
export function parseNestedTextChoicesClasses(source: string): Map<string, Map<string, Choice[]>> {
  const result = new Map<string, Map<string, Choice[]>>();
  if (!source.trim()) return result;
  const modelClasses = detectModelClasses(source);

  const lines = source.split('\n');
  let i = 0;

  while (i < lines.length) {
    const rawLine = lines[i] ?? '';
    const modelMatch = rawLine.match(MODEL_CLASS_RE);
    if (!modelMatch || !modelClasses.has(modelMatch[1]!)) {
      i++;
      continue;
    }

    const modelClassName = modelMatch[1]!;
    const nestedChoiceClasses = new Map<string, Choice[]>();
    i++;

    while (i < lines.length) {
      const bodyLine = lines[i] ?? '';
      const bodyTrimmed = bodyLine.trimStart();
      if (
        bodyTrimmed !== '' &&
        bodyLine.length === bodyTrimmed.length &&
        !bodyTrimmed.startsWith('#')
      )
        break;

      const nestedMatch = nestedChoicesClass(bodyLine);
      if (nestedMatch) {
        const nestedClassIndent = nestedMatch.indent;
        const nestedClassName = nestedMatch.name;
        const values: Choice[] = [];
        i++;

        while (i < lines.length) {
          const memberLine = lines[i] ?? '';
          const memberTrimmed = memberLine.trimStart();
          if (memberTrimmed !== '' && !memberTrimmed.startsWith('#')) {
            const memberIndent = memberLine.length - memberTrimmed.length;
            if (memberIndent <= nestedClassIndent) break;
          }
          parseTextChoicesMemberInto(memberLine, values);
          i++;
        }
        if (values.length > 0) nestedChoiceClasses.set(nestedClassName!, values);
        continue;
      }
      i++;
    }

    if (nestedChoiceClasses.size > 0) result.set(modelClassName, nestedChoiceClasses);
  }
  return result;
}

// ── Inline choices extractor ──────────────────────────────────────────────────

/**
 * Detect and parse an inline `choices=[(...), ...]` literal directly in a field def.
 * Returns undefined if `choices=` references a bare identifier (handled separately).
 */
export function extractInlineChoices(fullDef: string): Choice[] | undefined {
  const m = fullDef.match(/\bchoices\s*=\s*([[({])/);
  if (!m) return undefined;

  const startIdx = m.index! + m[0]!.length - 1;
  // Django 5.0 accepts a MAPPING as well as a list of pairs. It was not read
  // at all, so the field carried no choices — no badge, and
  // `get_<field>_display` was reported as not a field of the model.
  const values =
    m[1] === '{'
      ? extractMappingChoices(fullDef, startIdx)
      : extractBracketedTuples(fullDef, startIdx);
  return values.length > 0 ? values : undefined;
}

/**
 * `choices={"a": "A", 1: "One"}` — value/label pairs at the TOP level of the
 * mapping. A grouped mapping nests another dict as its label; those groups are
 * skipped rather than guessed at, the same way the list form treats them.
 */
function extractMappingChoices(fullDef: string, openIdx: number): Choice[] {
  const body = extractBracketed(fullDef, openIdx, '{', '}');
  if (body === null) return [];

  const out: Choice[] = [];
  const pair = /(?:['"]([^'"]*)['"]|(-?\d+))\s*:\s*['"]([^'"]*)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = pair.exec(body)) !== null) {
    out.push({ value: m[1] ?? m[2] ?? '', label: m[3]! });
  }
  return out;
}

/**
 * Extract a bare identifier from `choices=X` or `choices=X.choices`.
 * Returns undefined for inline literals and for function calls.
 */
export function extractChoicesRef(fullDef: string): string | undefined {
  const m = fullDef.match(/\bchoices\s*=\s*([A-Za-z_]\w*)(?:\.choices)?\b/);
  if (!m) return undefined;
  const afterIdx = m.index! + m[0]!.length;
  const after = fullDef[afterIdx];
  if (after === '(' || after === '[') return undefined;
  return m[1];
}

// ── Internal util ─────────────────────────────────────────────────────────────
