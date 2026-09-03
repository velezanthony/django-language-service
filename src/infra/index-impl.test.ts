import { describe, it, expect } from 'vitest';
import { IndexImpl } from './index-impl';

// ── Fixtures ──────────────────────────────────────────────────────────────────

type View = { name: string; app: string; file: string };

const makeView = (name: string, app: string, file = 'views.py'): View => ({ name, app, file });

const blogIndexView = makeView('IndexView', 'blog');
const blogDetailView = makeView('DetailView', 'blog');
const authLoginView = makeView('LoginView', 'auth');

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('IndexImpl — byKey', () => {
  it('returns the entity on a hit', () => {
    const idx = new IndexImpl<View, string>(v => `${v.app}.${v.name}`);
    idx.add(blogIndexView);
    expect(idx.byKey('blog.IndexView')).toBe(blogIndexView);
  });

  it('returns undefined on a miss', () => {
    const idx = new IndexImpl<View, string>(v => `${v.app}.${v.name}`);
    expect(idx.byKey('blog.IndexView')).toBeUndefined();
  });
});

describe('IndexImpl — byProperty', () => {
  it('returns matching entities on a registered property hit', () => {
    const idx = new IndexImpl<View, string>(v => `${v.app}.${v.name}`, ['app']);
    idx.add(blogIndexView);
    idx.add(blogDetailView);
    idx.add(authLoginView);
    const result = idx.byProperty('app', 'blog');
    expect(result).toHaveLength(2);
    expect(result).toContain(blogIndexView);
    expect(result).toContain(blogDetailView);
  });

  it('throws on an unregistered property', () => {
    const idx = new IndexImpl<View, string>(v => `${v.app}.${v.name}`);
    idx.add(blogIndexView);
    expect(() => idx.byProperty('app', 'blog')).toThrow(/not indexed/);
  });
});

describe('IndexImpl — all()', () => {
  // The snapshot is now the SAME array between changes, so that adapters can
  // memoise on its identity. That makes "a caller may mutate the copy it got"
  // unsafe rather than merely pointless, and the array is frozen to say so.
  // The declared type has always been `readonly T[]`; this is that promise
  // enforced at runtime instead of only at compile time.
  it('returns a snapshot the caller cannot mutate', () => {
    const idx = new IndexImpl<View, string>(v => `${v.app}.${v.name}`);
    idx.add(blogIndexView);
    idx.add(blogDetailView);

    const snapshot = idx.all();
    expect(snapshot).toHaveLength(2);

    expect(() => (snapshot as View[]).push(authLoginView)).toThrow();
    expect(idx.all()).toHaveLength(2);
  });

  it('returns empty array when nothing added', () => {
    const idx = new IndexImpl<View, string>(v => v.name);
    expect(idx.all()).toEqual([]);
  });
});

describe('IndexImpl — add()', () => {
  it('updates primary and secondary indexes', () => {
    const idx = new IndexImpl<View, string>(v => `${v.app}.${v.name}`, ['app']);
    idx.add(blogIndexView);

    expect(idx.byKey('blog.IndexView')).toBe(blogIndexView);
    expect(idx.byProperty('app', 'blog')).toContain(blogIndexView);
  });
});

