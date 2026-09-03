import { describe, it, expect } from 'vitest';
import { generateMermaid, generateDBML, generatePlantUML } from './diagram-exports';
import type { Model } from '$domain/types/model';
import type { Relation } from '$domain/types/relation';

// ── Test fixtures ──────────────────────────────────────────────────────────────

const blogPost: Model = {
  kind: 'model',
  name: 'Post',
  appLabel: 'blog',
  filePath: 'blog/models.py',
  line: 5,
  fields: [
    { name: 'title', fieldType: 'CharField', maxLength: 200 },
    { name: 'content', fieldType: 'TextField', isNull: true, isBlank: true },
    { name: 'created_at', fieldType: 'DateTimeField' },
  ],
  relations: [],
  properties: [],
};

const blogTag: Model = {
  kind: 'model',
  name: 'Tag',
  appLabel: 'blog',
  filePath: 'blog/models.py',
  line: 20,
  fields: [{ name: 'name', fieldType: 'CharField', maxLength: 50 }],
  relations: [],
  properties: [],
};

const abstractBase: Model = {
  kind: 'model',
  name: 'BaseModel',
  appLabel: 'core',
  filePath: 'core/models.py',
  line: 1,
  fields: [{ name: 'created_at', fieldType: 'DateTimeField' }],
  relations: [],
  properties: [],
  meta: { abstract: true },
};

const proxyModel: Model = {
  kind: 'model',
  name: 'PublishedPost',
  appLabel: 'blog',
  filePath: 'blog/models.py',
  line: 40,
  fields: [],
  relations: [],
  properties: [],
  meta: { proxy: true },
};

/** Explicit UUID primary key — the case that produced a duplicate `id`. */
const uuidPkModel: Model = {
  kind: 'model',
  name: 'Device',
  appLabel: 'fleet',
  filePath: 'fleet/models.py',
  line: 3,
  fields: [
    { name: 'uuid', fieldType: 'UUIDField', isPrimaryKey: true },
    { name: 'label', fieldType: 'CharField', maxLength: 64 },
  ],
  relations: [],
  properties: [],
};

/** A field literally named `id` — Django's pk, and a second one is invalid SQL. */
const explicitIdModel: Model = {
  kind: 'model',
  name: 'Legacy',
  appLabel: 'shop',
  filePath: 'shop/models.py',
  line: 3,
  fields: [
    { name: 'id', fieldType: 'BigAutoField', isPrimaryKey: true },
    { name: 'sku', fieldType: 'CharField', maxLength: 32, isUnique: true },
  ],
  relations: [],
  properties: [],
};

const compositePkModel: Model = {
  kind: 'model',
  name: 'TenantRow',
  appLabel: 'core',
  filePath: 'core/models.py',
  line: 3,
  fields: [
    { name: 'tenant_id', fieldType: 'IntegerField' },
    { name: 'row_id', fieldType: 'IntegerField' },
    { name: 'payload', fieldType: 'JSONField' },
  ],
  relations: [],
  properties: [],
  compositePrimaryKey: ['tenant_id', 'row_id'],
};

const moneyModel: Model = {
  kind: 'model',
  name: 'Invoice',
  appLabel: 'billing',
  filePath: 'billing/models.py',
  line: 3,
  fields: [
    {
      name: 'total',
      fieldType: 'DecimalField',
      maxDigits: 12,
      decimalPlaces: 2,
      defaultValue: '0',
    },
    { name: 'sent', fieldType: 'BooleanField', defaultValue: 'False' },
    { name: 'code', fieldType: 'CharField', maxLength: 20, defaultValue: "'AA'" },
    { name: 'created', fieldType: 'DateTimeField', defaultValue: 'timezone.now' },
  ],
  relations: [],
  properties: [],
};

const fkRelation: Relation = {
  kind: 'fk',
  fromModel: 'blog.Post',
  toModel: 'blog.Tag',
  fieldName: 'tag',
  onDelete: 'CASCADE',
};

