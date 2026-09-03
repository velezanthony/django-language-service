import { describe, it, expect } from 'vitest';
import { buildDiagramPayload } from './diagram-serializer';
import type { Model } from '$domain/types/model';
import type { Relation } from '$domain/types/relation';
import type { Migration } from '$domain/types/migration';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const postModel: Model = {
  kind: 'model',
  name: 'Post',
  appLabel: 'blog',
  filePath: 'blog/models.py',
  line: 5,
  fields: [
    { name: 'title', fieldType: 'CharField', maxLength: 200 },
    { name: 'content', fieldType: 'TextField', isNull: true, isBlank: true },
  ],
  relations: [
    {
      kind: 'fk',
      fromModel: 'blog.Post',
      toModel: 'blog.Tag',
      fieldName: 'tag',
      onDelete: 'CASCADE',
    },
  ],
  properties: [{ name: 'slug', source: '@property\ndef slug(self): ...' }],
  meta: { dbTable: 'blog_post', verboseName: 'post' },
};

const tagModel: Model = {
  kind: 'model',
  name: 'Tag',
  appLabel: 'blog',
  filePath: 'blog/models.py',
  line: 25,
  fields: [{ name: 'name', fieldType: 'CharField', maxLength: 50 }],
  relations: [],
  properties: [],
};

const orphanModel: Model = {
  kind: 'model',
  name: 'Orphan',
  appLabel: 'blog',
  filePath: 'blog/models.py',
  line: 40,
  fields: [{ name: 'note', fieldType: 'TextField' }],
  relations: [],
  properties: [],
};

const allRelations: readonly Relation[] = [
  {
    kind: 'fk',
    fromModel: 'blog.Post',
    toModel: 'blog.Tag',
    fieldName: 'tag',
    onDelete: 'CASCADE',
  },
];

const migration0: Migration = {
  kind: 'migration',
  appLabel: 'blog',
  name: '0001_initial',
  filePath: 'blog/migrations/0001_initial.py',
  dependencies: [],
  operations: [
    { kind: 'CreateModel', modelName: 'Post' },
    { kind: 'CreateModel', modelName: 'Tag' },
  ],
};

const models: readonly Model[] = [postModel, tagModel, orphanModel];
const migrations: readonly Migration[] = [migration0];

// ── buildDiagramPayload ────────────────────────────────────────────────────────

describe('buildDiagramPayload — payload shape', () => {
  const payload = buildDiagramPayload(models, allRelations, migrations);

  it('tooltipData has one entry per model', () => {
    expect(payload.tooltipData).toHaveLength(3);
  });

  it('modelKeys matches model keys', () => {
    expect(payload.modelKeys).toContain('blog.Post');
    expect(payload.modelKeys).toContain('blog.Tag');
    expect(payload.modelKeys).toContain('blog.Orphan');
  });

  it('appLabels contains "blog"', () => {
    expect(payload.appLabels).toContain('blog');
  });

  it('relations list contains the FK relation', () => {
    expect(payload.relations).toHaveLength(1);
    expect(payload.relations[0]).toMatchObject({
      from: 'blog.Post',
      to: 'blog.Tag',
      fieldName: 'tag',
      type: 'FK',
      onDelete: 'CASCADE',
    });
  });

  it('mermaidSrc starts with "erDiagram"', () => {
    expect(payload.mermaidSrc).toMatch(/^erDiagram/);
  });

  it('dbmlSrc contains Table blocks', () => {
    expect(payload.dbmlSrc).toContain('Table "blog.Post"');
    expect(payload.dbmlSrc).toContain('Table "blog.Tag"');
  });

  it('plantUmlSrc starts with @startuml', () => {
    expect(payload.plantUmlSrc).toMatch(/^@startuml/);
  });

  it('timelineSteps has one step per migration', () => {
    expect(payload.timelineSteps).toHaveLength(1);
  });

  it('snapshots has one snapshot per migration', () => {
    expect(payload.snapshots).toHaveLength(1);
  });

  it('migrationComparisons has one entry per migration', () => {
    expect(payload.migrationComparisons).toHaveLength(1);
  });
});

