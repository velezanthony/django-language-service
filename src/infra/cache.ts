/**
 * ParseCache<T> -- bounded parse-result cache keyed by (path, mtime).
 *
 * Eviction: least-recently-USED when cap is reached, riding on the fact that a
 * Map preserves insertion order — delete-and-reinsert moves an entry to the
 * tail. It was insertion-order FIFO, which above the cap is close to useless:
 * the files the user edits are re-read on every pass at the same rate as the
 * ones nobody has touched since the first scan, so the cache stops paying for
 * itself exactly on the projects big enough to need it.
 *
 * Default cap: 2000 (covers typical Django projects; see design AD#3).
 *
 * No vscode imports -- purity is rg-verifiable.
 */

type CacheEntry<T> = { mtime: number; value: T };

export class ParseCache<T = unknown> {
  private readonly map = new Map<string, CacheEntry<T>>();

  constructor(private maxSize: number = 2000) {}

  /**
   * Grow the cap so a working set of `entries` fits.
   *
   * The cap was fixed at 2000 and pass1 walks every file in the same order on
   * every scan. A sequential sweep longer than the cache evicts each entry just
   * before the next pass asks for it, so past the cap the hit rate does not
   * decay — it goes to zero: an unchanged project of 2050 files re-parsed all
   * 2050, and saving one file in a project of 2400 re-parsed 2400. Neither LRU
   * nor FIFO survives that; the fixed cap is the defect.
   *
   * Never shrinks — a caller asking for room cannot cost another caller the
   * entries it already has.
   */
  ensureCapacity(entries: number): void {
    if (entries > this.maxSize) this.maxSize = entries;
  }

  /**
   * Returns the cached value if path exists AND mtime matches.
   * Returns undefined on miss or stale mtime (evicts the stale entry).
   */
  get(path: string, mtime: number): T | undefined {
    const entry = this.map.get(path);
    if (!entry) return undefined;
    if (entry.mtime !== mtime) {
      // Stale -- evict and report miss
      this.map.delete(path);
      return undefined;
    }
    // Re-insert at the tail: this read is what makes the entry recently used.
    this.map.delete(path);
    this.map.set(path, entry);
    return entry.value;
  }

  /** Stores a value. Evicts the oldest entry if cap is reached. */
  set(path: string, mtime: number, value: T): void {
    // If already present, delete first to re-insert at tail (update order)
    if (this.map.has(path)) {
      this.map.delete(path);
    } else if (this.map.size >= this.maxSize) {
      // Evict oldest (first inserted) entry
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) {
        this.map.delete(oldest);
      }
    }
    this.map.set(path, { mtime, value });
  }

  /** Removes the entry for path (no-op if absent). */
  invalidate(path: string): void {
    this.map.delete(path);
  }

  /** Removes all entries. */
  clear(): void {
    this.map.clear();
  }

  /** Current number of cached entries. */
  get size(): number {
    return this.map.size;
  }
}