const m2mRelation: Relation = {
  kind: 'm2m',
  fromModel: 'blog.Post',
  toModel: 'blog.Tag',
  fieldName: 'tags',
};

const o2oRelation: Relation = {
  kind: 'o2o',
  fromModel: 'blog.Post',
  toModel: 'blog.Tag',
  fieldName: 'featured_tag',
};

const models: readonly Model[] = [blogPost, blogTag];

// ── DGM-012: Mermaid golden output ────────────────────────────────────────────

describe('generateMermaid — golden output (DGM-012)', () => {
  it('starts with "erDiagram"', () => {
    const src = generateMermaid(models, []);
    expect(src).toMatch(/^erDiagram/);
  });

  it('includes model entity blocks for non-abstract models', () => {
    const src = generateMermaid(models, []);
    expect(src).toContain('    blog_Post {');
    expect(src).toContain('    blog_Tag {');
  });

  it('skips abstract models', () => {
    const src = generateMermaid([...models, abstractBase], []);
    expect(src).not.toContain('core_BaseModel');
  });

  it('skips proxy models — they reuse their parent table', () => {
    const src = generateMermaid([...models, proxyModel], []);
    expect(src).not.toContain('blog_PublishedPost');
  });

  it('includes field type and name for each scalar field', () => {
    const src = generateMermaid(models, []);
    expect(src).toContain('CharField title');
    expect(src).toContain('TextField content');
  });

  it('appends nullable comment for null fields', () => {
    const src = generateMermaid(models, []);
    expect(src).toContain('"nullable"');
  });

  it('marks the primary key with PK', () => {
    const src = generateMermaid([uuidPkModel], []);
    expect(src).toContain('UUIDField uuid PK');
  });

  it('carries decimal precision into the attribute comment', () => {
    const src = generateMermaid([moneyModel], []);
    expect(src).toContain('DecimalField total "max_digits_12, decimal_places_2"');
  });

  // Was: 'blog.Post }o--|| blog.Tag'. The entity block was named `Post` while
  // the relation said `blog.Post`, so Mermaid drew two nodes per model — one
  // holding the fields, one holding the edges. The old test asserted the
  // mismatch. Both sides now use the dot-free qualified id.
  it('names relation endpoints exactly as the entity blocks', () => {
    const src = generateMermaid(models, [fkRelation]);
    expect(src).toContain('blog_Post }o--|| blog_Tag : "tag"');
    expect(src).toContain('    blog_Post {');
  });

  it('emits M2M relation with correct arrow', () => {
    const src = generateMermaid(models, [m2mRelation]);
    expect(src).toContain('blog_Post }o--o{ blog_Tag : "tags"');
  });

  it('emits O2O relation with correct arrow', () => {
    const src = generateMermaid(models, [o2oRelation]);
    expect(src).toContain('blog_Post ||--|| blog_Tag : "featured_tag"');
  });

  it('drops relations pointing at a skipped model', () => {
    const toAbstract: Relation = { ...fkRelation, toModel: 'core.BaseModel' };
    const src = generateMermaid([...models, abstractBase], [toAbstract]);
    expect(src).not.toContain('core_BaseModel');
  });
});

// ── DGM-013: DBML golden output ───────────────────────────────────────────────

describe('generateDBML — golden output (DGM-013)', () => {
  it('starts with auto-generated comment', () => {
    const src = generateDBML(models, []);
    expect(src).toContain('// Auto-generated from Django models');
  });

  it('emits Table blocks with fully qualified names', () => {
    const src = generateDBML(models, []);
    expect(src).toContain('Table "blog.Post" {');
    expect(src).toContain('Table "blog.Tag" {');
  });

  it('adds the implicit id only when Django would', () => {
    const src = generateDBML(models, []);
    expect(src).toContain('id integer [pk, increment]');
  });

  it('skips abstract and proxy models', () => {
    const src = generateDBML([...models, abstractBase, proxyModel], []);
    expect(src).not.toContain('Table "core.BaseModel"');
    expect(src).not.toContain('Table "blog.PublishedPost"');
  });
});

