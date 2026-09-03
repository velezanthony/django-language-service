import { describe, it, expect } from 'vitest';
import { measureScaling } from '../../test-support/scaling';
import {
  buildTimelineSteps,
  buildSnapshots,
  buildMigrationComparisons,
  rebuildSchemaAt,
  computeDiff,
  compareSchemas,
} from './diagram-migrations';
import type { Migration } from '$domain/types/migration';
import type { Model } from '$domain/types/model';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mig0: Migration = {
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

const mig1: Migration = {
  kind: 'migration',
  appLabel: 'blog',
  name: '0002_add_content',
  filePath: 'blog/migrations/0002_add_content.py',
  dependencies: ['blog.0001_initial'],
  operations: [
    { kind: 'AddField', modelName: 'Post', fieldName: 'content' },
    { kind: 'AlterField', modelName: 'Post', fieldName: 'title' },
  ],
};

const mig2: Migration = {
  kind: 'migration',
  appLabel: 'blog',
  name: '0003_rename',
  filePath: 'blog/migrations/0003_rename.py',
  dependencies: ['blog.0002_add_content'],
  operations: [
    { kind: 'RenameField', modelName: 'Post', fieldName: 'content', newName: 'body' },
    { kind: 'RenameModel', modelName: 'Tag', newName: 'Label' },
  ],
};

const mig3: Migration = {
  kind: 'migration',
  appLabel: 'blog',
  name: '0004_remove',
  filePath: 'blog/migrations/0004_remove.py',
  dependencies: ['blog.0003_rename'],
  operations: [
    { kind: 'RemoveField', modelName: 'Post', fieldName: 'title' },
    { kind: 'DeleteModel', modelName: 'Label' },
  ],
};

const migrations = [mig0, mig1, mig2, mig3];

// ── rebuildSchemaAt ───────────────────────────────────────────────────────────

describe('rebuildSchemaAt — migration replay (DGM-010)', () => {
  it('after step 0: creates Post and Tag', () => {
    const schema = rebuildSchemaAt(migrations, 0);
    const names = schema.map(m => m.name).sort();
    expect(names).toEqual(['Post', 'Tag']);
  });

  it('after step 1: Post has "content" field', () => {
    const schema = rebuildSchemaAt(migrations, 1);
    const post = schema.find(m => m.name === 'Post');
    expect(post).toBeDefined();
    expect(post!.fields.some(f => f.name === 'content')).toBe(true);
  });

  it('after step 2: Post has "body" (renamed from "content"); Tag renamed to "Label"', () => {
    const schema = rebuildSchemaAt(migrations, 2);
    const post = schema.find(m => m.name === 'Post');
    expect(post).toBeDefined();
    expect(post!.fields.some(f => f.name === 'body')).toBe(true);
    expect(post!.fields.some(f => f.name === 'content')).toBe(false);
    expect(schema.find(m => m.name === 'Label')).toBeDefined();
    expect(schema.find(m => m.name === 'Tag')).toBeUndefined();
  });

  it('after step 3: Post has no "title" field; Label model deleted', () => {
    const schema = rebuildSchemaAt(migrations, 3);
    const post = schema.find(m => m.name === 'Post');
    expect(post).toBeDefined();
    expect(post!.fields.some(f => f.name === 'title')).toBe(false);
    expect(schema.find(m => m.name === 'Label')).toBeUndefined();
  });

  it('upToIndex beyond length: clamps to last migration', () => {
    const schemaLast = rebuildSchemaAt(migrations, migrations.length - 1);
    const schemaOOB = rebuildSchemaAt(migrations, 999);
    expect(schemaLast.map(m => m.name).sort()).toEqual(schemaOOB.map(m => m.name).sort());
  });

  it('empty migrations returns empty schema', () => {
    expect(rebuildSchemaAt([], 0)).toHaveLength(0);
  });
});

// ── rebuildSchemaAt — homonymous models across apps ───────────────────────────

describe('rebuildSchemaAt — homonymous models across apps (f)', () => {
  // Two apps each define a model named "Comment". The replay Map must be
  // keyed by the QUALIFIED 'appLabel.ModelName' — a bare-name index makes
  // the second CreateModel silently overwrite the first, corrupting the
  // timeline and compare views for interleaved multi-app histories.

  const blogInit: Migration = {
    kind: 'migration',
    appLabel: 'blog',
    name: '0001_initial',
    filePath: 'blog/migrations/0001_initial.py',
    dependencies: [],
    operations: [
      {
        kind: 'CreateModel',
        modelName: 'Comment',
        fields: [{ name: 'text', fieldType: 'TextField', attrs: [] }],
      },
    ],
  };

  const shopInit: Migration = {
    kind: 'migration',
    appLabel: 'shop',
    name: '0001_initial',
    filePath: 'shop/migrations/0001_initial.py',
    dependencies: [],
    operations: [
      {
        kind: 'CreateModel',
        modelName: 'Comment',
        fields: [{ name: 'rating', fieldType: 'IntegerField', attrs: [] }],
      },
    ],
  };

  const shopAddField: Migration = {
    kind: 'migration',
    appLabel: 'shop',
    name: '0002_add_stars',
    filePath: 'shop/migrations/0002_add_stars.py',
    dependencies: ['shop.0001_initial'],
    operations: [
      {
        kind: 'AddField',
        modelName: 'comment',
        fieldName: 'stars',
        fields: [{ name: 'stars', fieldType: 'IntegerField', attrs: [] }],
      },
    ],
  };

  const shopDelete: Migration = {
    kind: 'migration',
    appLabel: 'shop',
    name: '0003_delete_comment',
    filePath: 'shop/migrations/0003_delete_comment.py',
    dependencies: ['shop.0002_add_stars'],
    operations: [{ kind: 'DeleteModel', modelName: 'Comment' }],
  };

  const homonyms = [blogInit, shopInit, shopAddField, shopDelete];

  it('both apps keep their own Comment model after interleaved CreateModel ops', () => {
    const schema = rebuildSchemaAt(homonyms, 1);
    expect(schema).toHaveLength(2);
    const blogComment = schema.find(m => m.name === 'Comment' && m.appLabel === 'blog');
    const shopComment = schema.find(m => m.name === 'Comment' && m.appLabel === 'shop');
    expect(blogComment).toBeDefined();
    expect(shopComment).toBeDefined();
    expect(blogComment!.fields.map(f => f.name)).toEqual(['text']);
    expect(shopComment!.fields.map(f => f.name)).toEqual(['rating']);
  });

  it("AddField only touches the executing migration's app", () => {
    const schema = rebuildSchemaAt(homonyms, 2);
    const blogComment = schema.find(m => m.appLabel === 'blog')!;
    const shopComment = schema.find(m => m.appLabel === 'shop')!;
    expect(shopComment.fields.some(f => f.name === 'stars')).toBe(true);
    expect(blogComment.fields.some(f => f.name === 'stars')).toBe(false);
  });

  it("DeleteModel only deletes the executing migration's app model", () => {
    const schema = rebuildSchemaAt(homonyms, 3);
    expect(schema).toHaveLength(1);
    expect(schema[0]!.appLabel).toBe('blog');
    expect(schema[0]!.name).toBe('Comment');
  });

  it('buildSnapshots keeps both homonymous models with their own appLabels', () => {
    const snaps = buildSnapshots(homonyms);
    const snap1 = snaps[1]!;
    expect(snap1.models).toHaveLength(2);
    const labels = snap1.models.map(m => m.appLabel).sort();
    expect(labels).toEqual(['blog', 'shop']);
  });

  it('RenameModel stays scoped to the executing app', () => {
    const shopRename: Migration = {
      kind: 'migration',
      appLabel: 'shop',
      name: '0002_rename',
      filePath: 'shop/migrations/0002_rename.py',
      dependencies: ['shop.0001_initial'],
      operations: [{ kind: 'RenameModel', modelName: 'Comment', newName: 'Review' }],
    };
    const schema = rebuildSchemaAt([blogInit, shopInit, shopRename], 2);
    expect(schema).toHaveLength(2);
    const blogComment = schema.find(m => m.appLabel === 'blog')!;
    const shopModel = schema.find(m => m.appLabel === 'shop')!;
    expect(blogComment.name).toBe('Comment');
    expect(shopModel.name).toBe('Review');
  });
});

// ── computeDiff ───────────────────────────────────────────────────────────────

describe('computeDiff — step diff (DGM-010)', () => {
  it('step 0: detects 2 addedModels', () => {
    const diff = computeDiff(migrations, 0);
    expect(diff.addedModels).toContain('Post');
    expect(diff.addedModels).toContain('Tag');
  });

  it('step 1: detects AddField and AlterField', () => {
    const diff = computeDiff(migrations, 1);
    expect(diff.addedFields).toEqual(expect.arrayContaining([{ model: 'Post', field: 'content' }]));
    expect(diff.alteredFields).toEqual(expect.arrayContaining([{ model: 'Post', field: 'title' }]));
  });

  it('step 2: detects RenameField and RenameModel', () => {
    const diff = computeDiff(migrations, 2);
    expect(diff.renamedFields).toEqual(
      expect.arrayContaining([{ model: 'Post', from: 'content', to: 'body' }]),
    );
    expect(diff.renamedModels).toEqual(expect.arrayContaining([{ from: 'Tag', to: 'Label' }]));
  });

  it('step 3: detects RemoveField and DeleteModel', () => {
    const diff = computeDiff(migrations, 3);
    expect(diff.removedFields).toEqual(expect.arrayContaining([{ model: 'Post', field: 'title' }]));
    expect(diff.removedModels).toContain('Label');
  });

  it('returns empty diff for out-of-range index', () => {
    const diff = computeDiff(migrations, -1);
    expect(diff.addedModels).toHaveLength(0);
    expect(diff.removedModels).toHaveLength(0);
  });
});

// ── buildTimelineSteps ────────────────────────────────────────────────────────

describe('buildTimelineSteps — (DGM-010)', () => {
  const steps = buildTimelineSteps(migrations);

  it('returns one step per migration', () => {
    expect(steps).toHaveLength(migrations.length);
  });

  it('step 0: name, appLabel, isInitial', () => {
    expect(steps[0]!.name).toBe('0001_initial');
    expect(steps[0]!.appLabel).toBe('blog');
    expect(steps[0]!.isInitial).toBe(true);
  });

  it('subsequent steps are not initial', () => {
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]!.isInitial).toBe(false);
    }
  });

  it('opSummary includes human-readable lines', () => {
    expect(steps[0]!.opSummary).toContain('+ Post');
    expect(steps[1]!.opSummary).toContain('+ Post.content');
    expect(steps[3]!.opSummary).toContain('- Post.title');
  });

  it('diff is populated correctly for step 1', () => {
    expect(steps[1]!.diff.addedFields).toContainEqual({ model: 'Post', field: 'content' });
  });

  it('returns empty array for no migrations', () => {
    expect(buildTimelineSteps([])).toHaveLength(0);
  });
});

