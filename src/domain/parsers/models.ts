/**
 * parseModels — pure parser for Django model classes.
 * Extracts Model[], Field[], Relation[], ModelMeta, properties.
 * Splits relation-typed fields (FK/O2O/M2M) into relations[].
 * Defers cross-file choices resolution to the scanner: emits
 * `choices = { kind: 'unresolved', symbolName }` plus an onWarn call.
 * No vscode / fs / path imports — purity is rg-verifiable.
 */

import type { Model, ModelMeta, PropertyDef } from '$domain/types/model';
import type { Field, OnDeleteAction } from '$domain/types/field';
import type { Choice, FieldChoices } from '$domain/types/choice';
import { extractPropertyBlock } from './_shared/property-block';
import { detectModelClasses } from './_shared/model-classes';
import { applyInheritance } from './_shared/model-inheritance';
import { parseFieldAttrs } from './_shared/field-attrs';
import { parseMetaIndexes } from './_shared/meta-indexes';
import { quotedAfter, PY_IDENT } from './_shared/python-tokens';
import type { Relation, RelationKind } from '$domain/types/relation';
import type { ParseResult, ParserOpts } from '$domain/contracts/parser';
import {
  parseTextChoicesClasses,
  parseModuleConstants,
  parseClassLevelConstants,
  parseNestedTextChoicesClasses,
  extractInlineChoices,
  extractChoicesRef,
} from './_shared/models-choice-indexes';

// ── Regex patterns ────────────────────────────────────────────────────────────

const MODEL_CLASS_RE = new RegExp(String.raw`^class\s+(${PY_IDENT})\s*\(([^)]*)\)\s*:`, 'u');
// Member patterns are matched against the TRIMMED line; the class-body walk
// decides whether a line is a direct member by comparing its real indentation
// with the indent of the first statement in the body. This keeps the parser
// tolerant to 2-space / tab / non-4-space indentation styles.
const FIELD_ASSIGN_RE = new RegExp(
  String.raw`^(${PY_IDENT})\s*=\s*(?:\w+\()?\s*models\.(\w+)\s*\(`,
  'u',
);
const GFK_ASSIGN_RE = new RegExp(String.raw`^(${PY_IDENT})\s*=\s*GenericForeignKey\s*\(`, 'u');
const PROPERTY_DEF_RE = /^@property\b/;
const META_CLASS_RE = /^class\s+Meta\s*:/;

const META_DB_TABLE_RE = /^\s+db_table\s*=\s*['"]([^'"]+)['"]/;
const META_VERBOSE_RE = quotedAfter(String.raw`^\s+verbose_name\s*=\s*`);
const META_VERBOSE_PLURAL_RE = quotedAfter(String.raw`^\s+verbose_name_plural\s*=\s*`);
const META_ORDERING_RE = /^\s+ordering\s*=\s*(\[.+?\])/;
const META_TABLE_COMMENT_RE = quotedAfter(String.raw`^\s+db_table_comment\s*=\s*`);

// The target may be positional or given as `to=`, which is how migrations are
// written and perfectly normal in a model. Without the keyword branch EVERY
// `to=` relation resolved to a model literally called "to": the chain resolver
// then rejected `{{ order.owner.email }}`, and the target's reverse accessor
// never existed.
const RELATED_MODEL_RE = /models\.\w+\s*\(\s*(?:to\s*=\s*)?["']?([\w.]+)["']?/;
// Any quoted value, not just an identifier: `related_name="+"` SUPPRESSES the
// reverse accessor, and `"%(class)s_set"` on an abstract base is a template.
// Dropping them made both indistinguishable from "no related_name given",
// which is the case that gets Django's default `<model>_set`.
const RELATED_NAME_RE = /related_name\s*=\s*['"]([^'"]*)['"]/;
const THROUGH_RE = /\bthrough\s*=\s*["']?([\w.]+)["']?/;
const ON_DELETE_RE = /on_delete\s*=\s*models\.(\w+)/;
const DB_COMMENT_RE = quotedAfter(String.raw`db_comment\s*=\s*`);
const DB_COLUMN_RE = /\bdb_column\s*=\s*["']([^"']+)["']/;
const COMPOSITE_PK_RE = /^\w+\s*=\s*models\.CompositePrimaryKey\s*\(([^)]*)\)/;
// `def name(self):` and nothing else. A method taking arguments cannot be
// called from a template, so accepting it would green-light a real mistake.
const ZERO_ARG_DEF_RE = new RegExp(
  String.raw`^def\s+(${PY_IDENT})\s*\(\s*self\s*,?\s*\)\s*(?:->[^:]+)?:`,
  'u',
);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Leading whitespace (spaces/tabs) of a line. */
function leadingWsOf(line: string): string {
  return line.slice(0, line.length - line.trimStart().length);
}

function collectFieldDef(lines: string[], startIdx: number): string {
  let depth = 0;
  const parts: string[] = [];
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i] ?? '';
    parts.push(line);
    for (const ch of line) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
    }
    if (depth <= 0 && i > startIdx) break;
    if (depth <= 0 && i === startIdx && line.includes(')')) break;
  }
  return parts.join(' ');
}

