/**
 * Text-format export generators for the ER diagram.
 * Produces Mermaid, DBML, and PlantUML sources from the model graph.
 * No vscode / fs / DOM dependency — purity is rg-verifiable.
 *
 * SVG/PNG exports (DGM-015/016) are canvas-side operations that live in the
 * Svelte webview (Batch 4). Only the text-format exports belong to domain.
 *
 * @inventory DGM-012 (Mermaid), DGM-013 (DBML), DGM-014 (PlantUML)
 */

import type { Model, ModelIndex } from '$domain/types/model';
import type { Field } from '$domain/types/field';
import type { Relation } from '$domain/types/relation';

// ── Constants ─────────────────────────────────────────────────────────────────

const RELATION_FIELD_TYPES = new Set(['ForeignKey', 'OneToOneField', 'ManyToManyField']);

/** Django field class → SQL base type. Length/precision is appended per field. */
const DBML_TYPE_MAP: Record<string, string> = {
  AutoField: 'integer',
  BigAutoField: 'bigint',
  SmallAutoField: 'smallint',
  CharField: 'varchar',
  TextField: 'text',
  IntegerField: 'integer',
  BigIntegerField: 'bigint',
  SmallIntegerField: 'smallint',
  PositiveIntegerField: 'integer',
  PositiveBigIntegerField: 'bigint',
  PositiveSmallIntegerField: 'smallint',
  BooleanField: 'boolean',
  DateField: 'date',
  DateTimeField: 'timestamp',
  TimeField: 'time',
  DurationField: 'interval',
  FloatField: 'float',
  DecimalField: 'decimal',
  SlugField: 'varchar',
  EmailField: 'varchar',
  URLField: 'varchar',
  FilePathField: 'varchar',
  FileField: 'varchar',
  ImageField: 'varchar',
  GenericIPAddressField: 'varchar',
  BinaryField: 'blob',
  JSONField: 'json',
  UUIDField: 'uuid',
};

const AUTO_FIELD_TYPES = new Set(['AutoField', 'BigAutoField', 'SmallAutoField']);

/** Django on_delete -> DBML referential action. DBML accepts
 *  cascade | restrict | set null | set default | no action. */
const DBML_DELETE_ACTION: Record<string, string | undefined> = {
  CASCADE: 'cascade',
  PROTECT: 'restrict',
  RESTRICT: 'restrict',
  SET_NULL: 'set null',
  SET_DEFAULT: 'set default',
  DO_NOTHING: 'no action',
};

// ── Internal helpers ──────────────────────────────────────────────────────────

function fqn(appLabel: string | undefined, name: string): string {
  return appLabel ? `${appLabel}.${name}` : name;
}

function aliasFor(name: string): string {
  // PlantUML entity aliases and Mermaid entity names must not contain dots.
  return name.replace(/\./g, '_');
}

function relKindToFKM2MO2O(kind: string): 'FK' | 'M2M' | 'O2O' {
  if (kind === 'm2m') return 'M2M';
  if (kind === 'o2o') return 'O2O';
  return 'FK';
}

/** Abstract bases have no table and proxies reuse their parent's. Neither is a
 *  row in any of these formats. */
function isTableBacked(m: Model): boolean {
  return !m.meta?.abstract && !m.meta?.proxy;
}

function scalarFields(m: Model): readonly Field[] {
  return m.fields.filter(f => !RELATION_FIELD_TYPES.has(f.fieldType) && !f.isGenericFk);
}

/**
 * What the table's primary key actually is.
 *
 * Django only adds the implicit `id` when the model declares no primary key of
 * its own. Emitting it unconditionally produced a duplicate `id` column on any
 * model with an explicit pk — and two `pk` markers, which dbdiagram rejects.
 */
type PrimaryKey =
  { kind: 'implicit'; column: 'id' } | { kind: 'declared'; columns: readonly string[] };

function primaryKeyOf(m: Model): PrimaryKey {
  if (m.compositePrimaryKey?.length) {
    return { kind: 'declared', columns: m.compositePrimaryKey };
  }
  const declared = scalarFields(m)
    .filter(f => f.isPrimaryKey)
    .map(f => f.name);
  if (declared.length > 0) return { kind: 'declared', columns: declared };
  // A field literally called `id` is the pk even without primary_key=True, and
  // emitting the implicit one next to it is invalid whatever Django thinks.
  if (scalarFields(m).some(f => f.name === 'id')) {
    return { kind: 'declared', columns: ['id'] };
  }
  return { kind: 'implicit', column: 'id' };
}

