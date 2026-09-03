/**
 * Pass 2 resolves `settings.AUTH_USER_MODEL` to the model it names.
 *
 * Django's docs tell you to write every relation to the user that way, so it is
 * the most common FK target in a real project. Being a settings lookup rather
 * than a model name, it matched nothing and the relation vanished — no arrow in
 * the diagram, no column in the exports.
 */
import { describe, it, expect } from 'vitest';
import { Scanner } from './scanner';
import { InMemoryFileSystem } from './file-system';
import type { Project } from '$infra/types/project';
import type { Relation } from '$domain/types/relation';

const SETTINGS = `
DEBUG = True
AUTH_USER_MODEL = 'accounts.User'
`;

const ACCOUNTS = `
from django.contrib.auth.models import AbstractUser
from django.db import models

class User(AbstractUser):
    phone = models.CharField(max_length=20)
`;

const SHOP = `
from django.conf import settings
from django.db import models

class Order(models.Model):
    customer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    total = models.IntegerField()

class Profile(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
`;

function makeScanner(fs: InMemoryFileSystem) {
  const emitterFactory = () =>
    ({
      event: () => ({ dispose: () => undefined }),
      fire: () => undefined,
      dispose: () => undefined,
    }) as unknown as import('vscode').EventEmitter<Project>;
  return new Scanner({ fs, emitterFactory });
}

async function scan(files: Record<string, string>) {
  const fs = new InMemoryFileSystem();
  let v = 1;
  for (const [path, src] of Object.entries(files)) fs.addFile(path, src, v++);
  return (await makeScanner(fs).scan(['/ws'])).models;
}

const BASE = {
  '/ws/config/settings.py': SETTINGS,
  '/ws/apps/accounts/models.py': ACCOUNTS,
  '/ws/apps/shop/models.py': SHOP,
};

const relOf = async (
  files: Record<string, string>,
  key: string,
  field: string,
): Promise<Relation> => {
  const m = (await scan(files)).byKey(key);
  if (!m) throw new Error(`${key} missing`);
  const r = m.relations.find(x => x.fieldName === field);
  if (!r) throw new Error(`${key}.${field} missing`);
  return r;
};

describe('settings.AUTH_USER_MODEL', () => {
  it('resolves to the model the setting names', async () => {
    expect((await relOf(BASE, 'shop.Order', 'customer')).toModel).toBe('accounts.User');
  });

  // The previous case passes either way: that fixture has exactly one user
  // subclass, so the bases heuristic reaches the same answer and deleting the
  // settings read entirely would go unnoticed. Here two models qualify, so the
  // heuristic refuses — only actually reading settings.py can resolve it.
  it('reads settings.py rather than guessing — proved where guessing cannot', async () => {
    const twoUsers =
      ACCOUNTS +
      `
class ServiceAccount(AbstractBaseUser):
    label = models.CharField(max_length=10)
`;
    const files = {
      '/ws/config/settings.py': SETTINGS,
      '/ws/apps/accounts/models.py': twoUsers,
      '/ws/apps/shop/models.py': SHOP,
    };
    expect((await relOf(files, 'shop.Order', 'customer')).toModel).toBe('accounts.User');
  });

  it('prefers the setting when it disagrees with the heuristic', async () => {
    const files = {
      '/ws/config/settings.py': "AUTH_USER_MODEL = 'accounts.ServiceAccount'",
      '/ws/apps/accounts/models.py':
        ACCOUNTS +
        `
class ServiceAccount(models.Model):
    label = models.CharField(max_length=10)
`,
      '/ws/apps/shop/models.py': SHOP,
    };
    // The heuristic would say accounts.User — it is the only AbstractUser
    // subclass. The setting wins.
    expect((await relOf(files, 'shop.Order', 'customer')).toModel).toBe('accounts.ServiceAccount');
  });

  it('resolves a OneToOne the same way', async () => {
    expect((await relOf(BASE, 'shop.Profile', 'user')).toModel).toBe('accounts.User');
  });

  it('keeps the rest of the relation untouched', async () => {
    const r = await relOf(BASE, 'shop.Order', 'customer');
    expect(r.kind).toBe('fk');
    expect(r.onDelete).toBe('CASCADE');
  });

  // settings.py is not in INCLUDE_PATTERNS — pass 1 never globs it, so pass 2
  // has to open it on purpose.
  it('reads a settings module pass 1 never globbed', async () => {
    const models = await scan(BASE);
    // If settings had been indexed as a model file it would show up here.
    expect(
      models
        .all()
        .map(m => `${m.appLabel}.${m.name}`)
        .sort(),
    ).toEqual(['accounts.User', 'shop.Order', 'shop.Profile']);
  });

  it('handles a settings package (settings/base.py)', async () => {
    const files = {
      '/ws/config/settings/base.py': SETTINGS,
      '/ws/apps/accounts/models.py': ACCOUNTS,
      '/ws/apps/shop/models.py': SHOP,
    };
    expect((await relOf(files, 'shop.Order', 'customer')).toModel).toBe('accounts.User');
  });

  it('falls back to the sole AbstractUser subclass when the setting is absent', async () => {
    const files = { ...BASE, '/ws/config/settings.py': 'DEBUG = True' };
    expect((await relOf(files, 'shop.Order', 'customer')).toModel).toBe('accounts.User');
  });

  // Pointing at Django's built-in user is a real answer: that model is not in
  // the workspace, so the relation stays external rather than being aimed at
  // whatever local model happens to look like a user.
  it('leaves it unresolved when the setting names a model outside the workspace', async () => {
    const files = { ...BASE, '/ws/config/settings.py': "AUTH_USER_MODEL = 'auth.User'" };
    expect((await relOf(files, 'shop.Order', 'customer')).toModel).toBe('settings.AUTH_USER_MODEL');
  });

  it('leaves it unresolved when two models could be the user', async () => {
    const twoUsers =
      ACCOUNTS +
      `
class ServiceAccount(AbstractBaseUser):
    label = models.CharField(max_length=10)
`;
    const files = {
      '/ws/config/settings.py': 'DEBUG = True',
      '/ws/apps/accounts/models.py': twoUsers,
      '/ws/apps/shop/models.py': SHOP,
    };
    expect((await relOf(files, 'shop.Order', 'customer')).toModel).toBe('settings.AUTH_USER_MODEL');
  });

  it('does not touch a project that never mentions it', async () => {
    const files = {
      '/ws/apps/shop/models.py': `
from django.db import models

class Tag(models.Model):
    name = models.CharField(max_length=10)

class Post(models.Model):
    tag = models.ForeignKey(Tag, on_delete=models.CASCADE)
`,
    };
    expect((await relOf(files, 'shop.Post', 'tag')).toModel).toBe('Tag');
  });
});