// ── buildSnapshots ────────────────────────────────────────────────────────────

describe('buildSnapshots — (DGM-011)', () => {
  const snapshots = buildSnapshots(migrations);

  it('returns one snapshot per migration', () => {
    expect(snapshots).toHaveLength(migrations.length);
  });

  it('snapshot 0 contains Post and Tag', () => {
    const modelNames = snapshots[0]!.models.map(m => m.name);
    expect(modelNames).toContain('Post');
    expect(modelNames).toContain('Tag');
  });

  it('snapshot models have name, appLabel, fields', () => {
    const post = snapshots[1]!.models.find(m => m.name === 'Post')!;
    expect(post).toBeDefined();
    expect(post.appLabel).toBe('blog');
    expect(typeof post.fieldCount).toBe('number');
    expect(Array.isArray(post.fields)).toBe(true);
  });
});

// ── compareSchemas ────────────────────────────────────────────────────────────

describe('compareSchemas — (DGM-011)', () => {
  const currentModels: readonly Model[] = [
    {
      kind: 'model',
      name: 'Post',
      appLabel: 'blog',
      filePath: 'blog/models.py',
      line: 1,
      fields: [
        { name: 'title', fieldType: 'CharField' },
        { name: 'body', fieldType: 'TextField' }, // new vs snapshot
      ],
      relations: [],
      properties: [],
    },
    // Tag was removed (not in current)
  ];

  const snapshotStep1 = rebuildSchemaAt(migrations, 1);

  it('detects added field "body" vs snapshot', () => {
    const cmp = compareSchemas(currentModels, snapshotStep1);
    const postDiff = cmp.changedModels.find(m => m.key === 'blog.Post');
    expect(postDiff).toBeDefined();
    expect(postDiff!.added).toContain('body');
  });

  it('detects removed model "Tag" (present in snapshot, absent in current)', () => {
    const cmp = compareSchemas(currentModels, snapshotStep1);
    expect(cmp.removedModels).toContain('blog.Tag');
  });

  it('unchanged models are listed', () => {
    // Same current and snapshot → all models unchanged
    const snapshot0 = rebuildSchemaAt(migrations, 0);
    const current: readonly Model[] = snapshot0.map(sm => ({
      kind: 'model' as const,
      name: sm.name,
      appLabel: sm.appLabel,
      filePath: '',
      line: 1,
      fields: sm.fields.map(f => ({ name: f.name, fieldType: f.fieldType })),
      relations: [],
      properties: [],
    }));
    const cmp = compareSchemas(current, snapshot0);
    expect(cmp.changedModels).toHaveLength(0);
    expect(cmp.addedModels).toHaveLength(0);
    expect(cmp.removedModels).toHaveLength(0);
    expect(cmp.unchangedModels.length).toBeGreaterThanOrEqual(2);
  });
});