/** Column name without Django's DESC marker. */
const bareColumn = (field: string): string => (field.startsWith('-') ? field.slice(1) : field);

/** Meta indexes that name columns the table actually has. A Meta entry can
 *  reference a relation ('author' -> author_id) or a field on a parent, and
 *  emitting an index over a column that is not in the table breaks the export. */
function usableIndexes(m: Model): readonly ModelIndex[] {
  const columns = new Set(scalarFields(m).map(f => f.name));
  return (m.meta?.indexes ?? []).filter(idx => idx.fields.every(f => columns.has(bareColumn(f))));
}

/** Single pk column, or null when the table has a composite key. */
function singlePkColumn(m: Model): string | null {
  const pk = primaryKeyOf(m);
  if (pk.kind === 'implicit') return pk.column;
  return pk.columns.length === 1 ? pk.columns[0]! : null;
}

/**
 * The physical column a FK/O2O lands on.
 *
 * Django names it `<field>_id` unless db_column overrides it. Nothing emitted
 * this column before, so every DBML Ref pointed at a column that did not
 * exist — which the DBML parser rejects outright, taking the whole file with
 * it. M2M has no column on either side: Django puts it in a join table.
 */
export function relationColumn(r: Relation): string | null {
  if (r.kind === 'm2m') return null;
  return r.dbColumn ?? `${r.fieldName}_id`;
}

/** Relations that start at this model and land on a real column. */
function outgoingColumns(
  m: Model,
  relations: readonly Relation[],
): { relation: Relation; column: string }[] {
  const key = fqn(m.appLabel, m.name);
  const out: { relation: Relation; column: string }[] = [];
  const seen = new Set<string>();
  for (const r of relations) {
    if (r.fromModel !== key) continue;
    const column = relationColumn(r);
    // A column already declared as a scalar field wins — the model spells
    // it out itself and emitting it twice is invalid.
    if (column === null || seen.has(column)) continue;
    seen.add(column);
    out.push({ relation: r, column });
  }
  const declared = new Set(scalarFields(m).map(f => f.name));
  return out.filter(c => !declared.has(c.column));
}

/** Keep only relations whose endpoints both exist as real tables. */
function tableBackedRelations(
  models: readonly Model[],
  relations: readonly Relation[],
): readonly Relation[] {
  const keys = new Set(models.filter(isTableBacked).map(m => fqn(m.appLabel, m.name)));
  return relations.filter(r => keys.has(r.fromModel) && keys.has(r.toModel));
}

// ── DGM-012: Mermaid ─────────────────────────────────────────────────────────

/**
 * Generate [Mermaid](https://mermaid.js.org/syntax/entityRelationshipDiagram.html)
 * ER diagram syntax from models and relations.
 *
 * Entity ids are the dot-free qualified name. Relations always arrive qualified
 * ("blog.Post"), so naming entities by their bare name made Mermaid render two
 * separate nodes per model — one with the fields, one with the edges.
 */
/** True when a unique index covers exactly this column — the only unique shape
 *  Mermaid's UK token can honestly represent. */
function soleColumnOfUnique(column: string, indexes: readonly ModelIndex[]): boolean {
  return indexes.some(
    i => i.unique && !i.partial && i.fields.length === 1 && bareColumn(i.fields[0]!) === column,
  );
}

/**
 * What is left of a table-level index once it has to fit in a column comment.
 *
 * Mermaid has no table-level index syntax, so a composite unique cannot be
 * marked UK on each member — that would claim each column is independently
 * unique, which is a stronger and false statement. Naming the partners is the
 * honest fallback.
 */
function mermaidIndexNotes(column: string, indexes: readonly ModelIndex[]): string[] {
  const notes: string[] = [];
  for (const idx of indexes) {
    const columns = idx.fields.map(bareColumn);
    if (!columns.includes(column)) continue;
    // A partial index covers a subset of rows. Writing plain "indexed" for
    // it claims more than is true, and UK would be flatly wrong.
    const suffix = idx.partial ? '_partial' : '';
    if (columns.length === 1) {
      if (!idx.unique || idx.partial) notes.push(`indexed${suffix}`);
      continue;
    }
    const others = columns.filter(c => c !== column).join('_');
    notes.push(`${idx.unique ? 'unique' : 'indexed'}_with_${others}${suffix}`);
  }
  return notes;
}

