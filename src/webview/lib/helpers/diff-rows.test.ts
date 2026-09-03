import { describe, it, expect } from 'vitest';
import { DiffStatus } from '$lib/types/diff-tooltip-data';
import { buildDiffRows } from './diff-rows';

const f = (name: string, type: string) => ({ name, type });
const summarise = (rows: ReturnType<typeof buildDiffRows>) =>
  rows.map(r => `${r.status}:${r.before?.name ?? '—'}→${r.after?.name ?? '—'}`);

describe('buildDiffRows', () => {
  it('marks a field present only after as added', () => {
    expect(summarise(buildDiffRows([], [f('email', 'EmailField')]))).toEqual([
      `${DiffStatus.ADDED}:—→email`,
    ]);
  });

  it('marks a field present only before as removed', () => {
    expect(summarise(buildDiffRows([f('legacy', 'CharField')], []))).toEqual([
      `${DiffStatus.REMOVED}:legacy→—`,
    ]);
  });

  it('marks a type change as altered', () => {
    const rows = buildDiffRows([f('salary', 'FloatField')], [f('salary', 'DecimalField')]);
    expect(rows[0]!.status).toBe(DiffStatus.ALTERED);
    expect(rows[0]!.before).toEqual({ name: 'salary', type: 'FloatField' });
    expect(rows[0]!.after).toEqual({ name: 'salary', type: 'DecimalField' });
  });

  it('leaves an identical field unchanged', () => {
    expect(buildDiffRows([f('id', 'AutoField')], [f('id', 'AutoField')])[0]!.status).toBe(
      DiffStatus.UNCHANGED,
    );
  });

  // Reading order follows the AFTER side, which is the state you are looking
  // at; anything only in BEFORE is appended so it cannot be missed.
  it('keeps the after order, then the removed', () => {
    const rows = buildDiffRows(
      [f('a', 'CharField'), f('gone', 'CharField')],
      [f('a', 'CharField'), f('b', 'CharField')],
    );
    expect(summarise(rows)).toEqual([
      `${DiffStatus.UNCHANGED}:a→a`,
      `${DiffStatus.ADDED}:—→b`,
      `${DiffStatus.REMOVED}:gone→—`,
    ]);
  });

  it('handles a model that did not exist before', () => {
    const rows = buildDiffRows([], [f('a', 'CharField'), f('b', 'IntegerField')]);
    expect(rows.every(r => r.status === DiffStatus.ADDED)).toBe(true);
  });

  it('handles a model deleted entirely', () => {
    const rows = buildDiffRows([f('a', 'CharField')], []);
    expect(rows.every(r => r.status === DiffStatus.REMOVED)).toBe(true);
  });

  it('returns nothing for two empty sides', () => {
    expect(buildDiffRows([], [])).toEqual([]);
  });
});

// A migration that only widens DecimalField(10,2) → (12,4) keeps the type
// identical. Comparing types alone rendered two visually equal columns.
describe('buildDiffRows — kwarg changes', () => {
  const withAttrs = (name: string, type: string, attrs: string[]) => ({ name, type, attrs });

  it('marks a kwarg-only change as altered', () => {
    const rows = buildDiffRows(
      [withAttrs('total', 'DecimalField', ['max_digits=10', 'decimal_places=2'])],
      [withAttrs('total', 'DecimalField', ['max_digits=12', 'decimal_places=4'])],
    );
    expect(rows[0]!.status).toBe(DiffStatus.ALTERED);
  });

  it('names exactly which kwargs moved', () => {
    const rows = buildDiffRows(
      [withAttrs('total', 'DecimalField', ['max_digits=10', 'decimal_places=2'])],
      [withAttrs('total', 'DecimalField', ['max_digits=12', 'decimal_places=2'])],
    );
    expect(rows[0]!.changedAttrs).toEqual(['max_digits']);
  });

  it('keeps an identical signature unchanged', () => {
    const rows = buildDiffRows(
      [withAttrs('code', 'CharField', ['max_length=20'])],
      [withAttrs('code', 'CharField', ['max_length=20'])],
    );
    expect(rows[0]!.status).toBe(DiffStatus.UNCHANGED);
    expect(rows[0]!.changedAttrs).toBeUndefined();
  });

  it('flags a kwarg that appears', () => {
    const rows = buildDiffRows(
      [withAttrs('slug', 'SlugField', [])],
      [withAttrs('slug', 'SlugField', ['unique'])],
    );
    expect(rows[0]!.status).toBe(DiffStatus.ALTERED);
    expect(rows[0]!.changedAttrs).toEqual(['unique']);
  });

  // Django's serializer fully qualifies callables in migrations, so the same
  // default reads differently on each side of a snapshot-vs-live comparison.
  it('ignores a default-only difference', () => {
    const rows = buildDiffRows(
      [withAttrs('created', 'DateTimeField', ['default=timezone.now'])],
      [withAttrs('created', 'DateTimeField', ['default=django.utils.timezone.now'])],
    );
    expect(rows[0]!.status).toBe(DiffStatus.UNCHANGED);
  });

  it('still shows the default in the cell', () => {
    const rows = buildDiffRows(
      [withAttrs('created', 'DateTimeField', ['default=timezone.now'])],
      [withAttrs('created', 'DateTimeField', ['default=timezone.now'])],
    );
    expect(rows[0]!.after?.attrs).toEqual(['default=timezone.now']);
  });
});
