/**
 * parseMigrations — pure parser for Django migration files.
 * Derives name and appLabel from opts.filePath.
 * Joins each `('app', '0001_initial')` dependency tuple into 'app.0001_initial'.
 * Skips unsupported operations with an opts.onWarn call.
 * No vscode / fs / path imports — purity is rg-verifiable.
 */

import type { Migration, MigrationOperation, MigrationField } from '$domain/types/migration';
import type { ParseResult, ParserOpts } from '$domain/contracts/parser';
import { parseFieldAttrs, attrTokens } from './_shared/field-attrs';
import { freshRegex } from '$domain/contracts/fresh-regex';
import { PY_IDENT } from './_shared/python-tokens';

// Supported MigrationOpKind values are handled via switch cases in parseOperation.

// ── Regex patterns ────────────────────────────────────────────────────────────

const DEPENDENCIES_START_RE = /dependencies\s*=\s*\[/;
const OPERATIONS_START_RE = /operations\s*=\s*\[/;
const DEP_ENTRY_RE = /\(\s*['"](\w+)['"]\s*,\s*['"]([^'"]+)['"]\s*\)/g;
const ANY_OP_RE = /migrations\.(\w+)\s*\(/g;
// `\w` here while models.py reads PY_IDENT is not two bugs, it is one
// DISAGREEMENT: the diagram compares migration state against model state, so
// `class Artículo` showed up as a model whose migration was missing.
const NAME_RE = new RegExp(String.raw`name\s*=\s*['"](${PY_IDENT})['"]`, 'u');
const MODEL_NAME_RE = new RegExp(String.raw`model_name\s*=\s*['"](${PY_IDENT})['"]`, 'u');
const OLD_NAME_RE = new RegExp(String.raw`old_name\s*=\s*['"](${PY_IDENT})['"]`, 'u');
const NEW_NAME_RE = new RegExp(String.raw`new_name\s*=\s*['"](${PY_IDENT})['"]`, 'u');

// Field-metadata extraction (ported from OLD migration-parser.ts).
const FIELDS_START_RE = /fields\s*=\s*\[/;
const RELATED_TO_RE = /to\s*=\s*['"]([^'"]+)['"]/;
const RELATED_POSITIONAL_RE =
  /models\.(?:ForeignKey|ManyToManyField|OneToOneField)\s*\(\s*['"]([^'"]+)['"]/;
const ON_DELETE_RE = /on_delete\s*=\s*[\w.]*\.(\w+)/;
const RELATION_TYPES = new Set(['ForeignKey', 'ManyToManyField', 'OneToOneField']);

// ── Bracket extractor ─────────────────────────────────────────────────────────

function extractBracketed(
  source: string,
  startIdx: number,
  open: string,
  close: string,
): string | null {
  let depth = 0;
  let innerStart = -1;
  for (let i = startIdx; i < source.length; i++) {
    if (source[i] === open) {
      if (depth === 0) innerStart = i + 1;
      depth++;
    } else if (source[i] === close) {
      depth--;
      if (depth === 0) return source.substring(innerStart, i);
    }
  }
  return null;
}

function extractBlock(source: string, startPattern: RegExp): string | null {
  const match = startPattern.exec(source);
  if (!match) return null;
  const openIdx = match.index + match[0].length - 1; // position of '['
  return extractBracketed(source, openIdx, '[', ']');
}

// ── Field-metadata extraction (ported from OLD migration-parser.ts) ─────────────

function capitalize(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}

/** Canonical kwarg tokens. Shared with the models parser so a snapshot field
 *  and the live field it describes produce the same signature. */
function summarizeAttrs(argsStr: string): string[] {
  return attrTokens(parseFieldAttrs(argsStr));
}

/** Resolve relation target + on_delete for FK/M2M/O2O fields. */
function relationMeta(
  fieldType: string,
  argsStr: string,
  fullText: string,
): Pick<MigrationField, 'relatedModel' | 'onDelete'> {
  if (!RELATION_TYPES.has(fieldType)) return {};
  const meta: { relatedModel?: string; onDelete?: string } = {};
  const relMatch = argsStr.match(RELATED_TO_RE) ?? fullText.match(RELATED_POSITIONAL_RE);
  if (relMatch?.[1]) {
    const raw = relMatch[1];
    meta.relatedModel = raw.includes('.') ? capitalize(raw.split('.').pop()!) : raw;
  }
  const delMatch = argsStr.match(ON_DELETE_RE) ?? fullText.match(ON_DELETE_RE);
  if (delMatch?.[1]) meta.onDelete = delMatch[1];
  return meta;
}

/** Parse the fields=[('name', models.Type(args)), …] block of a CreateModel. */
function extractCreateModelFields(text: string): MigrationField[] {
  const fieldsBlock = extractBlock(text, FIELDS_START_RE);
  if (!fieldsBlock) return [];

  const fields: MigrationField[] = [];
  // Each field is a tuple: ('name', models.FieldType(...)). The args group
  // tolerates one level of nested parens (e.g. default=timezone.now()).
  const fieldRe = new RegExp(
    String.raw`\(\s*['"](${PY_IDENT})['"]\s*,\s*models\.(\w+)\s*\(([^)]*(?:\([^)]*\)[^)]*)*)\)\s*\)`,
    'gu',
  );
  let m: RegExpExecArray | null;
  while ((m = fieldRe.exec(fieldsBlock)) !== null) {
    const name = m[1]!;
    const fieldType = m[2]!;
    const argsStr = m[3] ?? '';
    fields.push({
      name,
      fieldType,
      attrs: summarizeAttrs(argsStr),
      ...relationMeta(fieldType, argsStr, argsStr),
    });
  }
  return fields;
}

/** Parse the single field=models.Type(...) of an AddField/AlterField op. */
function extractSingleField(text: string): MigrationField | null {
  const typeMatch = text.match(/field\s*=\s*models\.(\w+)\s*\(/);
  if (!typeMatch?.[1]) return null;
  const fieldType = typeMatch[1];

  // field name = the name= that appears AFTER model_name=
  const modelNameIdx = text.indexOf('model_name');
  const afterModelName =
    modelNameIdx >= 0 ? text.substring(modelNameIdx + 'model_name'.length) : text;
  const name = afterModelName.match(NAME_RE)?.[1] ?? '';

  const argsStart = text.indexOf(`models.${fieldType}(`);
  const argsStr =
    argsStart >= 0
      ? (extractBracketed(text, argsStart + `models.${fieldType}`.length, '(', ')') ?? '')
      : '';

  return {
    name,
    fieldType,
    attrs: summarizeAttrs(argsStr),
    ...relationMeta(fieldType, argsStr, text),
  };
}

// ── Operation splitter ────────────────────────────────────────────────────────

function splitOperations(opsBlock: string): Array<{ kind: string; text: string }> {
  const ops: Array<{ kind: string; text: string }> = [];
  const starts: Array<{ idx: number; kind: string }> = [];

  let m: RegExpExecArray | null;
  const re = freshRegex(ANY_OP_RE);
  while ((m = re.exec(opsBlock)) !== null) {
    starts.push({ idx: m.index, kind: m[1]! });
  }

  for (let i = 0; i < starts.length; i++) {
    const cur = starts[i]!;
    const next = starts[i + 1];
    const end = next !== undefined ? next.idx : opsBlock.length;
    ops.push({ kind: cur.kind, text: opsBlock.substring(cur.idx, end) });
  }

  return ops;
}

// ── Operation parsers ─────────────────────────────────────────────────────────

function parseCreateModel(text: string): MigrationOperation {
  const nameMatch = text.match(NAME_RE);
  const fields = extractCreateModelFields(text);
  const base = { kind: 'CreateModel' as const, modelName: nameMatch?.[1] ?? 'Unknown' };
  return fields.length > 0 ? { ...base, fields } : base;
}

function parseDeleteModel(text: string): MigrationOperation {
  const nameMatch = text.match(NAME_RE) ?? text.match(MODEL_NAME_RE);
  return { kind: 'DeleteModel', modelName: nameMatch?.[1] ?? 'Unknown' };
}

function parseRenameModel(text: string): MigrationOperation {
  const oldMatch = text.match(OLD_NAME_RE);
  const newMatch = text.match(NEW_NAME_RE);
  const newName = newMatch?.[1];
  return newName
    ? { kind: 'RenameModel', modelName: oldMatch?.[1] ?? 'Unknown', newName }
    : { kind: 'RenameModel', modelName: oldMatch?.[1] ?? 'Unknown' };
}

function parseFieldOp(
  text: string,
  kind: 'AddField' | 'RemoveField' | 'AlterField',
): MigrationOperation {
  const modelMatch = text.match(MODEL_NAME_RE);
  const modelName = modelMatch?.[1] ?? 'Unknown';
  // fieldName = name= that appears AFTER model_name=
  const modelEnd = modelMatch ? (modelMatch.index ?? 0) + modelMatch[0]!.length : 0;
  const afterModel = text.substring(modelEnd);
  const fieldMatch = afterModel.match(NAME_RE);
  const fieldName = fieldMatch?.[1];

  // AddField/AlterField also declare the field itself (field=models.X(...));
  // capture its type/relation so the schema replay knows real types.
  const single = kind !== 'RemoveField' ? extractSingleField(text) : null;
  const resolvedName = fieldName ?? single?.name;

  const op: MigrationOperation = {
    kind,
    modelName,
    ...(resolvedName ? { fieldName: resolvedName } : {}),
    ...(single ? { fields: [single] } : {}),
  };
  return op;
}

function parseRenameField(text: string): MigrationOperation {
  const modelMatch = text.match(MODEL_NAME_RE);
  const oldMatch = text.match(OLD_NAME_RE);
  const newMatch = text.match(NEW_NAME_RE);
  const modelName = modelMatch?.[1] ?? 'Unknown';
  const fieldName = oldMatch?.[1];
  const newName = newMatch?.[1];
  if (fieldName && newName) return { kind: 'RenameField', modelName, fieldName, newName };
  if (fieldName) return { kind: 'RenameField', modelName, fieldName };
  if (newName) return { kind: 'RenameField', modelName, newName };
  return { kind: 'RenameField', modelName };
}

function parseOperation(
  kind: string,
  text: string,
  onWarn?: (msg: string) => void,
): MigrationOperation | null {
  switch (kind) {
    case 'CreateModel':
      return parseCreateModel(text);
    case 'DeleteModel':
      return parseDeleteModel(text);
    case 'RenameModel':
      return parseRenameModel(text);
    case 'AddField':
      return parseFieldOp(text, 'AddField');
    case 'RemoveField':
      return parseFieldOp(text, 'RemoveField');
    case 'AlterField':
      return parseFieldOp(text, 'AlterField');
    case 'RenameField':
      return parseRenameField(text);
    default:
      onWarn?.(`unsupported migration op: ${kind}`);
      return null;
  }
}

// ── Path helpers ──────────────────────────────────────────────────────────────

function deriveNameAndApp(filePath: string): { name: string; appLabel: string } {
  if (!filePath) return { name: '', appLabel: '' };

  // Normalize separators
  const parts = filePath.replace(/\\/g, '/').split('/');
  const basename = parts[parts.length - 1] ?? '';
  const name = basename.replace(/\.py$/, '');

  // appLabel = segment before 'migrations/' in the path
  const migrIdx = parts.indexOf('migrations');
  const appLabel = migrIdx > 0 ? (parts[migrIdx - 1] ?? '') : '';

  return { name, appLabel };
}

// ── Parser ────────────────────────────────────────────────────────────────────

/**
 * Parse a Django migration file from its Python source string.
 * Always returns 0 or 1 Migration entities.
 *
 * @param source  - Raw Python file content
 * @param opts    - Optional parser options (filePath, onWarn)
 * @returns ParseResult<Migration[]>
 */
export function parseMigrations(source: string, opts?: ParserOpts): ParseResult<Migration[]> {
  if (!source.trim()) return { ok: true, value: [] };

  const { name, appLabel } = deriveNameAndApp(opts?.filePath ?? '');
  const onWarn = opts?.onWarn;

  // ── Dependencies
  const dependencies: string[] = [];
  const depsBlock = extractBlock(source, DEPENDENCIES_START_RE);
  if (depsBlock) {
    const re = freshRegex(DEP_ENTRY_RE);
    let m: RegExpExecArray | null;
    while ((m = re.exec(depsBlock)) !== null) {
      // ('app', '0001_initial') → 'app.0001_initial'
      dependencies.push(`${m[1]}.${m[2]}`);
    }
  }

  // ── Operations
  const operations: MigrationOperation[] = [];
  const opsBlock = extractBlock(source, OPERATIONS_START_RE);
  if (opsBlock) {
    for (const { kind, text } of splitOperations(opsBlock)) {
      const op = parseOperation(kind, text, onWarn);
      if (op) operations.push(op);
    }
  }

  const migration: Migration = {
    kind: 'migration',
    name,
    appLabel,
    filePath: opts?.filePath ?? '',
    dependencies,
    operations,
  };

  return { ok: true, value: [migration] };
}