// The reported dbdiagram failures, each pinned to its own case.
describe('generateDBML — primary keys', () => {
  it('does not add an implicit id next to a declared primary key', () => {
    const src = generateDBML([uuidPkModel], []);
    expect(src).not.toContain('id integer [pk, increment]');
    expect(src).toContain('uuid uuid [pk]');
  });

  it('does not emit id twice when the model declares its own', () => {
    const src = generateDBML([explicitIdModel], []);
    const idLines = src.split('\n').filter(l => /^\s+id\s/.test(l));
    expect(idLines).toHaveLength(1);
    expect(idLines[0]).toContain('bigint [pk, increment]');
  });

  it('expresses a composite primary key as a table index, not a column', () => {
    const src = generateDBML([compositePkModel], []);
    expect(src).not.toContain('id integer [pk, increment]');
    expect(src).toContain('  indexes {');
    expect(src).toContain('    (tenant_id, row_id) [pk]');
    // A composite key on a column setting is what dbdiagram rejects.
    expect(src).not.toMatch(/tenant_id integer \[pk/);
  });

  it('points a Ref at the target primary key, whatever it is called', () => {
    const rel: Relation = {
      kind: 'fk',
      fromModel: 'blog.Post',
      toModel: 'fleet.Device',
      fieldName: 'device',
    };
    const src = generateDBML([blogPost, uuidPkModel], [rel]);
    expect(src).toContain('Ref: "blog.Post"."device_id" > "fleet.Device"."uuid"');
  });

  // Was: 'Ref: "blog.Post"."tag" > "blog.Tag".id' — the target column was
  // hardcoded and unquoted, and the SOURCE named the Django field rather than
  // the column Django actually creates.
  it('quotes both sides and names the real source column', () => {
    const src = generateDBML(models, [fkRelation]);
    expect(src).toContain('Ref: "blog.Post"."tag_id" > "blog.Tag"."id" [delete: cascade]');
  });

  it('omits a Ref it cannot express instead of emitting a broken one', () => {
    const rel: Relation = {
      kind: 'fk',
      fromModel: 'blog.Post',
      toModel: 'core.TenantRow',
      fieldName: 'row',
    };
    const src = generateDBML([blogPost, compositePkModel], [rel]);
    expect(src).not.toContain('Ref: "blog.Post"."row"');
    expect(src).toContain('composite primary key — ref omitted');
  });

  it('emits M2M and O2O refs with their own operators', () => {
    // M2M has no column on either side, so the two keys are related directly.
    expect(generateDBML(models, [m2mRelation])).toContain(
      'Ref: "blog.Post"."id" <> "blog.Tag"."id"',
    );
    expect(generateDBML(models, [o2oRelation])).toContain(
      'Ref: "blog.Post"."featured_tag_id" - "blog.Tag"."id"',
    );
  });
});

describe('generateDBML — column types', () => {
  // Was: `title varchar [note: 'max_length=200']`. dbdiagram renders a note as
  // a comment, so the column had no length at all.
  it('gives varchar its length', () => {
    const src = generateDBML(models, []);
    expect(src).toContain('title varchar(200)');
    expect(src).not.toContain("note: 'max_length");
  });

  it('gives decimal its precision and scale', () => {
    const src = generateDBML([moneyModel], []);
    expect(src).toContain('total decimal(12,2)');
  });

  it('maps auto fields to an incrementing integer, not text', () => {
    const src = generateDBML([explicitIdModel], []);
    expect(src).toContain('id bigint [pk, increment]');
  });

  it('maps TextField to text', () => {
    const src = generateDBML(models, []);
    expect(src).toContain('content text');
  });

  it('marks nullability explicitly on both sides', () => {
    const src = generateDBML(models, []);
    expect(src).toContain('content text [null]');
    expect(src).toContain('title varchar(200) [not null]');
  });

  it('carries unique through', () => {
    const src = generateDBML([explicitIdModel], []);
    expect(src).toContain('sku varchar(32) [unique, not null]');
  });
});

describe('generateDBML — defaults', () => {
  // Backticks mean EXPRESSION in DBML. Wrapping a literal in them makes
  // dbdiagram treat 0 as a function call.
  it('emits numbers bare', () => {
    expect(generateDBML([moneyModel], [])).toContain('default: 0');
  });

  it('lowercases Python booleans', () => {
    expect(generateDBML([moneyModel], [])).toContain('default: false');
  });

  it('keeps strings quoted', () => {
    expect(generateDBML([moneyModel], [])).toContain("default: 'AA'");
  });

  it('keeps callables as expressions', () => {
    expect(generateDBML([moneyModel], [])).toContain('default: `timezone.now`');
  });
});

// ── DGM-014: PlantUML golden output ──────────────────────────────────────────

describe('generatePlantUML — golden output (DGM-014)', () => {
  it('starts with @startuml and ends with @enduml', () => {
    const src = generatePlantUML(models, []);
    expect(src).toMatch(/^@startuml/);
    expect(src).toMatch(/@enduml$/);
  });

  it('includes entity blocks', () => {
    const src = generatePlantUML(models, []);
    expect(src).toContain('entity "blog.Post"');
    expect(src).toContain('entity "blog.Tag"');
  });

  it('uses dot-free aliases', () => {
    const src = generatePlantUML(models, []);
    expect(src).toContain('as blog_Post');
    expect(src).toContain('as blog_Tag');
  });

  it('skips abstract and proxy models', () => {
    const src = generatePlantUML([...models, abstractBase, proxyModel], []);
    expect(src).not.toContain('entity "core.BaseModel"');
    expect(src).not.toContain('entity "blog.PublishedPost"');
  });

  it('marks nullable fields without asterisk', () => {
    const src = generatePlantUML(models, []);
    expect(src).toContain('  content : TextField');
  });

  it('marks required fields with asterisk', () => {
    const src = generatePlantUML(models, []);
    expect(src).toContain('  * title : CharField');
  });

  it('does not invent an id when the model declares a primary key', () => {
    const src = generatePlantUML([uuidPkModel], []);
    expect(src).not.toContain('* id : integer <<generated>>');
    expect(src).toContain('* uuid : UUIDField <<PK>>');
  });

  it('lists every column of a composite key above the divider, once', () => {
    const src = generatePlantUML([compositePkModel], []);
    expect(src).toContain('* tenant_id : IntegerField <<PK>>');
    expect(src).toContain('* row_id : IntegerField <<PK>>');
    expect(src.split('tenant_id').length - 1).toBe(1);
  });

  it('emits FK arrow }o--||', () => {
    const src = generatePlantUML(models, [fkRelation]);
    expect(src).toContain('blog_Post }o--|| blog_Tag : tag');
  });

  it('emits M2M arrow }o--o{', () => {
    const src = generatePlantUML(models, [m2mRelation]);
    expect(src).toContain('blog_Post }o--o{ blog_Tag : tags');
  });

  it('emits O2O arrow ||--||', () => {
    const src = generatePlantUML(models, [o2oRelation]);
    expect(src).toContain('blog_Post ||--|| blog_Tag : featured_tag');
  });
});

// ── Output stability (all three generators are pure) ─────────────────────────

describe('export generators — purity / stability', () => {
  it('generateMermaid is stable for same input', () => {
    expect(generateMermaid(models, [fkRelation])).toBe(generateMermaid(models, [fkRelation]));
  });

  it('generateDBML is stable for same input', () => {
    expect(generateDBML(models, [fkRelation])).toBe(generateDBML(models, [fkRelation]));
  });

  it('generatePlantUML is stable for same input', () => {
    expect(generatePlantUML(models, [fkRelation])).toBe(generatePlantUML(models, [fkRelation]));
  });

  it('empty models + no relations yields minimal valid output for each format', () => {
    expect(generateMermaid([], [])).toBe('erDiagram');
    expect(generateDBML([], [])).toContain('// Auto-generated from Django models');
    expect(generatePlantUML([], [])).toContain('@startuml');
    expect(generatePlantUML([], [])).toContain('@enduml');
  });
});

// ── Meta indexes: unique_together / Meta.indexes / constraints ───────────────
//
// Each format expresses a different subset. DBML has a real table-level
// `indexes` block; Mermaid has none at all and only per-column PK/FK/UK;
// PlantUML IE has no index notation but allows several `--` dividers.

const indexedModel: Model = {
  kind: 'model',
  name: 'Booking',
  appLabel: 'hotel',
  filePath: 'hotel/models.py',
  line: 3,
  fields: [
    { name: 'room', fieldType: 'CharField', maxLength: 20 },
    { name: 'date', fieldType: 'DateField' },
    { name: 'code', fieldType: 'CharField', maxLength: 8 },
    { name: 'pub_date', fieldType: 'DateTimeField' },
    { name: 'active', fieldType: 'BooleanField' },
  ],
  relations: [],
  properties: [],
  meta: {
    indexes: [
      { fields: ['room', 'date'], unique: true },
      { fields: ['code', '-pub_date'], name: 'code_pub_idx' },
      { fields: ['code'], name: 'code_uniq', unique: true },
      { fields: ['active'], name: 'live_idx', partial: true },
    ],
  },
};

describe('generateDBML — Meta indexes', () => {
  const src = generateDBML([indexedModel], []);

  it('wraps a composite index in parentheses, per the DBML spec', () => {
    expect(src).toContain('    (room, date) [unique]');
  });

  it('writes a single-column index bare, not parenthesised', () => {
    expect(src).toContain("    code [unique, name: 'code_uniq']");
  });

  it('carries the index name', () => {
    expect(src).toContain("name: 'code_pub_idx'");
  });

  // DBML has no ASC/DESC inside an index, so Django's leading hyphen has
  // nowhere to go but a note. Dropping it silently loses the sort order.
  it('records descending columns in a note instead of dropping them', () => {
    expect(src).toContain('(code, pub_date)');
    expect(src).toContain('desc: pub_date');
    expect(src).not.toContain('-pub_date');
  });

  it('annotates a partial index rather than passing it off as complete', () => {
    expect(src).toContain('partial (condition)');
  });

  it('puts them inside the table, in one indexes block', () => {
    const block = src.slice(src.indexOf('  indexes {'), src.indexOf('  }'));
    expect(block).toContain('(room, date)');
    expect(block).toContain('code');
  });

  it('emits no indexes block for a model without any', () => {
    expect(generateDBML(models, [])).not.toContain('indexes {');
  });

  // An index over a relation ('author' -> author_id) or a parent's field
  // names a column this table does not have.
  it('skips an index naming a column the table does not have', () => {
    const ghost: Model = { ...indexedModel, meta: { indexes: [{ fields: ['nope'] }] } };
    expect(generateDBML([ghost], [])).not.toContain('indexes {');
  });
});

describe('generateMermaid — Meta indexes', () => {
  const src = generateMermaid([indexedModel], []);

  it('marks a single-column unique index as UK', () => {
    expect(src).toContain('CharField code UK');
  });

  // Marking each member of a composite unique as UK would claim each column
  // is independently unique — a stronger and false statement.
  it('never marks a composite unique member as UK', () => {
    expect(src).toContain('CharField room "max_length_20, unique_with_date"');
    expect(src).not.toMatch(/room UK/);
    expect(src).not.toMatch(/date UK/);
  });

  it('names the partner columns of a composite index', () => {
    expect(src).toContain('DateField date "unique_with_room"');
  });

  it('does not call a partial index plainly indexed', () => {
    expect(src).toContain('BooleanField active "indexed_partial"');
  });

  it('keeps comments free of double quotes, which Mermaid forbids', () => {
    for (const line of src.split('\n')) {
      const comment = /"([^"]*)"/.exec(line);
      if (comment) expect(comment[1]).not.toContain('"');
    }
  });
});