describe('buildDiagramPayload — BoxRecord fields', () => {
  const payload = buildDiagramPayload(models, allRelations, migrations);
  const post = payload.tooltipData.find(b => b.key === 'blog.Post')!;
  const tag = payload.tooltipData.find(b => b.key === 'blog.Tag')!;
  const orphan = payload.tooltipData.find(b => b.key === 'blog.Orphan')!;

  it('key is "app.Model"', () => {
    expect(post.key).toBe('blog.Post');
  });

  it('dbTable from meta.dbTable', () => {
    expect(post.dbTable).toBe('blog_post');
  });

  it('dbTable derived when meta absent', () => {
    // Tag has no meta → derived as "blog_tag"
    expect(tag.dbTable).toBe('blog_tag');
  });

  it('verboseName from meta', () => {
    expect(post.verboseName).toBe('post');
  });

  it('properties populated', () => {
    expect(post.properties.map(p => p.name)).toContain('slug');
  });

  it('fieldCount equals total fields on model', () => {
    expect(post.fieldCount).toBe(2); // title + content
  });

  it('fields list excludes relation field types', () => {
    // All of post.fields should be scalar types
    for (const f of post.fields) {
      expect(['ForeignKey', 'OneToOneField', 'ManyToManyField']).not.toContain(f.type);
    }
  });

  it('relations list inside BoxRecord contains the fk entry', () => {
    expect(post.relations).toHaveLength(1);
    expect(post.relations[0]).toMatchObject({ name: 'tag', type: 'FK', target: 'blog.Tag' });
  });

  it('referencedBy on tag contains Post.tag', () => {
    expect(tag.referencedBy).toHaveLength(1);
    expect(tag.referencedBy[0]).toMatchObject({ from: 'blog.Post', fieldName: 'tag', type: 'FK' });
  });

  it('incomingCount matches referencedBy length', () => {
    expect(tag.incomingCount).toBe(1);
    expect(post.incomingCount).toBe(0);
  });

  it('isOrphan is true for isolated model', () => {
    expect(orphan.isOrphan).toBe(true);
  });

  it('isOrphan is false for connected models', () => {
    expect(post.isOrphan).toBe(false);
    expect(tag.isOrphan).toBe(false);
  });

  it('hubTier is ≥ 0', () => {
    expect(tag.hubTier).toBeGreaterThanOrEqual(0);
  });

  it('searchModel is lowercase and includes model name', () => {
    expect(post.searchModel).toContain('post');
  });

  it('searchModel includes the appLabel.Name key so dropdown picks match', () => {
    // The results dropdown sets the query to "appLabel.Name" when a model
    // suggestion is picked; searchModel must contain that form or selecting
    // a model filters every box out (including the picked one).
    expect(post.searchModel).toContain('blog.post');
  });

  it('searchFields is lowercase and includes field names', () => {
    expect(post.searchFields).toContain('title');
    expect(post.searchFields).toContain('content');
  });

  it('searchRelations includes relation target', () => {
    expect(post.searchRelations).toContain('blog.tag');
  });

  it('isAbstract defaults to false', () => {
    expect(post.isAbstract).toBe(false);
    expect(tag.isAbstract).toBe(false);
  });

  it('isProxy defaults to false', () => {
    expect(post.isProxy).toBe(false);
  });

  it('isInCycle defaults to false for non-cyclic graph', () => {
    expect(post.isInCycle).toBe(false);
    expect(tag.isInCycle).toBe(false);
  });
});

describe('buildDiagramPayload — cycle detection', () => {
  it('marks models as isInCycle when a cycle exists', () => {
    const a: Model = {
      kind: 'model',
      name: 'A',
      appLabel: 'app',
      filePath: '',
      line: 1,
      fields: [],
      relations: [{ kind: 'fk', fromModel: 'app.A', toModel: 'app.B', fieldName: 'b_ref' }],
      properties: [],
    };
    const b: Model = {
      kind: 'model',
      name: 'B',
      appLabel: 'app',
      filePath: '',
      line: 1,
      fields: [],
      relations: [{ kind: 'fk', fromModel: 'app.B', toModel: 'app.A', fieldName: 'a_ref' }],
      properties: [],
    };
    const rels: readonly Relation[] = [
      { kind: 'fk', fromModel: 'app.A', toModel: 'app.B', fieldName: 'b_ref' },
      { kind: 'fk', fromModel: 'app.B', toModel: 'app.A', fieldName: 'a_ref' },
    ];
    const payload = buildDiagramPayload([a, b], rels, []);
    const boxA = payload.tooltipData.find(bx => bx.key === 'app.A')!;
    const boxB = payload.tooltipData.find(bx => bx.key === 'app.B')!;
    expect(boxA.isInCycle).toBe(true);
    expect(boxB.isInCycle).toBe(true);
  });
});

