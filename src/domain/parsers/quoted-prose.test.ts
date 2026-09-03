/**
 * An apostrophe inside a double-quoted Python string.
 *
 * `verbose_name = "User's profile"` is ordinary English and ordinary Django.
 * The readers for these fields are all written `['"]([^'"]+)['"]` — open with
 * either quote, then forbid BOTH until the close. That shape cannot read a
 * string containing the other delimiter, and it does not read it wrong: the
 * regex fails outright and the field is silently absent, so the model shows
 * its class name where the author wrote a label.
 *
 * The correct shape is already in this repository, twice — `STRING_LITERAL_RE`
 * in `python-tokens.ts` and `STRING_RE` in `diagnose-loads.ts` both alternate
 * PER DELIMITER (`"(?:\\.|[^"\\])*"|'…'`). It just never reached the readers
 * for the prose fields, which are exactly the ones a human writes prose into.
 *
 * Identifier-valued options (`db_column`, `related_name`, `db_table`) are left
 * alone deliberately: a quote inside one is not a string the database would
 * accept, so there is nothing to read.
 */
import { describe, it, expect } from 'vitest';
import { parseModels } from './models';

function modelOf(source: string) {
  const result = parseModels(source, { filePath: 'shop/models.py' });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('parse failed');
  return result.value[0]!;
}

describe('a label holding an apostrophe', () => {
  it('reads verbose_name written with double quotes', () => {
    const model = modelOf(
      [
        'class Profile(models.Model):',
        '    class Meta:',
        '        verbose_name = "User\'s profile"',
      ].join('\n'),
    );
    expect(model.meta?.verboseName).toBe("User's profile");
  });

  it('reads verbose_name_plural written with double quotes', () => {
    const model = modelOf(
      [
        'class Profile(models.Model):',
        '    class Meta:',
        '        verbose_name_plural = "Users\' profiles"',
      ].join('\n'),
    );
    expect(model.meta?.verboseNamePlural).toBe("Users' profiles");
  });

  it('reads a db_table_comment holding an apostrophe', () => {
    const model = modelOf(
      [
        'class Profile(models.Model):',
        '    class Meta:',
        '        db_table_comment = "Everything we know about a user\'s account"',
      ].join('\n'),
    );
    expect(model.meta?.tableComment).toBe("Everything we know about a user's account");
  });

  it('reads a field db_comment holding an apostrophe', () => {
    const model = modelOf(
      [
        'class Profile(models.Model):',
        '    nickname = models.CharField(max_length=50, db_comment="The user\'s chosen name")',
      ].join('\n'),
    );
    expect(model.fields.find(f => f.name === 'nickname')?.docComment).toBe(
      "The user's chosen name",
    );
  });

  it('reads a double quote inside a single-quoted label', () => {
    const model = modelOf(
      [
        'class Q(models.Model):',
        '    class Meta:',
        '        verbose_name = \'The "big" one\'',
      ].join('\n'),
    );
    expect(model.meta?.verboseName).toBe('The "big" one');
  });

  it('still reads a label with no quote in it at all', () => {
    const model = modelOf(
      ['class P(models.Model):', '    class Meta:', "        verbose_name = 'profile'"].join('\n'),
    );
    expect(model.meta?.verboseName).toBe('profile');
  });
});
