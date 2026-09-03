import { describe, it, expect } from 'vitest';
import type { Model } from '$domain/types/model';
import { applyInheritance } from './model-inheritance';

const mk = (over: Partial<Model> & { name: string }): Model => ({
  kind: 'model',
  appLabel: 'accounts',
  filePath: 'apps/accounts/models.py',
  line: 1,
  fields: [],
  relations: [],
  properties: [],
  ...over,
});

const fieldNames = (models: Model[], name: string) =>
  models.find(m => m.name === name)!.fields.map(f => f.name);
const relNames = (models: Model[], name: string) =>
  models.find(m => m.name === name)!.relations.map(r => r.fieldName);

describe('abstract base — fields are copied into the child', () => {
  // Django copies abstract fields into the child's own table, so merging them
  // into the child is what the database actually looks like.
  const base = mk({
    name: 'TimeStamped',
    meta: { abstract: true },
    fields: [
      { name: 'created_at', fieldType: 'DateTimeField' },
      { name: 'updated_at', fieldType: 'DateTimeField' },
    ],
  });
  const child = mk({
    name: 'Org',
    bases: ['TimeStamped'],
    fields: [{ name: 'slug', fieldType: 'SlugField' }],
  });

  it('merges the base fields, own fields first', () => {
    expect(fieldNames(applyInheritance([base, child]), 'Org')).toEqual([
      'slug',
      'created_at',
      'updated_at',
    ]);
  });

  it('marks where an inherited field came from', () => {
    const org = applyInheritance([base, child]).find(m => m.name === 'Org')!;
    expect(org.fields.find(f => f.name === 'created_at')!.inheritedFrom).toBe('TimeStamped');
    expect(org.fields.find(f => f.name === 'slug')!.inheritedFrom).toBeUndefined();
  });

  it('leaves the base itself alone', () => {
    expect(fieldNames(applyInheritance([base, child]), 'TimeStamped')).toEqual([
      'created_at',
      'updated_at',
    ]);
  });

  it('follows a chain of abstract bases', () => {
    const mid = mk({
      name: 'Mid',
      bases: ['TimeStamped'],
      meta: { abstract: true },
      fields: [{ name: 'note', fieldType: 'TextField' }],
    });
    const leaf = mk({
      name: 'Leaf',
      bases: ['Mid'],
      fields: [{ name: 'x', fieldType: 'CharField' }],
    });
    expect(fieldNames(applyInheritance([base, mid, leaf]), 'Leaf')).toEqual([
      'x',
      'note',
      'created_at',
      'updated_at',
    ]);
  });
});

describe('overriding, which Django allows for abstract bases only', () => {
  const base = mk({
    name: 'CommonInfo',
    meta: { abstract: true },
    fields: [{ name: 'name', fieldType: 'CharField', maxLength: 100 }],
  });

  it("the child's own field wins", () => {
    const child = mk({
      name: 'Student',
      bases: ['CommonInfo'],
      fields: [{ name: 'name', fieldType: 'CharField', maxLength: 50 }],
    });
    const out = applyInheritance([base, child]).find(m => m.name === 'Student')!;
    expect(out.fields).toHaveLength(1);
    expect(out.fields[0]!.maxLength).toBe(50);
    expect(out.fields[0]!.inheritedFrom).toBeUndefined();
  });

  // "…or be removed with None" — straight from the docs.
  it('`name = None` drops the inherited field', () => {
    const child = mk({ name: 'Anon', bases: ['CommonInfo'], removedFields: ['name'] });
    expect(fieldNames(applyInheritance([base, child]), 'Anon')).toEqual([]);
  });
});

describe('concrete base — multi-table inheritance', () => {
  // Restaurant gets its OWN table with a OneToOne back to Place. Copying the
  // parent's columns in would misrepresent the schema; the link is the truth.
  const place = mk({ name: 'Place', fields: [{ name: 'address', fieldType: 'CharField' }] });
  const rest = mk({
    name: 'Restaurant',
    bases: ['Place'],
    fields: [{ name: 'serves_pizza', fieldType: 'BooleanField' }],
  });

  it('does NOT copy the parent fields', () => {
    expect(fieldNames(applyInheritance([place, rest]), 'Restaurant')).toEqual(['serves_pizza']);
  });

  it('emits the implicit parent link instead', () => {
    const out = applyInheritance([place, rest]).find(m => m.name === 'Restaurant')!;
    const ptr = out.relations.find(r => r.fieldName === 'place_ptr')!;
    expect(ptr.kind).toBe('o2o');
    expect(ptr.toModel).toBe('Place');
    expect(ptr.fromModel).toBe('accounts.Restaurant');
  });
});

