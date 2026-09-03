/**
 * Resolve the swappable user model.
 *
 * `ForeignKey(settings.AUTH_USER_MODEL, ...)` is what Django's own docs tell
 * you to write for any relation to the user, so it is everywhere. The target is
 * a settings lookup, not a model name, so it never matched a model and every
 * such relation was dropped: no column, no arrow, nothing in the exports.
 */

import type { Model } from '../../types/model';
import type { Relation } from '../../types/relation';

/** Spellings that all mean "whatever AUTH_USER_MODEL points at". */
const SWAPPABLE_REFS = new Set([
  'settings.AUTH_USER_MODEL',
  'AUTH_USER_MODEL',
  'conf.settings.AUTH_USER_MODEL',
  'django.conf.settings.AUTH_USER_MODEL',
  'get_user_model',
  'get_user_model()',
]);

export function isSwappableUserRef(target: string): boolean {
  return SWAPPABLE_REFS.has(target.trim());
}

/** `AUTH_USER_MODEL = "accounts.User"` from a settings module. */
export function parseAuthUserModel(settingsSource: string): string | null {
  // Last assignment wins: settings modules routinely override an earlier one.
  let found: string | null = null;
  for (const m of settingsSource.matchAll(/^\s*AUTH_USER_MODEL\s*=\s*['"]([\w.]+)['"]/gm)) {
    found = m[1]!;
  }
  return found;
}

/** Django base classes a custom user model must inherit from. */
const USER_BASES = ['AbstractUser', 'AbstractBaseUser'];

/**
 * Best guess when no settings module is readable: the project's only model
 * inheriting a user base. Deliberately refuses to answer when several qualify —
 * a project can define a second AbstractBaseUser subclass (a service account,
 * say) and picking the wrong one is worse than leaving the relation external.
 */
export function findUserModelByBases(models: readonly Model[]): string | null {
  const candidates = models.filter(
    m =>
      !m.meta?.abstract && (m.bases ?? []).some(b => USER_BASES.includes(b.split('.').pop() ?? b)),
  );
  if (candidates.length !== 1) return null;
  const m = candidates[0]!;
  return m.appLabel ? `${m.appLabel}.${m.name}` : m.name;
}

/**
 * Point every swappable reference at `userKey`. Always returns a NEW array, but
 * reuses the same Model object for any model without a swappable reference, so
 * downstream per-Model identity checks stay meaningful.
 */
export function resolveSwappableUserRefs(models: readonly Model[], userKey: string): Model[] {
  return models.map(m => {
    if (!m.relations.some(r => isSwappableUserRef(r.toModel))) return m;
    const relations: Relation[] = m.relations.map(r =>
      isSwappableUserRef(r.toModel) ? { ...r, toModel: userKey } : r,
    );
    return { ...m, relations };
  });
}
