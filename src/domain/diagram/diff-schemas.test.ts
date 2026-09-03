import { describe, it, expect } from 'vitest';
import { diffSchemas } from './diagram-migrations';

// A.1.4 — one generic engine that diffs ANY two schemas (before → after).
// It powers the unified history "compare vs" selector: prev step, current
// state, or another node are all just (before, after) pairs.

type F = [string, string];
function model(appLabel: string, name: string, fields: F[] = []) {
  return { appLabel, name, fields: fields.map(([n, t]) => ({ name: n, fieldType: t })) };
}

describe('diffSchemas(before, after)', () => {
  it('flags models present only in after as added', () => {
    const d = diffSchemas(
      [model('blog', 'Post', [['title', 'CharField']])],
      [
        model('blog', 'Post', [['title', 'CharField']]),
        model('blog', 'Tag', [['name', 'CharField']]),
      ],
    );
    expect(d.addedModels).toContain('blog.Tag');
    expect(d.unchangedModels).toContain('blog.Post');
  });

  it('flags models present only in before as removed', () => {
    const d = diffSchemas([model('blog', 'Old')], []);
    expect(d.removedModels).toContain('blog.Old');
  });

  it('reports added / removed / altered scalar fields', () => {
    const before = [
      model('blog', 'Post', [
        ['title', 'CharField'],
        ['slug', 'SlugField'],
      ]),
    ];
    const after = [
      model('blog', 'Post', [
        ['title', 'TextField'],
        ['body', 'TextField'],
      ]),
    ];
    const changed = diffSchemas(before, after).changedModels.find(m => m.key === 'blog.Post');
    expect(changed?.added).toContain('body');
    expect(changed?.removed).toContain('slug');
    expect(changed?.altered).toContain('title');
  });

  it('is direction-sensitive (before/after swap inverts add/remove)', () => {
    const a = [model('blog', 'A')];
    const b = [model('blog', 'A'), model('blog', 'B')];
    expect(diffSchemas(a, b).addedModels).toContain('blog.B');
    expect(diffSchemas(b, a).removedModels).toContain('blog.B');
  });

  it('ignores relation fields in the scalar field diff', () => {
    const before = [model('blog', 'Post', [['title', 'CharField']])];
    const after = [
      model('blog', 'Post', [
        ['title', 'CharField'],
        ['author', 'ForeignKey'],
      ]),
    ];
    // author is a relation → not counted as a scalar field change → unchanged
    expect(diffSchemas(before, after).unchangedModels).toContain('blog.Post');
  });
});
