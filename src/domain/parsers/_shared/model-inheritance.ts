/**
 * Merge inherited members into each model.
 *
 * Django's two inheritance kinds need OPPOSITE treatment, and the difference is
 * what the database looks like:
 *
 *  - Abstract base: the fields are copied into the child's own table. Merging
 *    them into the child is exactly what the schema says. Overriding is allowed
 *    (the child's own field wins), and `name = None` removes one.
 *  - Concrete base (multi-table): the child gets its OWN table plus an implicit
 *    OneToOne to the parent. Copying columns in would misrepresent it, so this
 *    emits the `<parent>_ptr` link instead. Django raises FieldError on an
 *    override here, so there is no conflict to resolve.
 *  - Proxy (`Meta.proxy = True`): NEITHER of the above. It is the parent's own
 *    table under a new class, so it carries the parent's columns and there is
 *    no link field to point at them — a `<parent>_ptr` here is a column that
 *    does not exist.
 *
 * Django's own auth bases are mirrored below rather than read from
 * site-packages — see model-classes.ts for why. Field lists verified against
 * django/contrib/auth/{base_user,models}.py on the 5.2 branch; the docs do not
 * break them down per class.
 */

import { bareClassName } from './python-tokens';
import type { Field } from '$domain/types/field';
import type { Model } from '$domain/types/model';
import type { Relation } from '$domain/types/relation';

interface BaseMembers {
  readonly fields: readonly Field[];
  readonly relations: readonly Omit<Relation, 'fromModel'>[];
  /** Bases this base itself inherits. */
  readonly inherits?: readonly string[];
}

const DJANGO_BASES: Record<string, BaseMembers> = {
  AbstractBaseUser: {
    // is_active is a plain attribute here, NOT a field. Only AbstractUser
    // declares it as a BooleanField.
    fields: [
      { name: 'password', fieldType: 'CharField', maxLength: 128 },
      { name: 'last_login', fieldType: 'DateTimeField', isNull: true, isBlank: true },
    ],
    relations: [],
  },
  PermissionsMixin: {
    fields: [{ name: 'is_superuser', fieldType: 'BooleanField', defaultValue: 'False' }],
    relations: [
      { kind: 'm2m', toModel: 'auth.Group', fieldName: 'groups', relatedName: 'user_set' },
      {
        kind: 'm2m',
        toModel: 'auth.Permission',
        fieldName: 'user_permissions',
        relatedName: 'user_set',
      },
    ],
  },
  AbstractUser: {
    fields: [
      { name: 'username', fieldType: 'CharField', maxLength: 150 },
      { name: 'first_name', fieldType: 'CharField', maxLength: 150, isBlank: true },
      { name: 'last_name', fieldType: 'CharField', maxLength: 150, isBlank: true },
      { name: 'email', fieldType: 'EmailField', isBlank: true },
      { name: 'is_staff', fieldType: 'BooleanField', defaultValue: 'False' },
      { name: 'is_active', fieldType: 'BooleanField', defaultValue: 'True' },
      { name: 'date_joined', fieldType: 'DateTimeField' },
    ],
    relations: [],
    inherits: ['AbstractBaseUser', 'PermissionsMixin'],
  },
};

interface Inherited {
  fields: Field[];
  relations: Omit<Relation, 'fromModel'>[];
}