function deriveAppLabel(filePath: string): string {
  if (!filePath) return '';
  const parts = filePath.replace(/\\/g, '/').split('/');
  // appLabel = segment before 'models' or the second-to-last before the file
  const modelsIdx = parts.lastIndexOf('models.py');
  if (modelsIdx > 0) return parts[modelsIdx - 1] ?? '';
  // Fallback: look for 'models' directory segment
  const dirIdx = parts.indexOf('models');
  if (dirIdx > 0) return parts[dirIdx - 1] ?? '';
  // Last resort: parent directory
  return parts.length >= 2 ? (parts[parts.length - 2] ?? '') : '';
}

const VALID_ON_DELETE = new Set([
  'CASCADE',
  'PROTECT',
  'SET_NULL',
  'SET_DEFAULT',
  'DO_NOTHING',
  'RESTRICT',
]);

function extractOnDelete(fullDef: string): OnDeleteAction | undefined {
  const m = fullDef.match(ON_DELETE_RE);
  if (!m) return undefined;
  const val = m[1] ?? '';
  return VALID_ON_DELETE.has(val) ? (val as OnDeleteAction) : undefined;
}

function toRelationKind(fieldType: string): RelationKind | null {
  if (fieldType === 'ForeignKey') return 'fk';
  if (fieldType === 'OneToOneField') return 'o2o';
  if (fieldType === 'ManyToManyField') return 'm2m';
  return null;
}

// ── Field + Relation builder ──────────────────────────────────────────────────

interface ParsedField {
  field?: Field;
  relation?: Relation;
}

function buildFieldOrRelation(
  name: string,
  fieldType: string,
  lines: string[],
  startIdx: number,
  modelName: string,
  appLabel: string,
  textChoicesIndex: Map<string, readonly Choice[]>,
  moduleConstantsIndex: Map<string, readonly Choice[]>,
  classConstants: Map<string, readonly Choice[]> | undefined,
  onWarn?: (msg: string, line?: number) => void,
): ParsedField {
  const fullDef = collectFieldDef(lines, startIdx);
  const lineNum = startIdx + 1; // 1-based

  // ── Relation fields
  const relKind = toRelationKind(fieldType);
  if (relKind !== null) {
    const relM = fullDef.match(RELATED_MODEL_RE);
    const toModel = relM?.[1] ?? 'Unknown';

    const relatedName = fullDef.match(RELATED_NAME_RE)?.[1];
    const onDelete = extractOnDelete(fullDef);
    const through = relKind === 'm2m' ? fullDef.match(THROUGH_RE)?.[1] : undefined;
    const isNull = parseFieldAttrs(fullDef).isNull;
    const dbColumn = fullDef.match(DB_COLUMN_RE)?.[1];

    const relation: Relation = {
      kind: relKind,
      fromModel: `${appLabel}.${modelName}`,
      toModel,
      fieldName: name,
      ...(relatedName !== undefined && { relatedName }),
      ...(onDelete !== undefined && { onDelete }),
      ...(through !== undefined && { through }),
      ...(isNull !== undefined && { isNull }),
      ...(dbColumn !== undefined && { dbColumn }),
    };
    return { relation };
  }

  // ── GenericForeignKey — emitted as a field
  if (fieldType === 'GenericForeignKey' || fieldType === 'GenericRelatedObjectManager') {
    return { field: { name, fieldType, isGenericFk: true } };
  }

  // ── Scalar field — build immutable (all readonly properties set up front)
  const attrs = parseFieldAttrs(fullDef);
  const docM = fullDef.match(DB_COMMENT_RE);
  const docComment = docM ? docM[2]! : undefined;

  // Choices resolution (priority: inline → class → textChoices → module → warn).
  // The kind is carried forward: the scanner's cross-file pass needs the
  // symbol name to finish an unresolved ref, and the UI shows which one failed.
  let choices: FieldChoices | undefined;
  const inlineChoices = extractInlineChoices(fullDef);
  if (inlineChoices) {
    choices = { kind: 'inline', values: inlineChoices };
  } else {
    const ref = extractChoicesRef(fullDef);
    if (ref) {
      const resolved =
        classConstants?.get(ref) ?? textChoicesIndex.get(ref) ?? moduleConstantsIndex.get(ref);
      if (resolved) {
        choices = { kind: 'resolved', symbolName: ref, values: resolved };
      } else {
        choices = { kind: 'unresolved', symbolName: ref };
        onWarn?.(`unresolved choices ref: ${ref}`, lineNum);
      }
    }
  }

  const field: Field = {
    name,
    fieldType,
    ...attrs,
    ...(docComment !== undefined && { docComment }),
    ...(choices !== undefined && { choices }),
  };

  return { field };
}

