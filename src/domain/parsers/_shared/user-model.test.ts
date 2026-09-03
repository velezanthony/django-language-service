import { describe, it, expect } from 'vitest';
import {
  isSwappableUserRef,
  parseAuthUserModel,
  findUserModelByBases,
  resolveSwappableUserRefs,
} from './user-model';
import type { Model } from '../../types/model';

const mk = (over: Partial<Model> & { name: string }): Model => ({
  kind: 'model',
  appLabel: 'accounts',
  filePath: 'accounts/models.py',
  line: 1,
  fields: [],
  relations: [],
  properties: [],
  ...over,
});

describe('isSwappableUserRef', () => {
  it('accepts the spelling Django documents', () => {
    expect(isSwappableUserRef('settings.AUTH_USER_MODEL')).toBe(true);
  });

  it('accepts the fully-qualified and bare forms', () => {
    expect(isSwappableUserRef('django.conf.settings.AUTH_USER_MODEL')).toBe(true);
    expect(isSwappableUserRef('AUTH_USER_MODEL')).toBe(true);
    expect(isSwappableUserRef('get_user_model()')).toBe(true);
  });

  // 'auth.User' is a real model reference, just one outside the workspace.
  // Rewriting it would point a relation at the wrong table.
  it('leaves a literal auth.User alone', () => {
    expect(isSwappableUserRef('auth.User')).toBe(false);
  });

  it('is not fooled by a model that merely mentions it', () => {
    expect(isSwappableUserRef('MyAUTH_USER_MODELThing')).toBe(false);
  });
});

describe('parseAuthUserModel', () => {
  it('reads the setting', () => {
    expect(parseAuthUserModel("AUTH_USER_MODEL = 'accounts.User'")).toBe('accounts.User');
  });

  it('takes the last assignment — settings modules override', () => {
    const src = `AUTH_USER_MODEL = "auth.User"\n\nAUTH_USER_MODEL = "accounts.User"\n`;
    expect(parseAuthUserModel(src)).toBe('accounts.User');
  });

  it('ignores it inside a comment', () => {
    expect(parseAuthUserModel("# AUTH_USER_MODEL = 'old.User'")).toBeNull();
  });

  it('returns null when unset', () => {
    expect(parseAuthUserModel('DEBUG = True')).toBeNull();
  });
});

describe('findUserModelByBases', () => {
  it('finds the single AbstractUser subclass', () => {
    const models = [mk({ name: 'User', bases: ['AbstractUser'] }), mk({ name: 'Other' })];
    expect(findUserModelByBases(models)).toBe('accounts.User');
  });

  it('accepts a dotted base', () => {
    const models = [mk({ name: 'User', bases: ['auth.AbstractBaseUser'] })];
    expect(findUserModelByBases(models)).toBe('accounts.User');
  });

  // A service account inheriting AbstractBaseUser is a real pattern. Guessing
  // between it and the real user model is worse than leaving it unresolved.
  it('refuses to choose between two candidates', () => {
    const models = [
      mk({ name: 'User', bases: ['AbstractUser'] }),
      mk({ name: 'ServiceAccount', bases: ['AbstractBaseUser', 'PermissionsMixin'] }),
    ];
    expect(findUserModelByBases(models)).toBeNull();
  });

  it('ignores an abstract candidate', () => {
    const models = [
      mk({ name: 'BaseUser', bases: ['AbstractUser'], meta: { abstract: true } }),
      mk({ name: 'User', bases: ['BaseUser'] }),
    ];
    expect(findUserModelByBases(models)).toBeNull();
  });

  it("returns null when the project uses Django's built-in user", () => {
    expect(findUserModelByBases([mk({ name: 'Thing' })])).toBeNull();
  });
});

describe('resolveSwappableUserRefs', () => {
  const withRel = mk({
    name: 'Order',
    appLabel: 'shop',
    relations: [
      {
        kind: 'fk',
        fromModel: 'shop.Order',
        toModel: 'settings.AUTH_USER_MODEL',
        fieldName: 'customer',
      },
      { kind: 'fk', fromModel: 'shop.Order', toModel: 'Product', fieldName: 'product' },
    ],
  });

  it('rewrites only the swappable target', () => {
    const [m] = resolveSwappableUserRefs([withRel], 'accounts.User');
    expect(m!.relations[0]!.toModel).toBe('accounts.User');
    expect(m!.relations[1]!.toModel).toBe('Product');
  });

  it('keeps every other field of the relation', () => {
    const [m] = resolveSwappableUserRefs([withRel], 'accounts.User');
    expect(m!.relations[0]!.fieldName).toBe('customer');
    expect(m!.relations[0]!.kind).toBe('fk');
  });

  it('returns the same object for a model with nothing to rewrite', () => {
    const plain = mk({ name: 'Plain' });
    const [m] = resolveSwappableUserRefs([plain], 'accounts.User');
    expect(m).toBe(plain);
  });
});