describe('buildDiagramPayload — relation target resolution (bare / self / cross-app)', () => {
  // The model parser emits `toModel` RAW as captured by RELATED_MODEL_RE:
  // same-app refs come through bare ('Category') and self-FKs come through
  // as the literal 'self'. The serializer must resolve those to qualified
  // 'app.Model' keys BEFORE filtering, or the most common case (intra-app FK)
  // silently disappears from the diagram.

  function mkModel(appLabel: string, name: string, relations: Relation[]): Model {
    return {
      kind: 'model',
      name,
      appLabel,
      filePath: `${appLabel}/models.py`,
      line: 1,
      fields: [{ name: 'title', fieldType: 'CharField' }],
      relations,
      properties: [],
    };
  }

  it('(a) intra-app FK with bare toModel survives filtering and feeds incoming/outgoing', () => {
    const post = mkModel('blog', 'Post', [
      {
        kind: 'fk',
        fromModel: 'blog.Post',
        toModel: 'Category',
        fieldName: 'category',
        onDelete: 'CASCADE',
      },
    ]);
    const category = mkModel('blog', 'Category', []);
    const rels = post.relations;

    const payload = buildDiagramPayload([post, category], rels, []);

    expect(payload.relations).toHaveLength(1);
    expect(payload.relations[0]).toMatchObject({
      from: 'blog.Post',
      to: 'blog.Category',
      fieldName: 'category',
      type: 'FK',
    });

    const catBox = payload.tooltipData.find(b => b.key === 'blog.Category')!;
    expect(catBox.referencedBy).toContainEqual({
      from: 'blog.Post',
      fieldName: 'category',
      type: 'FK',
    });
    expect(catBox.incomingCount).toBe(1);

    // Neither endpoint is an orphan once the relation resolves.
    const postBox = payload.tooltipData.find(b => b.key === 'blog.Post')!;
    expect(postBox.isOrphan).toBe(false);
    expect(catBox.isOrphan).toBe(false);
  });

  it('(a2) BoxRecord.relations target and searchRelations use the resolved key', () => {
    const post = mkModel('blog', 'Post', [
      { kind: 'fk', fromModel: 'blog.Post', toModel: 'Category', fieldName: 'category' },
    ]);
    const category = mkModel('blog', 'Category', []);
    const payload = buildDiagramPayload([post, category], post.relations, []);

    const postBox = payload.tooltipData.find(b => b.key === 'blog.Post')!;
    expect(postBox.relations[0]).toMatchObject({
      name: 'category',
      type: 'FK',
      target: 'blog.Category',
    });
    expect(postBox.searchRelations).toContain('blog.category');
  });

  it("(b) 'self' resolves to the owner's own key", () => {
    const employee = mkModel('hr', 'Employee', [
      {
        kind: 'fk',
        fromModel: 'hr.Employee',
        toModel: 'self',
        fieldName: 'manager',
        onDelete: 'SET_NULL',
      },
    ]);
    const payload = buildDiagramPayload([employee], employee.relations, []);

    expect(payload.relations).toHaveLength(1);
    expect(payload.relations[0]).toMatchObject({
      from: 'hr.Employee',
      to: 'hr.Employee',
      fieldName: 'manager',
    });

    const box = payload.tooltipData.find(b => b.key === 'hr.Employee')!;
    expect(box.referencedBy).toContainEqual({
      from: 'hr.Employee',
      fieldName: 'manager',
      type: 'FK',
    });
  });

  it('(c) already-qualified cross-app toModel keeps working untouched', () => {
    const order = mkModel('shop', 'Order', [
      { kind: 'fk', fromModel: 'shop.Order', toModel: 'blog.Post', fieldName: 'post' },
    ]);
    const post = mkModel('blog', 'Post', []);
    const payload = buildDiagramPayload([order, post], order.relations, []);

    expect(payload.relations).toHaveLength(1);
    expect(payload.relations[0]).toMatchObject({ from: 'shop.Order', to: 'blog.Post' });
  });

  it('(d) ambiguous bare name across two apps prefers the same-app model', () => {
    const article = mkModel('blog', 'Article', [
      { kind: 'fk', fromModel: 'blog.Article', toModel: 'Comment', fieldName: 'top_comment' },
    ]);
    const blogComment = mkModel('blog', 'Comment', []);
    const shopComment = mkModel('shop', 'Comment', []);
    const payload = buildDiagramPayload([article, blogComment, shopComment], article.relations, []);

    expect(payload.relations).toHaveLength(1);
    expect(payload.relations[0]).toMatchObject({ from: 'blog.Article', to: 'blog.Comment' });

    const shopBox = payload.tooltipData.find(b => b.key === 'shop.Comment')!;
    expect(shopBox.incomingCount).toBe(0);
  });

  it('(d2) bare name with no same-app match falls back to the first known candidate', () => {
    const article = mkModel('blog', 'Article', [
      { kind: 'fk', fromModel: 'blog.Article', toModel: 'Profile', fieldName: 'author_profile' },
    ]);
    const profile = mkModel('accounts', 'Profile', []);
    const payload = buildDiagramPayload([article, profile], article.relations, []);

    expect(payload.relations).toHaveLength(1);
    expect(payload.relations[0]).toMatchObject({ from: 'blog.Article', to: 'accounts.Profile' });
  });

  it('(e) reference to a model outside the project is still filtered out', () => {
    const post = mkModel('blog', 'Post', [
      { kind: 'fk', fromModel: 'blog.Post', toModel: 'User', fieldName: 'author' },
    ]);
    const payload = buildDiagramPayload([post], post.relations, []);

    // No edge to draw — the other end is not in the diagram.
    expect(payload.relations).toHaveLength(0);
    // But the model is NOT isolated: it declares a relation. Calling this an
    // orphan dimmed every Profile hanging off settings.AUTH_USER_MODEL.
    const box = payload.tooltipData.find(b => b.key === 'blog.Post')!;
    expect(box.isOrphan).toBe(false);
  });
});

