import { describe, it, expect } from 'vitest';
import { parseModels } from '$domain/parsers/models';
import { buildDiagramPayload } from './diagram-serializer';

// "Orphan" means the model takes part in no relationship at all. It used to mean
// "no relationship to another model IN THIS DIAGRAM", which is a different and
// much larger set: the outgoing count filtered on `modelKeySet`, so a model whose
// only relation pointed outside the scanned files counted as zero.
//
// That caught the single most common shape in any Django project — a Profile
// hanging off settings.AUTH_USER_MODEL — and dimmed it as unused.

const isOrphan = (src: string, model: string): boolean => {
  const r = parseModels(src, { filePath: 'apps/shop/models.py' });
  if (!r.ok) throw new Error('parse failed');
  const payload = buildDiagramPayload(
    r.value,
    r.value.flatMap(m => m.relations),
    [],
  );
  const box = payload.tooltipData.find(b => b.name === model);
  if (!box) throw new Error(`${model} missing from payload`);
  return box.isOrphan;
};

describe('a relation pointing outside the scanned models is still a relation', () => {
  it('settings.AUTH_USER_MODEL — the classic Profile', () => {
    expect(
      isOrphan(
        `
from django.conf import settings
from django.db import models
class Profile(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
`,
        'Profile',
      ),
    ).toBe(false);
  });

  it('a string reference to a Django built-in', () => {
    expect(
      isOrphan(
        `
from django.db import models
class Profile(models.Model):
    user = models.OneToOneField('auth.User', on_delete=models.CASCADE)
`,
        'Profile',
      ),
    ).toBe(false);
  });

  it('contenttypes', () => {
    expect(
      isOrphan(
        `
from django.db import models
class Tagged(models.Model):
    ct = models.ForeignKey('contenttypes.ContentType', on_delete=models.CASCADE)
`,
        'Tagged',
      ),
    ).toBe(false);
  });

  it('a third-party package', () => {
    expect(
      isOrphan(
        `
from django.db import models
class Payment(models.Model):
    account = models.ForeignKey('djstripe.Account', on_delete=models.PROTECT)
`,
        'Payment',
      ),
    ).toBe(false);
  });
});

describe('genuinely unconnected models are still orphans', () => {
  it('flags a model that declares nothing and is referenced by nothing', () => {
    expect(
      isOrphan(
        `
from django.db import models
class AppSettings(models.Model):
    key = models.CharField(max_length=50)
`,
        'AppSettings',
      ),
    ).toBe(true);
  });

  it('does not flag either end of an in-diagram relation', () => {
    const src = `
from django.db import models
class Author(models.Model):
    name = models.CharField(max_length=50)
class Book(models.Model):
    author = models.ForeignKey(Author, on_delete=models.CASCADE)
`;
    expect(isOrphan(src, 'Book')).toBe(false);
    expect(isOrphan(src, 'Author')).toBe(false); // referenced, so not isolated
  });
});