// ── Meta parser ───────────────────────────────────────────────────────────────

function parseMeta(
  lines: string[],
  startIdx: number,
  metaHeaderIndent: string,
): { meta: ModelMeta; nextIdx: number } {
  let i = startIdx;
  let dbTable: string | undefined;
  let verboseName: string | undefined;
  let verboseNamePlural: string | undefined;
  let ordering: string | undefined;
  let abstract: true | undefined;
  let proxy: true | undefined;
  let tableComment: string | undefined;
  // unique_together / indexes / constraints are routinely written across
  // several lines, so they are parsed from the whole body at once rather
  // than by the line-oriented regexes above.
  const bodyLines: string[] = [];

  while (i < lines.length) {
    const metaLine = lines[i] ?? '';
    const metaTrimmed = metaLine.trimStart();
    // Meta body = anything indented DEEPER than the `class Meta:` header
    // (blank lines and comments are tolerated). Works for 2-space, 4-space
    // and tab indentation alike.
    const isDeeper = leadingWsOf(metaLine).length > metaHeaderIndent.length;
    if (metaTrimmed !== '' && !isDeeper && !metaTrimmed.startsWith('#')) break;

    const dbMatch = metaLine.match(META_DB_TABLE_RE);
    if (dbMatch) dbTable = dbMatch[1]!;

    const verboseMatch = metaLine.match(META_VERBOSE_RE);
    if (verboseMatch) verboseName = verboseMatch[2]!;

    const pluralMatch = metaLine.match(META_VERBOSE_PLURAL_RE);
    if (pluralMatch) verboseNamePlural = pluralMatch[2]!;

    const orderMatch = metaLine.match(META_ORDERING_RE);
    if (orderMatch) ordering = orderMatch[1]!;

    if (/^\s+abstract\s*=\s*True/.test(metaLine)) abstract = true;
    if (/^\s+proxy\s*=\s*True/.test(metaLine)) proxy = true;

    const tableCommentMatch = metaLine.match(META_TABLE_COMMENT_RE);
    if (tableCommentMatch) tableComment = tableCommentMatch[2]!;

    bodyLines.push(metaLine);
    i++;
  }

  const indexes = parseMetaIndexes(bodyLines.join('\n'));

  const meta: ModelMeta = {
    ...(dbTable !== undefined && { dbTable }),
    ...(verboseName !== undefined && { verboseName }),
    ...(verboseNamePlural !== undefined && { verboseNamePlural }),
    ...(ordering !== undefined && { ordering }),
    ...(abstract !== undefined && { abstract }),
    ...(proxy !== undefined && { proxy }),
    ...(tableComment !== undefined && { tableComment }),
    ...(indexes.length > 0 && { indexes }),
  };

  return { meta, nextIdx: i };
}

// ── Parser ────────────────────────────────────────────────────────────────────

/**
 * Parse Django model classes from a Python source string.
 *
 * Design §8: opts.resolveImport is DECLARED but NEVER called in Fase 2.
 * Cross-file choices resolution is the Fase 3 scanner's responsibility.
 *
 * @param source  - Raw Python file content
 * @param opts    - Optional parser options (filePath, onWarn, resolveImport)
 * @returns ParseResult<Model[]> — always ok:true; partial results on malformed input
 */
