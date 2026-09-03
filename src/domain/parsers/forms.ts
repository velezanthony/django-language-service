/**
 * parseForms — pure parser for Django Form and ModelForm classes.
 * Extracts class name, modelRef (from Meta.model), declared fields
 * (`name = forms.X(...)`), Meta.fields, line number, and filePath.
 * No vscode / fs / path imports — purity is rg-verifiable.
 */

import type { Form, FormField } from '$domain/types/form';
import type { ParseResult, ParserOpts } from '$domain/contracts/parser';
import { PY_IDENT } from './_shared/python-tokens';

// ── Regex patterns ────────────────────────────────────────────────────────────

const FORM_CLASS_RE = new RegExp(String.raw`^class\s+(${PY_IDENT})\s*\(([^)]*)\)\s*:`, 'u');
// Member patterns are matched against the TRIMMED line; the class-body walk
// decides whether a line is a direct member (or a Meta member) by comparing
// its real indentation with the detected body indent. This keeps the parser
// tolerant to 2-space / tab / non-4-space indentation styles.
const FIELD_ASSIGN_RE = new RegExp(
  String.raw`^(${PY_IDENT})\s*=\s*(?:\w+\()?\s*forms\.(\w+)\s*\(`,
  'u',
);
const META_CLASS_RE = /^class\s+Meta\s*:/;
const META_MODEL_RE = new RegExp(String.raw`^model\s*=\s*(${PY_IDENT})`, 'u');
const META_FIELDS_LIST_RE = /^fields\s*=\s*[[(]([^\])]*)[\])]/;
const META_FIELDS_ALL_RE = /^fields\s*=\s*['"]__all__['"]/;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Leading whitespace (spaces/tabs) of a line. */
function leadingWsOf(line: string): string {
  return line.slice(0, line.length - line.trimStart().length);
}

function isFormBase(bases: string): boolean {
  return bases.split(',').some(b => {
    const t = b.trim();
    return (
      t === 'forms.Form' ||
      t === 'forms.ModelForm' ||
      t === 'Form' ||
      t === 'ModelForm' ||
      t.endsWith('Form') ||
      t.endsWith('ModelForm')
    );
  });
}

// ── Parser ────────────────────────────────────────────────────────────────────

/**
 * Parse Django Form and ModelForm classes from a Python source string.
 *
 * @param source  - Raw Python file content
 * @param opts    - Optional parser options (filePath, onWarn)
 * @returns ParseResult<Form[]> — always ok:true; partial results on malformed input
 */
export function parseForms(source: string, opts?: ParserOpts): ParseResult<Form[]> {
  if (!source.trim()) return { ok: true, value: [] };

  const filePath = opts?.filePath ?? '';
  const lines = source.split('\n');
  const forms: Form[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? '';
    const classMatch = line.match(FORM_CLASS_RE);

    if (classMatch && isFormBase(classMatch[2]!)) {
      const name = classMatch[1]!;
      const formLine = i + 1; // 1-based
      let modelRef: string | undefined;
      let metaFields: string[] | undefined;
      const fields: FormField[] = [];
      // Indentation of the first statement in the class body — direct
      // members live at exactly this indent. Detected per class, so the
      // parser tolerates 2-space, tab, or mixed styles across a file.
      let bodyIndent: string | null = null;
      i++;

      // Walk the class body
      while (i < lines.length) {
        const bodyLine = lines[i] ?? '';
        const trimmed = bodyLine.trimStart();

        // End of class: non-empty line at column 0 (not a comment)
        if (trimmed !== '' && bodyLine.length === trimmed.length && !trimmed.startsWith('#')) {
          break;
        }

        // Blank lines and comments never define nor affect the body indent
        if (trimmed === '' || trimmed.startsWith('#')) {
          i++;
          continue;
        }

        const indent = leadingWsOf(bodyLine);
        if (bodyIndent === null) bodyIndent = indent;

        // Deeper lines are continuations of multi-line defs — skip them
        if (indent !== bodyIndent) {
          i++;
          continue;
        }

        // Declared field: name = forms.FieldType(...)
        const fieldMatch = trimmed.match(FIELD_ASSIGN_RE);
        if (fieldMatch) {
          fields.push({ name: fieldMatch[1]!, fieldType: fieldMatch[2]! });
          i++;
          continue;
        }

        // Nested Meta class
        if (META_CLASS_RE.test(trimmed)) {
          const metaHeaderIndent = indent;
          i++;
          while (i < lines.length) {
            const metaLine = lines[i] ?? '';
            const metaTrimmed = metaLine.trimStart();

            // Meta body = anything indented DEEPER than the header
            // (blank lines and comments are tolerated)
            const isDeeper = leadingWsOf(metaLine).length > metaHeaderIndent.length;
            if (metaTrimmed !== '' && !isDeeper && !metaTrimmed.startsWith('#')) {
              break;
            }

            const modelMatch = metaTrimmed.match(META_MODEL_RE);
            if (modelMatch) {
              modelRef = modelMatch[1]!;
            }

            // fields = ['a', 'b'] / ('a', 'b') / '__all__'
            if (META_FIELDS_ALL_RE.test(metaTrimmed)) {
              metaFields = ['__all__'];
            } else {
              const fieldsMatch = metaTrimmed.match(META_FIELDS_LIST_RE);
              if (fieldsMatch) {
                metaFields = (fieldsMatch[1] ?? '')
                  .split(',')
                  .map(s => s.trim().replace(/^['"]|['"]$/g, ''))
                  .filter(Boolean);
              }
            }

            i++;
          }
          continue;
        }

        i++;
      }

      const form: Form = {
        kind: 'form',
        name,
        filePath,
        line: formLine,
        fields,
        ...(modelRef !== undefined && { modelRef }),
        ...(metaFields !== undefined && { metaFields }),
      };
      forms.push(form);
    } else {
      i++;
    }
  }

  return { ok: true, value: forms };
}