describe('Django auth bases', () => {
  it('AbstractUser brings its own seven plus the two it inherits', () => {
    const user = mk({
      name: 'User',
      bases: ['AbstractUser'],
      fields: [{ name: 'phone', fieldType: 'CharField' }],
    });
    const names = fieldNames(applyInheritance([user]), 'User');
    expect(names).toContain('phone');
    for (const f of [
      'username',
      'first_name',
      'last_name',
      'email',
      'is_staff',
      'is_active',
      'date_joined',
      'password',
      'last_login',
      'is_superuser',
    ]) {
      expect(names, `missing ${f}`).toContain(f);
    }
  });

  it('AbstractUser pulls in the permission M2Ms', () => {
    const user = mk({ name: 'User', bases: ['AbstractUser'] });
    expect(relNames(applyInheritance([user]), 'User')).toEqual(['groups', 'user_permissions']);
  });

  // The subtlety the source shows and the docs do not: is_active is a plain
  // attribute on AbstractBaseUser, only a real field on AbstractUser.
  it('AbstractBaseUser brings only password and last_login', () => {
    const svc = mk({
      name: 'Svc',
      bases: ['AbstractBaseUser'],
      fields: [{ name: 'email', fieldType: 'EmailField' }],
    });
    expect(fieldNames(applyInheritance([svc]), 'Svc')).toEqual(['email', 'password', 'last_login']);
  });

  it('AbstractBaseUser + PermissionsMixin composes both', () => {
    const svc = mk({ name: 'Svc', bases: ['AbstractBaseUser', 'PermissionsMixin'] });
    expect(fieldNames(applyInheritance([svc]), 'Svc')).toEqual([
      'password',
      'last_login',
      'is_superuser',
    ]);
  });

  it('a manager is not a base that brings anything', () => {
    const m = mk({
      name: 'Thing',
      bases: ['UserManager'],
      fields: [{ name: 'x', fieldType: 'CharField' }],
    });
    expect(fieldNames(applyInheritance([m]), 'Thing')).toEqual(['x']);
  });
});

describe('idempotence — the scanner runs this again project-wide', () => {
  const base = mk({
    name: 'TS',
    meta: { abstract: true },
    fields: [{ name: 'created_at', fieldType: 'DateTimeField' }],
  });
  const child = mk({
    name: 'Org',
    bases: ['TS'],
    fields: [{ name: 'slug', fieldType: 'SlugField' }],
  });
  const place = mk({ name: 'Place', fields: [{ name: 'address', fieldType: 'CharField' }] });
  const rest = mk({
    name: 'Restaurant',
    bases: ['Place'],
    fields: [{ name: 'pizza', fieldType: 'BooleanField' }],
  });

  it('a second pass adds nothing', () => {
    const once = applyInheritance([base, child, place, rest]);
    const twice = applyInheritance(once);
    expect(fieldNames(twice, 'Org')).toEqual(fieldNames(once, 'Org'));
    expect(relNames(twice, 'Restaurant')).toEqual(relNames(once, 'Restaurant'));
    expect(relNames(twice, 'Restaurant').filter(n => n === 'place_ptr')).toHaveLength(1);
  });
});

describe('robustness', () => {
  it('survives a base that is not in the file', () => {
    const m = mk({
      name: 'Node',
      bases: ['MPTTModel'],
      fields: [{ name: 'title', fieldType: 'CharField' }],
    });
    expect(fieldNames(applyInheritance([m]), 'Node')).toEqual(['title']);
  });

  it('does not hang on a cycle', () => {
    const a = mk({
      name: 'A',
      bases: ['B'],
      meta: { abstract: true },
      fields: [{ name: 'a', fieldType: 'CharField' }],
    });
    const b = mk({
      name: 'B',
      bases: ['A'],
      meta: { abstract: true },
      fields: [{ name: 'b', fieldType: 'CharField' }],
    });
    expect(() => applyInheritance([a, b])).not.toThrow();
  });

  it('returns the same objects when nothing inherits', () => {
    const m = mk({ name: 'Solo', fields: [{ name: 'x', fieldType: 'CharField' }] });
    const out = applyInheritance([m]);
    expect(out[0]).toBe(m);
  });
});