describe('generatePlantUML — Meta indexes', () => {
  const src = generatePlantUML([indexedModel], []);

  it('opens a second divider for the index section', () => {
    expect(src.split('\n').filter(l => l.trim() === '--').length).toBe(2);
  });

  it('distinguishes unique from plain indexes', () => {
    expect(src).toContain('  unique (room, date)');
    expect(src).toContain('  index (code, pub_date)');
  });

  it('flags a partial index', () => {
    expect(src).toContain('  index (active) <<partial>>');
  });

  it('adds no second divider when there are no indexes', () => {
    const plain = generatePlantUML(models, []);
    expect(plain.split('\n').filter(l => l.trim() === '--').length).toBe(2); // one per entity
  });
});

// ── Relation columns ─────────────────────────────────────────────────────────
//
// A FK lands on a real column (`<field>_id`). Nothing emitted it, so every DBML
// Ref pointed at a column that did not exist — which the DBML parser rejects
// outright, taking the whole file down. Verified against @dbml/core: the whole
// 222-model export now parses and converts to Postgres SQL.

const author: Model = {
  kind: 'model',
  name: 'Author',
  appLabel: 'blog',
  filePath: 'blog/models.py',
  line: 1,
  fields: [{ name: 'name', fieldType: 'CharField', maxLength: 50 }],
  relations: [],
  properties: [],
};
const article: Model = {
  kind: 'model',
  name: 'Article',
  appLabel: 'blog',
  filePath: 'blog/models.py',
  line: 10,
  fields: [{ name: 'title', fieldType: 'CharField', maxLength: 50 }],
  relations: [],
  properties: [],
};
const authorFk: Relation = {
  kind: 'fk',
  fromModel: 'blog.Article',
  toModel: 'blog.Author',
  fieldName: 'author',
  onDelete: 'CASCADE',
};
const profileO2O: Relation = {
  kind: 'o2o',
  fromModel: 'blog.Article',
  toModel: 'blog.Author',
  fieldName: 'reviewer',
  onDelete: 'SET_NULL',
  isNull: true,
};
const tagM2M: Relation = {
  kind: 'm2m',
  fromModel: 'blog.Article',
  toModel: 'blog.Author',
  fieldName: 'contributors',
};

