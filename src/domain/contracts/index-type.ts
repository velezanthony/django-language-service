/**
 * Generic O(1) entity index; implemented in `$infra/index-impl`. Secondary
 * properties are registered at construction — `byProperty` on an unregistered
 * one throws rather than scanning linearly.
 */
export interface Index<T extends object, K extends PropertyKey> {
  byKey(k: K): T | undefined;

  byProperty<P extends keyof T>(prop: P, val: T[P]): readonly T[];

  all(): readonly T[];

  add(item: T): void;

  /** Removes entities matching the predicate (or all if omitted). */
  invalidate(predicate?: (item: T) => boolean): void;
}