/** Walk one model's bases, collecting what they contribute. */
function collect(
  bases: readonly string[],
  byName: Map<string, Model>,
  seen: Set<string>,
): Inherited {
  const out: Inherited = { fields: [], relations: [] };

  for (const raw of bases) {
    const name = bareClassName(raw);
    if (!name || seen.has(name)) continue;
    seen.add(name);

    const django = DJANGO_BASES[name];
    if (django) {
      if (django.inherits) {
        const up = collect(django.inherits, byName, seen);
        out.fields.push(...up.fields);
        out.relations.push(...up.relations);
      }
      out.fields.push(...django.fields.map(f => ({ ...f, inheritedFrom: name })));
      out.relations.push(...django.relations);
      continue;
    }

    const local = byName.get(name);
    // Only ABSTRACT locals contribute fields. A concrete parent is handled by
    // the caller, as a relation.
    if (!local || local.meta?.abstract !== true) continue;

    const up = collect(local.bases ?? [], byName, seen);
    out.fields.push(...local.fields.map(f => ({ ...f, inheritedFrom: f.inheritedFrom ?? name })));
    out.fields.push(...up.fields);
    out.relations.push(...local.relations.map(({ fromModel: _drop, ...r }) => r));
    out.relations.push(...up.relations);
  }

  return out;
}

/** Resolve inheritance across a set of models parsed from the same file. */
export function applyInheritance(models: readonly Model[]): Model[] {
  const byName = new Map(models.map(m => [m.name, m]));

  return models.map(model => {
    const bases = model.bases ?? [];
    if (bases.length === 0) return model;

    // A proxy IS the parent's table: same columns, no link field. Falling
    // through to the concrete-base branch gave it a phantom `<parent>_ptr`
    // and none of the columns it actually has.
    if (model.meta?.proxy === true) {
      const parents = bases
        .map(b => byName.get(bareClassName(b)))
        .filter((b): b is Model => b !== undefined && b !== model);
      if (parents.length === 0) return model;

      const removedOnProxy = new Set(model.removedFields ?? []);
      const ownNames = new Set(model.fields.map(f => f.name));
      const ownRels = new Set(model.relations.map(r => r.fieldName));
      const fields = [...model.fields];
      const relations = [...model.relations];
      for (const parent of parents) {
        for (const f of parent.fields) {
          if (ownNames.has(f.name) || removedOnProxy.has(f.name)) continue;
          ownNames.add(f.name);
          fields.push({ ...f, inheritedFrom: f.inheritedFrom ?? parent.name });
        }
        for (const r of parent.relations) {
          if (ownRels.has(r.fieldName) || removedOnProxy.has(r.fieldName)) continue;
          ownRels.add(r.fieldName);
          relations.push({ ...r, fromModel: `${model.appLabel}.${model.name}` });
        }
      }
      return { ...model, fields, relations };
    }

    const inherited = collect(bases, byName, new Set([model.name]));

    // Concrete parents become the implicit OneToOne link. Skipped when it is
    // already there: this runs once per file and again project-wide, once the
    // scanner can see bases declared in another app.
    const existing = new Set(model.relations.map(r => r.fieldName));
    const ptrs: Relation[] = [];
    for (const raw of bases) {
      const parent = byName.get(bareClassName(raw));
      if (!parent || parent.meta?.abstract === true) continue;
      if (existing.has(`${parent.name.toLowerCase()}_ptr`)) continue;
      ptrs.push({
        kind: 'o2o',
        fromModel: `${model.appLabel}.${model.name}`,
        toModel: parent.name,
        fieldName: `${parent.name.toLowerCase()}_ptr`,
      });
    }

    const removed = new Set(model.removedFields ?? []);
    const own = new Set(model.fields.map(f => f.name));
    const extraFields = inherited.fields.filter(f => !own.has(f.name) && !removed.has(f.name));

    const ownRelations = new Set(model.relations.map(r => r.fieldName));
    const extraRelations = inherited.relations
      .filter(r => !ownRelations.has(r.fieldName) && !removed.has(r.fieldName))
      .map(r => ({ ...r, fromModel: `${model.appLabel}.${model.name}` }) as Relation);

    const fields = model.fields.filter(f => !removed.has(f.name)).concat(extraFields);
    const relations = [...model.relations, ...extraRelations, ...ptrs];

    if (fields.length === model.fields.length && relations.length === model.relations.length)
      return model;
    return { ...model, fields, relations };
  });
}
