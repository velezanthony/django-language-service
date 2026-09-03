/**
 * IndexImpl<T,K> — concrete O(1) implementation of the Fase 1 Index<T,K> contract.
 *
 * Primary store:    Map<K, T>
 * Secondary store:  Map<keyof T, Map<unknown, Set<T>>>
 *
 * Secondary property indexes MUST be registered at construction time.
 * Calling byProperty on an unregistered property throws (fail-fast — no silent O(n)).
 *
 * all() returns a frozen snapshot; mutations to the returned array do NOT affect the index.
 * No vscode imports — purity is rg-verifiable.
 */

import type { Index } from '$infra/types/index-type';

export class IndexImpl<T extends object, K extends PropertyKey> implements Index<T, K> {
  private readonly primary = new Map<K, T>();
  private readonly secondary = new Map<keyof T, Map<unknown, Set<T>>>();

  constructor(
    private readonly keyFn: (item: T) => K,
    props: readonly (keyof T)[] = [],
  ) {
    for (const prop of props) {
      this.secondary.set(prop, new Map<unknown, Set<T>>());
    }
  }

  byKey(k: K): T | undefined {
    return this.primary.get(k);
  }

  byProperty<P extends keyof T>(prop: P, val: T[P]): readonly T[] {
    const bucket = this.secondary.get(prop);
    if (!bucket) {
      throw new Error(
        `Property "${String(prop)}" is not indexed for this Index. ` +
          `Register it at construction time via the props parameter.`,
      );
    }
    const set = bucket.get(val as unknown);
    return set ? [...set] : [];
  }

  /**
   * A frozen snapshot, and the SAME array until the index changes.
   *
   * It used to allocate a fresh copy per call. Adapters call this on every
   * keystroke — several of them per completion — so the copy was pure waste,
   * and worse, a fresh reference each time makes the result impossible to
   * memoise downstream: any `WeakMap` keyed on it misses every single time.
   */
  all(): readonly T[] {
    this.snapshot ??= Object.freeze([...this.primary.values()]);
    return this.snapshot;
  }

  private snapshot: readonly T[] | undefined;

  add(item: T): void {
    this.snapshot = undefined;
    const key = this.keyFn(item);

    // Whatever held this key is gone from `primary` the moment we set it, so it
    // has to leave the property buckets too. It did not, and `byProperty()` kept
    // handing out an entity that `get()` and `all()` had already forgotten.
    const replaced = this.primary.get(key);
    if (replaced !== undefined && replaced !== item) {
      for (const [prop, bucketMap] of this.secondary) {
        bucketMap.get(replaced[prop] as unknown)?.delete(replaced);
      }
    }

    this.primary.set(key, item);

    for (const [prop, bucketMap] of this.secondary) {
      const val = item[prop] as unknown;
      let set = bucketMap.get(val);
      if (!set) {
        set = new Set<T>();
        bucketMap.set(val, set);
      }
      set.add(item);
    }
  }

  invalidate(predicate?: (item: T) => boolean): void {
    this.snapshot = undefined;
    if (!predicate) {
      this.primary.clear();
      for (const bucketMap of this.secondary.values()) {
        bucketMap.clear();
      }
      return;
    }

    for (const [key, item] of this.primary) {
      if (predicate(item)) {
        this.primary.delete(key);
        this.removeFromSecondary(item);
      }
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private removeFromSecondary(item: T): void {
    for (const [prop, bucketMap] of this.secondary) {
      const val = item[prop] as unknown;
      const set = bucketMap.get(val);
      if (set) {
        set.delete(item);
        if (set.size === 0) {
          bucketMap.delete(val);
        }
      }
    }
  }
}
