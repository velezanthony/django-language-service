import { describe, it, expect } from 'vitest';
import { ParseCache } from './cache';

describe('ParseCache -- get/set round-trip', () => {
  it('returns undefined on miss', () => {
    const cache = new ParseCache<string>();
    expect(cache.get('app/models.py', 1000)).toBeUndefined();
  });

  it('returns value on hit with matching mtime', () => {
    const cache = new ParseCache<string>();
    cache.set('app/models.py', 1000, 'parsed-result');
    expect(cache.get('app/models.py', 1000)).toBe('parsed-result');
  });

  it('returns undefined on mtime mismatch (stale)', () => {
    const cache = new ParseCache<string>();
    cache.set('app/models.py', 1000, 'parsed-result');
    expect(cache.get('app/models.py', 1001)).toBeUndefined();
  });

  it('evicts stale entry after mtime mismatch', () => {
    const cache = new ParseCache<string>();
    cache.set('app/models.py', 1000, 'old-result');
    cache.get('app/models.py', 1001); // triggers eviction
    expect(cache.size).toBe(0);
  });
});

describe('ParseCache -- invalidate', () => {
  it('removes the entry', () => {
    const cache = new ParseCache<string>();
    cache.set('app/models.py', 1000, 'result');
    cache.invalidate('app/models.py');
    expect(cache.get('app/models.py', 1000)).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it('is a no-op for absent path', () => {
    const cache = new ParseCache<string>();
    expect(() => cache.invalidate('missing.py')).not.toThrow();
  });
});

describe('ParseCache -- cap eviction', () => {
  it('evicts oldest entry when maxSize exceeded', () => {
    const cache = new ParseCache<string>(3);
    cache.set('a.py', 1, 'A');
    cache.set('b.py', 2, 'B');
    cache.set('c.py', 3, 'C');
    expect(cache.size).toBe(3);

    // Adding a 4th entry should evict 'a.py' (oldest)
    cache.set('d.py', 4, 'D');

    expect(cache.size).toBe(3);
    expect(cache.get('a.py', 1)).toBeUndefined(); // evicted
    expect(cache.get('b.py', 2)).toBe('B');
    expect(cache.get('c.py', 3)).toBe('C');
    expect(cache.get('d.py', 4)).toBe('D');
  });

  it('updating an existing key does not grow beyond maxSize', () => {
    const cache = new ParseCache<string>(2);
    cache.set('a.py', 1, 'A');
    cache.set('b.py', 2, 'B');

    // Update 'a.py' -- should not evict anything
    cache.set('a.py', 3, 'A-updated');
    expect(cache.size).toBe(2);
    expect(cache.get('a.py', 3)).toBe('A-updated');
    expect(cache.get('b.py', 2)).toBe('B');
  });
});

describe('ParseCache -- clear', () => {
  it('removes all entries', () => {
    const cache = new ParseCache<string>();
    cache.set('a.py', 1, 'A');
    cache.set('b.py', 2, 'B');
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get('a.py', 1)).toBeUndefined();
  });
});

// ── Eviction order ────────────────────────────────────────────────────────────

describe('ParseCache — eviction keeps the working set', () => {
  // FIFO evicts by INSERTION order, so a file the user opens on every save is
  // dropped as readily as one nobody has touched since the first scan. Above
  // the cap that means the hot files are re-read and re-parsed on every pass,
  // which is precisely the work the cache exists to avoid.
  it('keeps an entry that keeps being read', () => {
    const cache = new ParseCache<string>(3);
    cache.set('hot', 1, 'H');
    cache.set('b', 1, 'B');
    cache.set('c', 1, 'C');

    // Read 'hot' — under FIFO this changes nothing.
    expect(cache.get('hot', 1)).toBe('H');

    cache.set('d', 1, 'D'); // over cap: something must go

    expect(cache.get('hot', 1)).toBe('H'); // the one still in use survives
    expect(cache.get('b', 1)).toBeUndefined(); // the coldest went instead
  });

  it('still evicts when nothing is ever read', () => {
    const cache = new ParseCache<string>(2);
    cache.set('a', 1, 'A');
    cache.set('b', 1, 'B');
    cache.set('c', 1, 'C');

    expect(cache.get('a', 1)).toBeUndefined();
    expect(cache.size).toBe(2);
  });

  it('a stale read does not promote the entry it evicted', () => {
    const cache = new ParseCache<string>(2);
    cache.set('a', 1, 'A');
    cache.set('b', 1, 'B');

    expect(cache.get('a', 999)).toBeUndefined(); // mtime moved on
    expect(cache.size).toBe(1);
  });
});
