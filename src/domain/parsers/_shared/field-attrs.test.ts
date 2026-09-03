import { describe, it, expect } from 'vitest';
import {
  parseFieldAttrs,
  attrTokens,
  comparableTokens,
  changedAttrKeys,
  attrKey,
} from './field-attrs';

describe('parseFieldAttrs', () => {
  it('reads decimal precision', () => {
    const a = parseFieldAttrs('max_digits=10, decimal_places=2');
    expect(a.maxDigits).toBe(10);
    expect(a.decimalPlaces).toBe(2);
  });

  it('reads max_length without swallowing it into max_digits', () => {
    const a = parseFieldAttrs('max_length=200');
    expect(a.maxLength).toBe(200);
    expect(a.maxDigits).toBeUndefined();
  });

  it('reads boolean flags only when True', () => {
    const a = parseFieldAttrs('null=True, blank=False, unique=True');
    expect(a.isNull).toBe(true);
    expect(a.isBlank).toBeUndefined();
    expect(a.isUnique).toBe(true);
  });

  it('does not let auto_now_add set auto_now', () => {
    const a = parseFieldAttrs('auto_now_add=True');
    expect(a.autoNowAdd).toBe(true);
    expect(a.autoNow).toBeUndefined();
  });

  it('reads primary_key and db_index', () => {
    const a = parseFieldAttrs('primary_key=True, db_index=True');
    expect(a.isPrimaryKey).toBe(true);
    expect(a.isDbIndex).toBe(true);
  });

  it('returns an empty bag for no kwargs', () => {
    expect(attrTokens(parseFieldAttrs(''))).toEqual([]);
  });
});

describe('attrTokens', () => {
  it('orders tokens the same regardless of kwarg order', () => {
    const a = attrTokens(parseFieldAttrs('null=True, max_digits=10, decimal_places=2'));
    const b = attrTokens(parseFieldAttrs('decimal_places=2, null=True, max_digits=10'));
    expect(a).toEqual(b);
    expect(a).toEqual(['max_digits=10', 'decimal_places=2', 'null']);
  });

  it('drops defaults too long to read in a cell', () => {
    const long = 'x'.repeat(40);
    expect(attrTokens(parseFieldAttrs(`default=${long}`))).toEqual([]);
  });
});

describe('comparableTokens', () => {
  // Django's migration serializer fully qualifies callables, so the same
  // default reads differently on each side. Comparing it reports phantom edits.
  it('excludes default from the comparison', () => {
    const live = comparableTokens(parseFieldAttrs('default=timezone.now, null=True'));
    const mig = comparableTokens(parseFieldAttrs('default=django.utils.timezone.now, null=True'));
    expect(live).toEqual(mig);
  });

  it('still keeps default visible for display', () => {
    expect(attrTokens(parseFieldAttrs('default=0'))).toEqual(['default=0']);
  });
});

describe('changedAttrKeys', () => {
  it('flags a value change', () => {
    const before = comparableTokens(parseFieldAttrs('max_digits=10, decimal_places=2'));
    const after = comparableTokens(parseFieldAttrs('max_digits=12, decimal_places=4'));
    expect(changedAttrKeys(before, after)).toEqual(new Set(['max_digits', 'decimal_places']));
  });

  it('flags an added and a removed kwarg', () => {
    const before = comparableTokens(parseFieldAttrs('max_length=100'));
    const after = comparableTokens(parseFieldAttrs('max_length=100, null=True'));
    expect(changedAttrKeys(before, after)).toEqual(new Set(['null']));
    expect(changedAttrKeys(after, before)).toEqual(new Set(['null']));
  });

  it('reports nothing when the signature is identical', () => {
    const t = comparableTokens(parseFieldAttrs('max_length=100, null=True'));
    expect(changedAttrKeys(t, t).size).toBe(0);
  });
});

describe('attrKey', () => {
  it('splits key=value and passes bare flags through', () => {
    expect(attrKey('max_length=200')).toBe('max_length');
    expect(attrKey('null')).toBe('null');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A default value can contain a comma.
//
// `default` was read with `[^,)]+`, which stops at the first comma or closing
// paren wherever it sits — including inside a string or a collection. So
// `default='a, b'` came back as `'a`, an unbalanced quote, and the DBML export
// carried it straight into the file: one column with an unclosed string, and
// dbdiagram refuses the whole document. `default=[1, 2]` and
// `default=dict(a=1, b=2)` were truncated the same way.
// ─────────────────────────────────────────────────────────────────────────────
describe('default values that contain commas', () => {
  const defaultOf = (kwargs: string) => parseFieldAttrs(kwargs).defaultValue;

  it.each([
    [`max_length=10, default='a, b'`, `'a, b'`],
    [`default="x, y", null=True`, `"x, y"`],
    [`default='a, b'`, `'a, b'`],
    [`default=[1, 2], blank=True`, `[1, 2]`],
    [`default=dict(a=1, b=2)`, `dict(a=1, b=2)`],
    [`default={'a': 1, 'b': 2}`, `{'a': 1, 'b': 2}`],
    [`default="it's, fine"`, `"it's, fine"`],
  ])('%s', (kwargs, expected) => {
    expect(defaultOf(kwargs)).toBe(expected);
  });

  it('still reads the simple forms', () => {
    expect(defaultOf('default=0')).toBe('0');
    expect(defaultOf('default=True, null=True')).toBe('True');
    expect(defaultOf("default='draft', max_length=10")).toBe("'draft'");
    expect(defaultOf('default=timezone.now')).toBe('timezone.now');
    expect(defaultOf('max_length=10')).toBeUndefined();
  });

  it('stops at the end of the kwargs, not past it', () => {
    expect(defaultOf(`default='a, b')`)).toBe(`'a, b'`);
  });

  // A value that opens with a quote closes with the same one. Counting quote
  // CHARACTERS is not the test: `"it's, fine"` holds one apostrophe by
  // design, and it is content, not a delimiter.
  it('never returns a string literal that is left open', () => {
    for (const kwargs of [
      `default='a, b'`,
      `default="x, y"`,
      `default="it's, fine"`,
      `default='a', max_length=1`,
      `default='a, b')`,
    ]) {
      const value = defaultOf(kwargs) ?? '';
      const opener = value[0];
      if (opener !== "'" && opener !== '"') continue;
      expect(value.length, kwargs).toBeGreaterThan(1);
      expect(value[value.length - 1], kwargs).toBe(opener);
    }
  });
});