describe('IndexImpl — invalidate()', () => {
  it('removes matching items from primary and secondary when predicate given', () => {
    const idx = new IndexImpl<View, string>(v => `${v.app}.${v.name}`, ['app']);
    idx.add(blogIndexView);
    idx.add(blogDetailView);
    idx.add(authLoginView);

    idx.invalidate(v => v.file === 'views.py');

    // All had file='views.py' → all gone
    expect(idx.all()).toHaveLength(0);
    expect(idx.byProperty('app', 'blog')).toHaveLength(0);
  });

  it('clears everything when no predicate given', () => {
    const idx = new IndexImpl<View, string>(v => `${v.app}.${v.name}`, ['app']);
    idx.add(blogIndexView);
    idx.add(blogDetailView);

    idx.invalidate();

    expect(idx.all()).toHaveLength(0);
    expect(idx.byProperty('app', 'blog')).toHaveLength(0);
  });

  it('leaves non-matching items intact', () => {
    const fileAView = makeView('FileAView', 'blog', 'views_a.py');
    const fileBView = makeView('FileBView', 'blog', 'views_b.py');
    const idx = new IndexImpl<View, string>(v => `${v.app}.${v.name}`, ['app']);
    idx.add(fileAView);
    idx.add(fileBView);

    idx.invalidate(v => v.file === 'views_a.py');

    expect(idx.all()).toHaveLength(1);
    expect(idx.byKey('blog.FileBView')).toBe(fileBView);
    expect(idx.byProperty('app', 'blog')).toContain(fileBView);
    expect(idx.byProperty('app', 'blog')).not.toContain(fileAView);
  });
});

describe('IndexImpl.all — snapshot identity', () => {
  // Adapters memoise per-project work keyed on this array. A fresh copy per
  // call makes every WeakMap lookup a miss, so the memo silently never works.
  it('returns the same reference while nothing changes', () => {
    const idx = new IndexImpl<{ name: string }, string>(x => x.name);
    idx.add({ name: 'a' });
    expect(idx.all()).toBe(idx.all());
  });

  it('returns a new one after an add', () => {
    const idx = new IndexImpl<{ name: string }, string>(x => x.name);
    idx.add({ name: 'a' });
    const before = idx.all();
    idx.add({ name: 'b' });
    expect(idx.all()).not.toBe(before);
    expect(idx.all().map(x => x.name)).toEqual(['a', 'b']);
  });

  it('returns a new one after invalidate', () => {
    const idx = new IndexImpl<{ name: string }, string>(x => x.name);
    idx.add({ name: 'a' });
    const before = idx.all();
    idx.invalidate();
    expect(idx.all()).not.toBe(before);
    expect(idx.all()).toEqual([]);
  });

  it('hands out a snapshot a caller cannot corrupt', () => {
    const idx = new IndexImpl<{ name: string }, string>(x => x.name);
    idx.add({ name: 'a' });
    expect(() => (idx.all() as { name: string }[]).push({ name: 'b' })).toThrow();
    expect(idx.all()).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Replacing an item must replace it everywhere.
//
// `add` overwrote the primary entry but only ever ADDED to the secondary
// buckets, so the item that was replaced stayed reachable through
// `byProperty()` while `get()` and `all()` had already forgotten it. Two
// entities sharing a primary key is exactly what a same-named view in two apps
// produces, so this is the shape the index meets in the field.
// ─────────────────────────────────────────────────────────────────────────────
describe('adding over an existing key leaves no ghost behind', () => {
  type Row = { id: string; app: string };
  const build = () => new IndexImpl<Row, string>(r => r.id, ['app']);

  it('drops the replaced item from the property buckets', () => {
    const index = build();
    index.add({ id: 'k', app: 'blog' });
    index.add({ id: 'k', app: 'shop' });

    expect(index.byProperty('app', 'blog')).toEqual([]);
    expect(index.byProperty('app', 'shop')).toEqual([{ id: 'k', app: 'shop' }]);
  });

  it('keeps byProperty and all() telling the same story', () => {
    const index = build();
    index.add({ id: 'k', app: 'blog' });
    index.add({ id: 'k', app: 'shop' });
    index.add({ id: 'other', app: 'blog' });

    const throughProperty = [
      ...index.byProperty('app', 'blog'),
      ...index.byProperty('app', 'shop'),
    ];
    expect(throughProperty).toHaveLength(index.all().length);
    for (const row of throughProperty) expect(index.all()).toContain(row);
  });

  it('leaves an unchanged property alone when the item is replaced', () => {
    const index = build();
    index.add({ id: 'k', app: 'blog' });
    index.add({ id: 'k', app: 'blog' });
    expect(index.byProperty('app', 'blog')).toHaveLength(1);
  });
});