export function generateMermaid(models: readonly Model[], relations: readonly Relation[]): string {
  const lines: string[] = ['erDiagram'];
  const edges = tableBackedRelations(models, relations);

  for (const m of models) {
    if (!isTableBacked(m)) continue;
    const fields = scalarFields(m);
    const fkCount = outgoingColumns(m, edges).length;
    if (fields.length === 0 && fkCount === 0) continue;
    const id = aliasFor(fqn(m.appLabel, m.name));
    const indexes = usableIndexes(m);
    const fkColumns = outgoingColumns(m, edges);
    lines.push(`    ${id} {`);
    for (const f of fields) {
      const attrs: string[] = [];
      if (f.maxLength) attrs.push(`max_length_${f.maxLength}`);
      if (f.maxDigits !== undefined) attrs.push(`max_digits_${f.maxDigits}`);
      if (f.decimalPlaces !== undefined) attrs.push(`decimal_places_${f.decimalPlaces}`);
      if (f.isNull) attrs.push('nullable');
      attrs.push(...mermaidIndexNotes(f.name, indexes));

      // Mermaid allows several comma-separated key tokens per attribute
      // (PK, FK, UK) and nothing at table level.
      const keys: string[] = [];
      if (f.isPrimaryKey) keys.push('PK');
      if (f.isUnique || soleColumnOfUnique(f.name, indexes)) keys.push('UK');

      const key = keys.length > 0 ? ` ${keys.join(', ')}` : '';
      const comment = attrs.length > 0 ? ` "${attrs.join(', ')}"` : '';
      lines.push(`        ${f.fieldType} ${f.name}${key}${comment}`);
    }
    // The FK column is a real column of this table; an entity that omits it
    // is missing part of its own schema.
    for (const { relation, column } of fkColumns) {
      const type = relation.kind === 'o2o' ? 'OneToOneField' : 'ForeignKey';
      const keys = relation.kind === 'o2o' ? 'FK, UK' : 'FK';
      const note = relation.isNull ? ' "nullable"' : '';
      lines.push(`        ${type} ${column} ${keys}${note}`);
    }
    lines.push('    }');
  }

  for (const r of edges) {
    const type = relKindToFKM2MO2O(r.kind);
    let arrow: string;
    if (type === 'FK') arrow = '}o--||';
    else if (type === 'M2M') arrow = '}o--o{';
    else arrow = '||--||'; // O2O
    lines.push(`    ${aliasFor(r.fromModel)} ${arrow} ${aliasFor(r.toModel)} : "${r.fieldName}"`);
  }

  return lines.join('\n');
}

// ── DGM-013: DBML ────────────────────────────────────────────────────────────

/** SQL type with its length/precision, e.g. varchar(200), decimal(12,2). */
function dbmlType(f: Field): string {
  const base = DBML_TYPE_MAP[f.fieldType] ?? 'text';
  if (base === 'varchar' && f.maxLength) return `varchar(${f.maxLength})`;
  if (base === 'decimal' && f.maxDigits !== undefined) {
    return f.decimalPlaces !== undefined
      ? `decimal(${f.maxDigits},${f.decimalPlaces})`
      : `decimal(${f.maxDigits})`;
  }
  return base;
}

/** DBML column settings, in the order dbdiagram's own docs use them. */
function dbmlColumnSettings(f: Field, isPk: boolean, isSinglePk: boolean): string {
  const settings: string[] = [];
  if (isPk && isSinglePk) settings.push('pk');
  if (AUTO_FIELD_TYPES.has(f.fieldType)) settings.push('increment');
  if (f.isUnique && !isPk) settings.push('unique');
  // A primary key is not-null by definition; spelling it out is noise.
  if (f.isNull) settings.push('null');
  else if (!isPk) settings.push('not null');
  if (f.isDbIndex) settings.push("note: 'db_index'");
  const def = dbmlDefault(f.defaultValue);
  if (def !== null) settings.push(`default: ${def}`);
  return settings.length > 0 ? ` [${settings.join(', ')}]` : '';
}

/**
 * Render a Python default as a DBML default.
 *
 * Backticks mean EXPRESSION in DBML, so wrapping everything in them turns the
 * number 0 into a function call as far as dbdiagram is concerned. Literals go
 * through bare; anything callable stays an expression.
 */