/** (table, column) pairs a Ref line points at, and the columns each table declares. */
function dbmlShape(src: string): { columns: Map<string, Set<string>>; refs: [string, string][] } {
  const columns = new Map<string, Set<string>>();
  let current: string | null = null;
  let inIndexes = false;
  for (const raw of src.split('\n')) {
    const line = raw.trim();
    const table = /^Table "([^"]+)" \{$/.exec(line);
    if (table) {
      current = table[1]!;
      columns.set(current, new Set());
      continue;
    }
    if (line === 'indexes {') {
      inIndexes = true;
      continue;
    }
    if (line === '}') {
      if (inIndexes) inIndexes = false;
      else current = null;
      continue;
    }
    if (!current || inIndexes || line === '' || line.startsWith('//')) continue;
    const col = /^([A-Za-z_]\w*)\s+\S/.exec(line);
    if (col) columns.get(current)!.add(col[1]!);
  }
  const refs: [string, string][] = [];
  for (const m of src.matchAll(/^Ref: "([^"]+)"\."([^"]+)" \S+ "([^"]+)"\."([^"]+)"/gm)) {
    refs.push([m[1]!, m[2]!], [m[3]!, m[4]!]);
  }
  return { columns, refs };
}

describe('generateDBML — relation columns', () => {
  const src = generateDBML([author, article], [authorFk, profileO2O, tagM2M]);

  // The invariant that was silently violated. A Ref to a missing column is a
  // hard parse error, so one bad line invalidates the entire export.
  it('every Ref points at a column its table declares', () => {
    const { columns, refs } = dbmlShape(src);
    for (const [table, column] of refs) {
      expect(columns.get(table), `table ${table}`).toBeDefined();
      expect([...columns.get(table)!], `${table}.${column}`).toContain(column);
    }
    expect(refs.length).toBeGreaterThan(0);
  });

  it('names the FK column the way Django does', () => {
    expect(src).toContain('  author_id integer [not null]');
    expect(src).toContain('Ref: "blog.Article"."author_id" > "blog.Author"."id"');
  });

  it('honours db_column over the _id default', () => {
    const custom: Relation = { ...authorFk, dbColumn: 'writer' };
    const out = generateDBML([author, article], [custom]);
    expect(out).toContain('  writer integer [not null]');
    expect(out).not.toContain('author_id');
  });

  it('makes a OneToOne column unique and respects null=True', () => {
    expect(src).toContain('  reviewer_id integer [unique, null]');
  });

  // M2M lives in a join table; neither side has a column to hang a ref on.
  it('relates the two keys for M2M instead of inventing a column', () => {
    expect(src).not.toContain('contributors_id');
    expect(src).toContain('Ref: "blog.Article"."id" <> "blog.Author"."id"');
  });

  it('carries on_delete as a DBML referential action', () => {
    expect(src).toContain('[delete: cascade]');
    expect(src).toContain('[delete: set null]');
  });

  it('does not redeclare a column the model already spells out', () => {
    const explicit: Model = {
      ...article,
      fields: [...article.fields, { name: 'author_id', fieldType: 'IntegerField' }],
    };
    const out = generateDBML([author, explicit], [authorFk]);
    expect(out.split('\n').filter(l => /^\s+author_id\s/.test(l))).toHaveLength(1);
  });

  it('still emits the FK column when the ref itself cannot be expressed', () => {
    const toComposite: Relation = {
      kind: 'fk',
      fromModel: 'blog.Article',
      toModel: 'core.TenantRow',
      fieldName: 'row',
    };
    const out = generateDBML([article, compositePkModel], [toComposite]);
    expect(out).toContain('  row_id integer');
    expect(out).toContain('composite primary key — ref omitted');
  });

  it('copies the target key type, not always integer', () => {
    const toUuid: Relation = {
      kind: 'fk',
      fromModel: 'blog.Article',
      toModel: 'fleet.Device',
      fieldName: 'device',
    };
    const out = generateDBML([article, uuidPkModel], [toUuid]);
    expect(out).toContain('  device_id uuid [not null]');
  });
});

describe('generateMermaid / generatePlantUML — relation columns', () => {
  it('mermaid lists the FK column and marks it FK', () => {
    const src = generateMermaid([author, article], [authorFk]);
    expect(src).toContain('ForeignKey author_id FK');
  });

  it('mermaid marks a OneToOne column FK and UK', () => {
    const src = generateMermaid([author, article], [profileO2O]);
    expect(src).toContain('OneToOneField reviewer_id FK, UK "nullable"');
  });

  it('mermaid adds no column for M2M — it lives in a join table', () => {
    const src = generateMermaid([author, article], [tagM2M]);
    expect(src).not.toContain('contributors_id');
    expect(src).not.toMatch(/ManyToMany\w* contributors/);
    expect(src).toContain('blog_Article }o--o{ blog_Author : "contributors"');
  });

  it('plantuml uses the documented <<FK>> stereotype', () => {
    const src = generatePlantUML([author, article], [authorFk]);
    expect(src).toContain('* author_id : ForeignKey <<FK>>');
  });

  it('plantuml leaves a nullable FK without the mandatory asterisk', () => {
    const src = generatePlantUML([author, article], [profileO2O]);
    expect(src).toContain('  reviewer_id : OneToOneField <<FK>>');
  });
});
