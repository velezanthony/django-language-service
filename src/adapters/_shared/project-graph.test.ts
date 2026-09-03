import { describe, it, expect } from 'vitest';
import { graphFor } from './project-graph';
import { IndexImpl } from '$infra/index-impl';
import type { Project } from '$infra/types/project';
import type { Model } from '$domain/types/model';

function mkProject(models: Model[]): Project {
  const modelIndex = new IndexImpl<Model, string>(m => `${m.appLabel}.${m.name}`);
  for (const m of models) modelIndex.add(m);
  return {
    models: modelIndex,
    // Only `models` is consulted by graphFor — the rest can be stubs.
    views: new IndexImpl<never, string>(() => ''),
    forms: new IndexImpl<never, string>(() => ''),
    migrations: new IndexImpl<never, string>(() => ''),
    templates: new IndexImpl<never, string>(() => ''),
    urls: new IndexImpl<never, string>(() => ''),
    helpers: new IndexImpl<never, string>(() => ''),
    workspaceFingerprint: 'x',
    scannedAt: 0,
  } as unknown as Project;
}

const POST: Model = {
  kind: 'model',
  name: 'Post',
  appLabel: 'blog',
  filePath: 'apps/blog/models.py',
  line: 1,
  fields: [{ name: 'title', fieldType: 'CharField' }],
  relations: [],
  properties: [],
};

describe('graphFor — per-snapshot memoization', () => {
  it('builds a graph that resolves the project models', () => {
    const project = mkProject([POST]);
    expect(graphFor(project).resolveModel('Post')?.name).toBe('Post');
  });

  it('returns the SAME graph instance for the same snapshot', () => {
    const project = mkProject([POST]);
    expect(graphFor(project)).toBe(graphFor(project));
  });

  it('returns a NEW graph for a new snapshot', () => {
    const a = mkProject([POST]);
    const b = mkProject([POST]);
    expect(graphFor(a)).not.toBe(graphFor(b));
  });
});