describe('buildDiagramPayload — empty project', () => {
  const payload = buildDiagramPayload([], [], []);

  it('returns empty collections for empty project', () => {
    expect(payload.tooltipData).toHaveLength(0);
    expect(payload.relations).toHaveLength(0);
    expect(payload.modelKeys).toHaveLength(0);
    expect(payload.appLabels).toHaveLength(0);
    expect(payload.timelineSteps).toHaveLength(0);
    expect(payload.snapshots).toHaveLength(0);
    expect(payload.migrationComparisons).toHaveLength(0);
  });

  it('export strings are non-empty (minimal placeholders)', () => {
    expect(payload.mermaidSrc).toBeTruthy();
    expect(payload.dbmlSrc).toBeTruthy();
    expect(payload.plantUmlSrc).toBeTruthy();
  });
});

// Django resolves a lazy model reference case-insensitively: `'blog.post'`,
// `'blog.Post'` and a bare `'post'` all name the same model. The migration
// replay already knows this (diagram-migrations `findModelKey`); the payload
// builder compared the raw string against keys that are always `App.Model`, so
// a lowercase reference matched nothing, failed the both-endpoints filter, and
// the edge left the diagram. Same reference, two readers, two answers.
describe('buildDiagramPayload — a model reference is matched case-insensitively', () => {
  function mkModel(appLabel: string, name: string, relations: Relation[]): Model {
    return {
      kind: 'model',
      name,
      appLabel,
      filePath: `${appLabel}/models.py`,
      line: 1,
      fields: [{ name: 'title', fieldType: 'CharField' }],
      relations,
      properties: [],
    };
  }

  const spellings: ReadonlyArray<{ what: string; toModel: string }> = [
    { what: 'qualified, exact', toModel: 'blog.Post' },
    { what: 'qualified, all lowercase', toModel: 'blog.post' },
    { what: 'qualified, odd case', toModel: 'Blog.POST' },
    { what: 'bare, exact', toModel: 'Post' },
    { what: 'bare, lowercase', toModel: 'post' },
  ];

  for (const { what, toModel } of spellings) {
    it(`keeps the edge when the reference is written ${what}`, () => {
      const comment = mkModel('blog', 'Comment', [
        { kind: 'fk', fromModel: 'blog.Comment', toModel, fieldName: 'post' },
      ]);
      const post = mkModel('blog', 'Post', []);
      const payload = buildDiagramPayload([comment, post], comment.relations, []);

      expect(payload.relations).toEqual([
        { from: 'blog.Comment', to: 'blog.Post', fieldName: 'post', type: 'FK' },
      ]);
      expect(payload.tooltipData.find(b => b.key === 'blog.Post')!.incomingCount).toBe(1);
    });
  }

  it('leaves a reference no model answers alone, so it is still filtered out', () => {
    const profile = mkModel('accounts', 'Profile', [
      { kind: 'o2o', fromModel: 'accounts.Profile', toModel: 'auth.user', fieldName: 'user' },
    ]);
    const payload = buildDiagramPayload([profile], profile.relations, []);
    expect(payload.relations).toEqual([]);
  });
});