// ── buildMigrationComparisons ─────────────────────────────────────────────────

describe('buildMigrationComparisons — (DGM-011)', () => {
  const currentModels: readonly Model[] = [
    {
      kind: 'model',
      name: 'Post',
      appLabel: 'blog',
      filePath: 'blog/models.py',
      line: 1,
      fields: [{ name: 'body', fieldType: 'TextField' }],
      relations: [],
      properties: [],
    },
  ];

  const comparisons = buildMigrationComparisons(liveModels, migrations);

  it('returns one entry per migration', () => {
    expect(comparisons).toHaveLength(migrations.length);
  });

  it('each entry has migrationIdx, migrationName, appLabel, comparison', () => {
    const entry = comparisons[0]!;
    expect(entry.migrationIdx).toBe(0);
    expect(entry.migrationName).toBe('0001_initial');
    expect(entry.appLabel).toBe('blog');
    expect(entry.comparison).toBeDefined();
    expect(Array.isArray(entry.comparison.addedModels)).toBe(true);
  });

  it('returns empty array for no migrations', () => {
    expect(buildMigrationComparisons(currentModels, [])).toHaveLength(0);
  });
});

// ── Replaying the history once, not once per step ────────────────────────────

const liveModels: readonly Model[] = [
  {
    kind: 'model',
    name: 'Post',
    appLabel: 'blog',
    filePath: 'blog/models.py',
    line: 1,
    fields: [
      { name: 'title', fieldType: 'CharField' },
      { name: 'body', fieldType: 'TextField' },
    ],
    relations: [],
    properties: [],
  },
];