function dbmlDefault(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const v = raw.trim();
  if (v === '' || v.length >= 30) return null;
  if (/^-?\d+(\.\d+)?$/.test(v)) return v;
  if (v === 'True') return 'true';
  if (v === 'False') return 'false';
  if (v === 'None') return 'null';
  const quoted = v.match(/^['"](.*)['"]$/);
  if (quoted) return `'${quoted[1]!.replace(/'/g, "\\'")}'`;
  return `\`${v}\``;
}

/**
 * One line of a DBML `indexes` block.
 *
 * Per the DBML spec a single column is written bare and several are wrapped in
 * parentheses; settings follow in brackets. DBML has no ASC/DESC inside an
 * index, so Django's leading-hyphen ordering is preserved as a note instead of
 * being silently dropped — and a `condition=Q(...)` index is annotated rather
 * than passed off as covering the whole table.
 */
function dbmlIndexEntry(idx: ModelIndex): string {
  const columns = idx.fields.map(bareColumn);
  const target = columns.length === 1 ? columns[0]! : `(${columns.join(', ')})`;

  const settings: string[] = [];
  if (idx.unique) settings.push('unique');
  if (idx.name) settings.push(`name: '${idx.name.replace(/'/g, "\\'")}'`);

  const notes: string[] = [];
  const desc = idx.fields.filter(f => f.startsWith('-')).map(bareColumn);
  if (desc.length > 0) notes.push(`desc: ${desc.join(', ')}`);
  if (idx.partial) notes.push('partial (condition)');
  if (notes.length > 0) settings.push(`note: '${notes.join('; ')}'`);

  return settings.length > 0 ? `${target} [${settings.join(', ')}]` : target;
}

/**
 * Emit [DBML](https://dbml.dbdiagram.io/docs/) — a database markup language
 * supported by dbdiagram.io, dbdocs.io, and other tools.
 * Each Django model becomes a `Table` and each relation becomes a `Ref`.
 */
export function generateDBML(models: readonly Model[], relations: readonly Relation[]): string {
  const lines: string[] = [];
  lines.push('// Auto-generated from Django models');
  lines.push('');

  const tables = models.filter(isTableBacked);
  const refs = tableBackedRelations(models, relations);
  // A FK column copies the type of the key it points at.
  const pkTypeByKey = new Map(
    tables.map(m => {
      const col = singlePkColumn(m);
      const f = col === null ? undefined : scalarFields(m).find(x => x.name === col);
      return [fqn(m.appLabel, m.name), f ? dbmlType(f) : 'integer'] as const;
    }),
  );

  for (const m of tables) {
    const name = fqn(m.appLabel, m.name);
    const pk = primaryKeyOf(m);
    const pkColumns = new Set(pk.kind === 'implicit' ? [pk.column] : pk.columns);
    const isSinglePk = pkColumns.size === 1;

    lines.push(`Table "${name}" {`);
    if (pk.kind === 'implicit') lines.push('  id integer [pk, increment]');

    for (const f of scalarFields(m)) {
      const settings = dbmlColumnSettings(f, pkColumns.has(f.name), isSinglePk);
      lines.push(`  ${f.name} ${dbmlType(f)}${settings}`);
    }
    for (const { relation, column } of outgoingColumns(m, refs)) {
      const settings: string[] = [];
      if (relation.kind === 'o2o') settings.push('unique');
      settings.push(relation.isNull ? 'null' : 'not null');
      lines.push(
        `  ${column} ${pkTypeByKey.get(relation.toModel) ?? 'integer'} [${settings.join(', ')}]`,
      );
    }

    // DBML puts both the composite key and every secondary index in one
    // table-level `indexes` block.
    const entries: string[] = [];
    if (!isSinglePk) entries.push(`(${[...pkColumns].join(', ')}) [pk]`);
    for (const idx of usableIndexes(m)) entries.push(dbmlIndexEntry(idx));
    if (entries.length > 0) {
      lines.push('');
      lines.push('  indexes {');
      for (const e of entries) lines.push(`    ${e}`);
      lines.push('  }');
    }
    lines.push('}');
    lines.push('');
  }

  const pkByKey = new Map(tables.map(m => [fqn(m.appLabel, m.name), singlePkColumn(m)]));
  if (refs.length > 0) {
    lines.push('// Relationships');
    for (const r of refs) {
      const targetCol = pkByKey.get(r.toModel) ?? null;
      const sourcePk = pkByKey.get(r.fromModel) ?? null;
      if (targetCol === null) {
        // Composite target: the FK spans several columns and DBML needs
        // all of them, which the Django declaration does not give us.
        lines.push(
          `// ${r.fromModel}.${r.fieldName} -> ${r.toModel} (composite primary key — ref omitted)`,
        );
        continue;
      }
      // M2M lives in a join table, so neither side has a column to hang
      // the ref on. DBML's <> is exactly this case: relate the two keys.
      if (r.kind === 'm2m') {
        if (sourcePk === null) continue;
        lines.push(
          `Ref: "${r.fromModel}"."${sourcePk}" <> "${r.toModel}"."${targetCol}" // ${r.fieldName}`,
        );
        continue;
      }
      const column = relationColumn(r)!;
      const op = r.kind === 'o2o' ? '-' : '>';
      const action = DBML_DELETE_ACTION[r.onDelete ?? ''];
      const settings = action ? ` [delete: ${action}]` : '';
      lines.push(
        `Ref: "${r.fromModel}"."${column}" ${op} "${r.toModel}"."${targetCol}"${settings}`,
      );
    }
  }

  return lines.join('\n');
}

// ── DGM-014: PlantUML ────────────────────────────────────────────────────────

/**
 * Emit [PlantUML](https://plantuml.com/ie-diagram) IE (entity-relationship)
 * diagram syntax.
 */
export function generatePlantUML(models: readonly Model[], relations: readonly Relation[]): string {
  const lines: string[] = [];
  lines.push('@startuml');
  lines.push('!theme plain');
  lines.push('hide circle');
  lines.push('skinparam linetype ortho');
  lines.push('');
  const arrows = tableBackedRelations(models, relations);

  for (const m of models) {
    if (!isTableBacked(m)) continue;
    const name = fqn(m.appLabel, m.name);
    const pk = primaryKeyOf(m);
    const pkColumns = new Set(pk.kind === 'implicit' ? [pk.column] : pk.columns);

    lines.push(`entity "${name}" as ${aliasFor(name)} {`);
    if (pk.kind === 'implicit') lines.push('  * id : integer <<generated>>');
    else {
      for (const col of pkColumns) {
        const f = scalarFields(m).find(x => x.name === col);
        lines.push(`  * ${col} : ${f?.fieldType ?? 'integer'} <<PK>>`);
      }
    }
    lines.push('  --');
    for (const f of scalarFields(m)) {
      if (pkColumns.has(f.name)) continue; // already listed above the divider
      const required = f.isNull ? '' : '* ';
      lines.push(`  ${required}${f.name} : ${f.fieldType}`);
    }

    for (const { relation, column } of outgoingColumns(m, arrows)) {
      const required = relation.isNull ? '' : '* ';
      const type = relation.kind === 'o2o' ? 'OneToOneField' : 'ForeignKey';
      lines.push(`  ${required}${column} : ${type} <<FK>>`);
    }

    // IE diagrams have no index notation, but an entity may carry more than
    // one `--` divider, so the indexes get their own section rather than
    // being dropped or faked onto the columns.
    const indexes = usableIndexes(m);
    if (indexes.length > 0) {
      lines.push('  --');
      for (const idx of indexes) {
        const kind = idx.unique ? 'unique' : 'index';
        const suffix = idx.partial ? ' <<partial>>' : '';
        lines.push(`  ${kind} (${idx.fields.map(bareColumn).join(', ')})${suffix}`);
      }
    }
    lines.push('}');
    lines.push('');
  }

  if (arrows.length > 0) {
    lines.push("' Relationships");
    for (const r of arrows) {
      const type = relKindToFKM2MO2O(r.kind);
      // PlantUML crow's-foot: }o--||=many-to-one, ||--||=one-to-one, }o--o{=many-to-many
      const arrow = type === 'FK' ? '}o--||' : type === 'O2O' ? '||--||' : '}o--o{';
      lines.push(`${aliasFor(r.fromModel)} ${arrow} ${aliasFor(r.toModel)} : ${r.fieldName}`);
    }
  }

  lines.push('@enduml');
  return lines.join('\n');
}
