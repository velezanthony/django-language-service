import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseModels } from './models';

// The accounts fixture is the reproducible case: every class in it inherits
// something OTHER than models.Model, which is what a real project looks like.
// Before this, 1 of its 5 models was detected.
const ACCOUNTS = join(__dirname, '../../test-django-project/apps/accounts/models.py');

const parsed = () => {
  const r = parseModels(readFileSync(ACCOUNTS, 'utf8'), { filePath: 'apps/accounts/models.py' });
  if (!r.ok) throw new Error('parse failed');
  return r.value;
};

describe('models inheriting something other than models.Model', () => {
  it('finds all five', () => {
    expect(
      parsed()
        .map(m => m.name)
        .sort(),
    ).toEqual(['ApiKey', 'Organisation', 'ServiceAccount', 'TimeStampedModel', 'User']);
  });

  it('AbstractUser — a custom AUTH_USER_MODEL', () => {
    const user = parsed().find(m => m.name === 'User')!;
    expect(user.fields.map(f => f.name)).toContain('phone');
    expect(user.meta?.dbTable).toBe('accounts_user');
    expect(user.properties.map(p => p.name)).toEqual(['display_name']);
  });

  it('AbstractBaseUser + PermissionsMixin', () => {
    const svc = parsed().find(m => m.name === 'ServiceAccount')!;
    expect(svc.fields.map(f => f.name)).toContain('email');
  });

  it('a project-local abstract base, and its relations survive', () => {
    const org = parsed().find(m => m.name === 'Organisation')!;
    expect(org.fields.map(f => f.name)).toContain('slug');
    expect(org.relations.map(r => r.fieldName)).toContain('owner');
  });

  it('a second child of the same base', () => {
    const key = parsed().find(m => m.name === 'ApiKey')!;
    expect(key.relations.map(r => r.fieldName)).toContain('organisation');
    expect(key.properties.map(p => p.name)).toEqual(['is_active']);
  });

  it('the relation from User back into the app is not lost', () => {
    const user = parsed().find(m => m.name === 'User')!;
    expect(user.relations.map(r => r.toModel)).toContain('accounts.Organisation');
  });
});
