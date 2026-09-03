/**
 * Pass 2 resolves abstract bases declared in another file.
 *
 * Unlike choice symbols, these live in a `models.py` that pass 1 already read,
 * so it is a name lookup. The import map is what disambiguates when two apps
 * define a base with the same name.
 */
import { describe, it, expect } from 'vitest';
import { Scanner } from './scanner';
import { InMemoryFileSystem } from './file-system';
import type { Project } from '$infra/types/project';

const CORE = `
from django.db import models

class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True
`;

// A second base with the SAME name, in a different app.
const LEGACY = `
from django.db import models

class TimeStampedModel(models.Model):
    stamped_on = models.DateTimeField()

    class Meta:
        abstract = True
`;

// NOT a models.py — pass 1 never globs this file.
const MIXINS = `
from django.db import models

class SoftDeleteMixin(models.Model):
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        abstract = True
`;

const SHOP = `
from django.db import models
from apps.core.models import TimeStampedModel
from apps.core.mixins import SoftDeleteMixin

class Product(TimeStampedModel, SoftDeleteMixin):
    name = models.CharField(max_length=100)
`;

const WAREHOUSE = `
from django.db import models
from apps.legacy.models import TimeStampedModel

class Bin(TimeStampedModel):
    code = models.CharField(max_length=10)
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

async function scanFixture() {
  const fs = new InMemoryFileSystem();
  fs.addFile('/ws/apps/core/models.py', CORE, 1);
  fs.addFile('/ws/apps/legacy/models.py', LEGACY, 2);
  fs.addFile('/ws/apps/core/mixins.py', MIXINS, 5);
  fs.addFile('/ws/apps/shop/models.py', SHOP, 3);
  fs.addFile('/ws/apps/warehouse/models.py', WAREHOUSE, 4);
  return (await makeScanner(fs).scan(['/ws'])).models;
}

const fieldsOf = (models: Awaited<ReturnType<typeof scanFixture>>, key: string) => {
  const m = models.byKey(key);
  if (!m) throw new Error(`${key} missing`);
  return m.fields.map(f => f.name);
};

describe('abstract base in another file', () => {
  it('merges its fields into the child', async () => {
    expect(fieldsOf(await scanFixture(), 'shop.Product')).toEqual([
      'name',
      'created_at',
      'updated_at',
      'deleted_at',
    ]);
  });

  // mixins.py is not in INCLUDE_PATTERNS, so the only way to reach it is to
  // read the import and open the file on purpose.
  it('follows the import into a file pass 1 never globbed', async () => {
    const product = (await scanFixture()).byKey('shop.Product')!;
    expect(product.fields.find(f => f.name === 'deleted_at')!.inheritedFrom).toBe(
      'SoftDeleteMixin',
    );
  });

  it('does not add the un-globbed base to the project', async () => {
    expect((await scanFixture()).byKey('core.SoftDeleteMixin')).toBeUndefined();
  });

  it('records where they came from', async () => {
    const product = (await scanFixture()).byKey('shop.Product')!;
    expect(product.fields.find(f => f.name === 'created_at')!.inheritedFrom).toBe(
      'TimeStampedModel',
    );
  });

  // Two apps, same base name. The import is the only thing that says which.
  it('picks the base the file actually imports', async () => {
    expect(fieldsOf(await scanFixture(), 'warehouse.Bin')).toEqual(['code', 'stamped_on']);
  });

  it('leaves the bases themselves untouched', async () => {
    expect(fieldsOf(await scanFixture(), 'core.TimeStampedModel')).toEqual([
      'created_at',
      'updated_at',
    ]);
  });
});