/**
 * A history `size` migrations long whose SCHEMA stays a constant size: each
 * step adds a field and the next removes it.
 *
 * That shape is deliberate. Total snapshot output is `sum of |schema at i|`,
 * so a history that only ever grows has quadratic OUTPUT no matter how it is
 * computed — measuring that would measure the size of the answer, not the way
 * we reach it. Holding the schema flat isolates the replay, which is the part
 * that was quadratic by construction: `rebuildSchemaAt` replays 0..idx, and it
 * was called once per migration, twice over.
 */
const longHistory = (size: number): Migration[] => {
  const out: Migration[] = [
    {
      kind: 'migration',
      appLabel: 'blog',
      name: '0001_initial',
      filePath: 'blog/migrations/0001_initial.py',
      dependencies: [],
      operations: [{ kind: 'CreateModel', modelName: 'Post' }],
    },
  ];
  for (let i = 1; i < size; i++) {
    out.push({
      kind: 'migration',
      appLabel: 'blog',
      name: `${String(i + 1).padStart(4, '0')}_step${i}`,
      filePath: `blog/migrations/${i}.py`,
      dependencies: [],
      operations: [
        i % 2 === 1
          ? { kind: 'AddField', modelName: 'Post', fieldName: 'scratch' }
          : { kind: 'RemoveField', modelName: 'Post', fieldName: 'scratch' },
      ],
    });
  }
  return out;
};

describe('buildSnapshots — one replay, not one per migration', () => {
  // `rebuildSchemaAt(migrations, idx)` replays operations 0..idx, and both
  // builders called it once per migration: 2 x O(M²) replays, plus a full
  // schema snapshot per migration materialised into the initial webview HTML.
  // On a real project's migration history that froze the extension host.
  // The fold must be indistinguishable from the old per-index rebuild.
  it('agrees with rebuildSchemaAt at every index', () => {
    const migrations = [mig0, mig1, mig2, mig3];
    const snapshots = buildSnapshots(migrations);

    expect(snapshots).toHaveLength(migrations.length);
    migrations.forEach((_, idx) => {
      const expected = rebuildSchemaAt(migrations, idx);
      expect(snapshots[idx]!.models.map(m => m.name).sort()).toEqual(
        expected.map(m => m.name).sort(),
      );
      expect(snapshots[idx]!.models.map(m => m.fieldCount).reduce((a, b) => a + b, 0)).toBe(
        expected.reduce((a, m) => a + m.fields.length, 0),
      );
    });
  });

  it('gives each step its own snapshot, unaffected by later steps', () => {
    const snapshots = buildSnapshots([mig0, mig1, mig2, mig3]);
    // Tag exists at 0001 and is deleted (as Label) by 0004.
    expect(snapshots[0]!.models.map(m => m.name)).toContain('Tag');
    expect(snapshots[3]!.models.map(m => m.name)).not.toContain('Tag');
    expect(snapshots[3]!.models.map(m => m.name)).not.toContain('Label');
  });

  it('scales linearly with the length of the history', () => {
    const { ratio } = measureScaling({
      prepare: size => longHistory(size),
      run: migrations => {
        buildSnapshots(migrations);
      },
      size: 60,
    });
    expect(ratio).toBeLessThan(2.5);
  });
});

