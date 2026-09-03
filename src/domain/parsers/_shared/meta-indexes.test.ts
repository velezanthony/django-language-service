import { describe, it, expect } from 'vitest';
import { parseMetaIndexes } from './meta-indexes';

describe('unique_together', () => {
  // Django's docs show both shapes. Reading the flat one as N single-column
  // constraints is the classic misread — it means something entirely different.
  it('reads a flat sequence as ONE constraint over both columns', () => {
    expect(parseMetaIndexes('unique_together = ["driver", "restaurant"]')).toEqual([
      { fields: ['driver', 'restaurant'], unique: true },
    ]);
  });

  it('reads a nested sequence as one constraint per group', () => {
    expect(parseMetaIndexes('unique_together = [["a", "b"], ["c", "d"]]')).toEqual([
      { fields: ['a', 'b'], unique: true },
      { fields: ['c', 'd'], unique: true },
    ]);
  });

  it('handles the single-group tuple with a trailing comma', () => {
    expect(parseMetaIndexes('unique_together = (("a", "b"),)')).toEqual([
      { fields: ['a', 'b'], unique: true },
    ]);
  });

  it('reads it across several lines', () => {
    const body = `
        unique_together = [
            ("tenant", "slug"),
            ("tenant", "code"),
        ]
    `;
    expect(parseMetaIndexes(body)).toEqual([
      { fields: ['tenant', 'slug'], unique: true },
      { fields: ['tenant', 'code'], unique: true },
    ]);
  });
});

describe('index_together', () => {
  // Removed in Django 5.1, still present in older codebases.
  it('produces a non-unique index', () => {
    expect(parseMetaIndexes('index_together = [["a", "b"]]')).toEqual([{ fields: ['a', 'b'] }]);
  });
});

describe('Meta.indexes', () => {
  it('reads fields and name', () => {
    const body = `indexes = [models.Index(fields=["last_name", "first_name"], name="name_idx")]`;
    expect(parseMetaIndexes(body)).toEqual([
      { fields: ['last_name', 'first_name'], name: 'name_idx' },
    ]);
  });

  it('keeps the leading hyphen that means DESC', () => {
    const body = `indexes = [models.Index(fields=["headline", "-pub_date"])]`;
    expect(parseMetaIndexes(body)[0]!.fields).toEqual(['headline', '-pub_date']);
  });

  it('reads several Index calls across lines', () => {
    const body = `
        indexes = [
            models.Index(fields=["a"]),
            models.Index(fields=["b", "c"], name="bc_idx"),
        ]
    `;
    expect(parseMetaIndexes(body)).toEqual([
      { fields: ['a'] },
      { fields: ['b', 'c'], name: 'bc_idx' },
    ]);
  });

  // condition=Q(...) nests parentheses; a non-balanced scan stops at the wrong
  // one and loses everything after it.
  it('survives a nested call in the arguments and marks the index partial', () => {
    const body = `indexes = [models.Index(fields=["a"], name="p", condition=Q(active=True))]`;
    expect(parseMetaIndexes(body)).toEqual([{ fields: ['a'], name: 'p', partial: true }]);
  });

  it('picks up PostgreSQL index classes, which share the fields= API', () => {
    const body = `indexes = [GinIndex(fields=["search"], name="gin_idx")]`;
    expect(parseMetaIndexes(body)).toEqual([{ fields: ['search'], name: 'gin_idx' }]);
  });

  it('skips an expression index — there is no column list to render', () => {
    const body = `indexes = [models.Index(Lower("title"), name="lower_title_idx")]`;
    expect(parseMetaIndexes(body)).toEqual([]);
  });
});

describe('Meta.constraints', () => {
  it('reads UniqueConstraint as a unique index', () => {
    const body = `constraints = [models.UniqueConstraint(fields=["room", "date"], name="unique_booking")]`;
    expect(parseMetaIndexes(body)).toEqual([
      { fields: ['room', 'date'], name: 'unique_booking', unique: true },
    ]);
  });

  it('ignores CheckConstraint — it constrains values, not columns', () => {
    const body = `constraints = [models.CheckConstraint(condition=Q(age__gte=18), name="age_gte_18")]`;
    expect(parseMetaIndexes(body)).toEqual([]);
  });

  it('marks a conditional UniqueConstraint partial', () => {
    const body = `constraints = [UniqueConstraint(fields=["a"], name="u", condition=Q(deleted=False))]`;
    expect(parseMetaIndexes(body)[0]!.partial).toBe(true);
  });
});

describe('combinations', () => {
  it('collects every source in one Meta', () => {
    const body = `
        db_table = "thing"
        unique_together = [["a", "b"]]
        indexes = [models.Index(fields=["c"], name="c_idx")]
        constraints = [models.UniqueConstraint(fields=["d"], name="d_uniq")]
    `;
    expect(parseMetaIndexes(body)).toEqual([
      { fields: ['a', 'b'], unique: true },
      { fields: ['c'], name: 'c_idx' },
      { fields: ['d'], name: 'd_uniq', unique: true },
    ]);
  });

  // Codebases mid-migration declare the same set both ways; two identical
  // unique indexes on one table is a dbdiagram error, not a nicety.
  it('de-duplicates the same columns declared both ways', () => {
    const body = `
        unique_together = [["a", "b"]]
        constraints = [models.UniqueConstraint(fields=["a", "b"], name="ab_uniq")]
    `;
    expect(parseMetaIndexes(body)).toHaveLength(1);
  });

  it('keeps a unique and a non-unique index over the same columns apart', () => {
    const body = `
        unique_together = [["a"]]
        indexes = [models.Index(fields=["a"])]
    `;
    expect(parseMetaIndexes(body)).toHaveLength(2);
  });

  it('returns nothing for a Meta with no index declarations', () => {
    expect(parseMetaIndexes('db_table = "x"\nordering = ["name"]')).toEqual([]);
  });

  it('is not fooled by ordering, which also holds quoted field names', () => {
    expect(parseMetaIndexes('ordering = ["-created_at", "name"]')).toEqual([]);
  });
});
