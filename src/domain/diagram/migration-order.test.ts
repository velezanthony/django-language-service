import { describe, it, expect } from 'vitest';
import { orderMigrations, buildTimelineSteps } from './diagram-migrations';
import type { Migration } from '$domain/types/migration';

// A.1.3 — migrations form a DAG (a node can depend on several others = a merge).
// orderMigrations returns a stable topological order = the real chronological
// order Django would apply them, used by the timeline/history graph.

function mig(appLabel: string, name: string, deps: string[] = []): Migration {
  return {
    kind: 'migration',
    appLabel,
    name,
    filePath: `${appLabel}/migrations/${name}.py`,
    dependencies: deps,
    operations: [],
  };
}
const keys = (ms: readonly Migration[]): string[] => ms.map(m => `${m.appLabel}.${m.name}`);

describe('orderMigrations — topological (chronological) order', () => {
  it('orders by dependency within an app regardless of input order', () => {
    const out = orderMigrations([mig('blog', '0002', ['blog.0001']), mig('blog', '0001')]);
    expect(keys(out)).toEqual(['blog.0001', 'blog.0002']);
  });

  it('respects cross-app dependencies', () => {
    const out = orderMigrations([mig('blog', '0001', ['shop.0001']), mig('shop', '0001')]);
    expect(keys(out)).toEqual(['shop.0001', 'blog.0001']);
  });

  it('places a node AFTER all its deps (merge with multiple parents)', () => {
    const out = orderMigrations([
      mig('blog', '0002', ['blog.0001', 'shop.0001']),
      mig('blog', '0001'),
      mig('shop', '0001'),
    ]);
    const k = keys(out);
    expect(k.indexOf('blog.0002')).toBeGreaterThan(k.indexOf('blog.0001'));
    expect(k.indexOf('blog.0002')).toBeGreaterThan(k.indexOf('shop.0001'));
  });

  it('breaks ties deterministically by (app, name)', () => {
    const out = orderMigrations([mig('shop', '0001'), mig('blog', '0001')]);
    expect(keys(out)).toEqual(['blog.0001', 'shop.0001']);
  });

  it('ignores external deps (apps not in the scanned set)', () => {
    const out = orderMigrations([mig('blog', '0001', ['auth.0001'])]);
    expect(keys(out)).toEqual(['blog.0001']);
  });

  it('does not hang on a dependency cycle and still emits every node', () => {
    const out = orderMigrations([mig('a', '1', ['b.1']), mig('b', '1', ['a.1'])]);
    expect(out.length).toBe(2);
    expect(new Set(keys(out))).toEqual(new Set(['a.1', 'b.1']));
  });

  it('returns [] for empty input', () => {
    expect(orderMigrations([])).toEqual([]);
  });
});

describe('buildTimelineSteps — history-graph node fields (A.1.3)', () => {
  it('exposes key and the full dependency list per step', () => {
    const steps = buildTimelineSteps([mig('blog', '0002', ['blog.0001', 'shop.0001'])]);
    expect(steps[0]?.key).toBe('blog.0002');
    expect(steps[0]?.dependencies).toEqual(['blog.0001', 'shop.0001']);
    expect(steps[0]?.isInitial).toBe(false);
  });

  it('marks a dependency-free migration as initial', () => {
    const steps = buildTimelineSteps([mig('blog', '0001')]);
    expect(steps[0]?.isInitial).toBe(true);
    expect(steps[0]?.dependencies).toEqual([]);
  });
});