export function parseModels(source: string, opts?: ParserOpts): ParseResult<Model[]> {
  if (!source.trim()) return { ok: true, value: [] };

  const filePath = opts?.filePath ?? '';
  const appLabel = deriveAppLabel(filePath);
  const onWarn = opts?.onWarn;

  // Which classes are models is decided up front: the answer needs the whole
  // file (a local abstract base may be declared after its children).
  const modelClassNames = detectModelClasses(source);

  // Build same-file symbol indexes before walking models
  const textChoicesIndex = parseTextChoicesClasses(source);
  const moduleConstantsIndex = parseModuleConstants(source);
  const classConstantsIndex = parseClassLevelConstants(source);

  // Merge nested TextChoices into classConstantsIndex
  for (const [enclosing, nested] of parseNestedTextChoicesClasses(source)) {
    const existing = classConstantsIndex.get(enclosing) ?? new Map<string, Choice[]>();
    for (const [name, values] of nested) existing.set(name, values);
    classConstantsIndex.set(enclosing, existing);
  }

  const lines = source.split('\n');
  const models: Model[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? '';
    const classMatch = line.match(MODEL_CLASS_RE);

    if (classMatch && modelClassNames.has(classMatch[1]!)) {
      const name = classMatch[1]!;
      const modelLine = i + 1; // 1-based
      const bases = classMatch[2]!
        .split(',')
        .map(b => b.trim())
        .filter(Boolean);
      // `field = None` drops a field inherited from an abstract base.
      const removedFields: string[] = [];
      const fields: Field[] = [];
      const relations: Relation[] = [];
      const properties: PropertyDef[] = [];
      const methods: string[] = [];
      let compositePrimaryKey: string[] | undefined;
      let meta: ModelMeta | undefined;
      // Indentation of the first statement in the class body — direct
      // members live at exactly this indent. Detected per class, so the
      // parser tolerates 2-space, tab, or mixed styles across a file.
      let bodyIndent: string | null = null;
      i++;

      while (i < lines.length) {
        const bodyLine = lines[i] ?? '';
        const trimmed = bodyLine.trimStart();

        // End of class: non-empty line at column 0
        if (trimmed !== '' && bodyLine.length === trimmed.length && !trimmed.startsWith('#')) break;

        // Blank lines and comments never define nor affect the body indent
        if (trimmed === '' || trimmed.startsWith('#')) {
          i++;
          continue;
        }

        const indent = leadingWsOf(bodyLine);
        if (bodyIndent === null) bodyIndent = indent;

        // Deeper (or shallower-but-indented) lines are continuations /
        // nested-class members — never direct members of this class.
        if (indent !== bodyIndent) {
          i++;
          continue;
        }

        // CompositePrimaryKey is a table constraint wearing a field's
        // syntax. Emitting it as a column produces a junk column AND a
        // second primary key in every export.
        const compositeMatch = trimmed.match(COMPOSITE_PK_RE);
        if (compositeMatch) {
          compositePrimaryKey = [...(compositeMatch[1] ?? '').matchAll(/['"](\w+)['"]/g)].map(
            m => m[1]!,
          );
          i++;
          continue;
        }

        // Field assignment: name = models.FieldType(...)
        const fieldMatch = trimmed.match(FIELD_ASSIGN_RE);
        if (fieldMatch) {
          const parsed = buildFieldOrRelation(
            fieldMatch[1]!,
            fieldMatch[2]!,
            lines,
            i,
            name,
            appLabel,
            textChoicesIndex,
            moduleConstantsIndex,
            classConstantsIndex.get(name),
            onWarn,
          );
          if (parsed.relation) relations.push(parsed.relation);
          else if (parsed.field) fields.push(parsed.field);
          i++;
          continue;
        }

        // GenericForeignKey
        const gfkMatch = trimmed.match(GFK_ASSIGN_RE);
        if (gfkMatch) {
          fields.push({ name: gfkMatch[1]!, fieldType: 'GenericForeignKey', isGenericFk: true });
          i++;
          continue;
        }

        // class Meta:
        if (META_CLASS_RE.test(trimmed)) {
          i++;
          const metaResult = parseMeta(lines, i, indent);
          meta = metaResult.meta;
          i = metaResult.nextIdx;
          continue;
        }

        // `name = None` — Django's documented way to drop an inherited field.
        const noneMatch = trimmed.match(/^(\w+)\s*=\s*None\s*$/);
        if (noneMatch) {
          removedFields.push(noneMatch[1]!);
          i++;
          continue;
        }

        // A zero-argument method. Templates call these exactly like a
        // field, and Django's docs put get_absolute_url on every model.
        const methodMatch = trimmed.match(ZERO_ARG_DEF_RE);
        if (methodMatch) {
          if (!methodMatch[1]!.startsWith('__')) methods.push(methodMatch[1]!);
          i++;
          continue;
        }

        // @property — captured with its source so the UI can show it.
        if (PROPERTY_DEF_RE.test(trimmed)) {
          const block = extractPropertyBlock(lines, i);
          if (block) {
            properties.push({ name: block.name, source: block.source });
            i = block.nextIdx;
          } else {
            i++;
          }
          continue;
        }

        i++;
      }

      const model: Model = {
        kind: 'model',
        name,
        appLabel,
        filePath,
        line: modelLine,
        fields,
        relations,
        properties,
        bases,
        ...(removedFields.length > 0 && { removedFields }),
        ...(compositePrimaryKey?.length ? { compositePrimaryKey } : {}),
        ...(methods.length > 0 && { methods }),
        ...(meta && Object.keys(meta).length > 0 && { meta }),
      };
      models.push(model);
    } else {
      i++;
    }
  }

  return { ok: true, value: applyInheritance(models) };
}