describe('buildMigrationComparisons — same replay', () => {
  it('agrees with the per-index rebuild', () => {
    const migrations = [mig0, mig1, mig2, mig3];
    const entries = buildMigrationComparisons(liveModels, migrations);

    expect(entries).toHaveLength(migrations.length);
    migrations.forEach((mig, idx) => {
      expect(entries[idx]!.migrationIdx).toBe(idx);
      expect(entries[idx]!.migrationName).toBe(mig.name);
      expect(entries[idx]!.comparison).toEqual(
        compareSchemas(liveModels, rebuildSchemaAt(migrations, idx)),
      );
    });
  });

  it('scales linearly with the length of the history', () => {
    const { ratio } = measureScaling({
      prepare: size => longHistory(size),
      run: migrations => {
        buildMigrationComparisons(liveModels, migrations);
      },
      size: 60,
    });
    expect(ratio).toBeLessThan(2.5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A model whose name has more than one word.
//
// Django writes `model_name='blogpost'` — the class name lowercased, with no
// separator — while `CreateModel` carries `name='BlogPost'`. The lookup tried
// to reconstruct the capitalisation by upper-casing the first letter, which
// gives `Blogpost` and matches nothing. So EVERY field operation on a
// multi-word model was silently discarded: the replayed schema was missing
// columns the project really has, and compare mode reported a fully-migrated
// project as drifted.
//
// The capitalisation cannot be reconstructed — `blogpost` could be `BlogPost`,
// `Blogpost` or `BLOGPost` — so it is not guessed. The comparison is made
// case-insensitively, which is exactly what Django's own lowercasing means.
// ─────────────────────────────────────────────────────────────────────────────
describe('field operations on a multi-word model name', () => {
  const history = (createName: string, opName: string): Migration[] => [
    {
      kind: 'migration',
      appLabel: 'blog',
      name: '0001_initial',
      filePath: 'blog/migrations/0001_initial.py',
      dependencies: [],
      operations: [{ kind: 'CreateModel', modelName: createName }],
    },
    {
      kind: 'migration',
      appLabel: 'blog',
      name: '0002_body',
      filePath: 'blog/migrations/0002_body.py',
      dependencies: ['blog.0001_initial'],
      operations: [{ kind: 'AddField', modelName: opName, fieldName: 'body' }],
    },
  ];

  const fieldsAfterReplay = (createName: string, opName: string): string[] => {
    const snaps = buildSnapshots(history(createName, opName));
    const model = snaps[snaps.length - 1]!.models.find(m => m.name === createName);
    return (model?.fields ?? []).map(f => f.name);
  };

  it.each([
    ['Post', 'post'],
    ['BlogPost', 'blogpost'],
    ['UserProfileSetting', 'userprofilesetting'],
    ['APIKey', 'apikey'],
  ])('%s reached by model_name=%s keeps its added field', (createName, opName) => {
    expect(fieldsAfterReplay(createName, opName)).toContain('body');
  });

  it('does not reach a model of another name', () => {
    expect(fieldsAfterReplay('BlogPost', 'comment')).not.toContain('body');
  });

  it('does not confuse two models whose names differ only in case position', () => {
    const migs: Migration[] = [
      {
        kind: 'migration',
        appLabel: 'blog',
        name: '0001_initial',
        filePath: 'blog/migrations/0001_initial.py',
        dependencies: [],
        operations: [
          { kind: 'CreateModel', modelName: 'BlogPost' },
          { kind: 'CreateModel', modelName: 'Comment' },
        ],
      },
      {
        kind: 'migration',
        appLabel: 'blog',
        name: '0002_body',
        filePath: 'blog/migrations/0002_body.py',
        dependencies: ['blog.0001_initial'],
        operations: [{ kind: 'AddField', modelName: 'blogpost', fieldName: 'body' }],
      },
    ];
    const snaps = buildSnapshots(migs);
    const last = snaps[snaps.length - 1]!;
    expect(last.models.find(m => m.name === 'BlogPost')!.fields.map(f => f.name)).toContain('body');
    expect(last.models.find(m => m.name === 'Comment')!.fields.map(f => f.name)).not.toContain(
      'body',
    );
  });
});
