/**
 * Which classes in a models.py are Django models.
 *
 * `bases.includes('models.Model')` missed the two shapes every real project
 * has: a custom user (`AbstractUser`) and anything inheriting a project-local
 * abstract base. Measured on the accounts fixture, 1 model of 5 was detected.
 *
 * Three rules, in the order they earn their keep:
 *
 *  1. A known Django base. Small closed list — no need to read site-packages to
 *     learn a set of names that has barely changed in a decade, and Django's
 *     own internals are far less regular than the app code this parser expects.
 *  2. The class declares `models.X(...)` fields. Catches bases nobody can
 *     whitelist — django-mptt, django-extensions, next year's package.
 *  3. A base that rule 1 or 2 already accepted, to a fixpoint. Catches the
 *     local abstract base whose children add no fields of their own.
 */

import { bareClassName, PY_IDENT } from './python-tokens';

const DJANGO_MODEL_BASES = new Set([
  'Model',
  'models.Model',
  'AbstractUser',
  'AbstractBaseUser',
  'PermissionsMixin',
  'AbstractBaseSession',
  'AbstractGroup',
  'AbstractPermission',
]);

const CLASS_RE = new RegExp(String.raw`^(\s*)class\s+(${PY_IDENT})\s*\(([^)]*)\)\s*:`, 'u');
/** A model field assignment: `name = models.Something(` at any indentation. */
const FIELD_RE = new RegExp(String.raw`^\s*${PY_IDENT}\s*=\s*(?:\w+\()?\s*models\.\w+\s*\(`, 'u');

const isKnownBase = (base: string): boolean => {
  const t = base.trim();
  if (DJANGO_MODEL_BASES.has(t)) return true;
  // Fully qualified: django.db.models.Model, contrib.auth.models.AbstractUser…
  const tail = bareClassName(t);
  return t.includes('.') && DJANGO_MODEL_BASES.has(tail);
};

interface ClassInfo {
  readonly name: string;
  readonly bases: readonly string[];
  readonly declaresFields: boolean;
}

/** Top-level classes with their bases and whether their body declares fields. */
function scanClasses(source: string): ClassInfo[] {
  const lines = source.split('\n');
  const out: ClassInfo[] = [];

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i]!.match(CLASS_RE);
    // Nested classes (Meta, TextChoices) are members, not models.
    if (!match || match[1]!.length > 0) continue;

    const name = match[2]!;
    const bases = match[3]!
      .split(',')
      .map(b => b.trim())
      .filter(Boolean);

    let declaresFields = false;
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j] ?? '';
      const trimmed = line.trimStart();
      if (trimmed !== '' && line.length === trimmed.length) break; // back to column 0
      if (FIELD_RE.test(line)) {
        declaresFields = true;
        break;
      }
    }

    out.push({ name, bases, declaresFields });
  }
  return out;
}

/** Names of the classes in `source` that are Django models. */
export function detectModelClasses(source: string): Set<string> {
  if (!source.trim()) return new Set();

  const classes = scanClasses(source);
  const models = new Set<string>();

  for (const c of classes) {
    if (c.bases.some(isKnownBase) || (c.declaresFields && c.bases.length > 0)) models.add(c.name);
  }

  // Fixpoint: a class inheriting a known model is a model too.
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of classes) {
      if (models.has(c.name)) continue;
      if (c.bases.some(b => models.has(bareClassName(b)))) {
        models.add(c.name);
        grew = true;
      }
    }
  }

  return models;
}
