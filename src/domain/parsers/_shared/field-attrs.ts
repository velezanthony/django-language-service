/**
 * One canonical reading of a Django field's kwargs.
 *
 * Both producers feed this: models.py declarations and the field literals
 * inside migration operations. They are both Python kwarg text, so they get
 * one parser — before this existed each side had its own regex set and its own
 * display format, which made a snapshot field and the live field it describes
 * uncomparable.
 */

import type { FieldAttrs } from '../../types/field';
import { stringLiteralLength } from './python-tokens';

const intOf = (kwargs: string, key: string): number | undefined => {
  const m = kwargs.match(new RegExp(`\\b${key}\\s*=\\s*(\\d+)`));
  return m ? parseInt(m[1]!, 10) : undefined;
};
const flagOf = (kwargs: string, key: string): true | undefined =>
  new RegExp(`\\b${key}\\s*=\\s*True\\b`).test(kwargs) ? true : undefined;

/**
 * The `default=` value, read as a Python expression rather than as "everything
 * up to the next comma".
 *
 * It was `[^,)]+`, which stops at the first comma or closing paren wherever it
 * sits — inside a string, inside a list, inside a call. `default='a, b'` came
 * back as `'a`: an unbalanced quote, which the DBML export wrote straight into
 * the file, and dbdiagram then rejects the whole document rather than one
 * column. `default=[1, 2]` and `default=dict(a=1, b=2)` were cut the same way.
 */
function defaultValueOf(kwargs: string): string | undefined {
  const m = /\bdefault\s*=\s*/.exec(kwargs);
  if (!m) return undefined;

  const start = m.index + m[0].length;
  let depth = 0;
  for (let i = start; i < kwargs.length; i++) {
    const literal = stringLiteralLength(kwargs, i);
    if (literal > 0) {
      i += literal - 1;
      continue;
    }

    const ch = kwargs[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') {
      if (depth === 0) return kwargs.slice(start, i).trim() || undefined;
      depth--;
    } else if (ch === ',' && depth === 0) {
      return kwargs.slice(start, i).trim() || undefined;
    }
  }
  return kwargs.slice(start).trim() || undefined;
}

export function parseFieldAttrs(kwargs: string): FieldAttrs {
  const defaultValue = defaultValueOf(kwargs);
  const maxLength = intOf(kwargs, 'max_length');
  const maxDigits = intOf(kwargs, 'max_digits');
  const decimalPlaces = intOf(kwargs, 'decimal_places');
  return {
    ...(maxLength !== undefined && { maxLength }),
    ...(maxDigits !== undefined && { maxDigits }),
    ...(decimalPlaces !== undefined && { decimalPlaces }),
    ...(flagOf(kwargs, 'null') && { isNull: true as const }),
    ...(flagOf(kwargs, 'blank') && { isBlank: true as const }),
    ...(flagOf(kwargs, 'unique') && { isUnique: true as const }),
    ...(flagOf(kwargs, 'primary_key') && { isPrimaryKey: true as const }),
    ...(flagOf(kwargs, 'db_index') && { isDbIndex: true as const }),
    ...(flagOf(kwargs, 'auto_now') && { autoNow: true as const }),
    ...(flagOf(kwargs, 'auto_now_add') && { autoNowAdd: true as const }),
    ...(defaultValue !== undefined && { defaultValue }),
  };
}

/** Canonical, stably-ordered `key=value` / bare-flag tokens. */
export function attrTokens(a: FieldAttrs): string[] {
  const out: string[] = [];
  if (a.maxLength !== undefined) out.push(`max_length=${a.maxLength}`);
  if (a.maxDigits !== undefined) out.push(`max_digits=${a.maxDigits}`);
  if (a.decimalPlaces !== undefined) out.push(`decimal_places=${a.decimalPlaces}`);
  if (a.isPrimaryKey) out.push('primary_key');
  if (a.isUnique) out.push('unique');
  if (a.isDbIndex) out.push('db_index');
  if (a.isNull) out.push('null');
  if (a.isBlank) out.push('blank');
  if (a.autoNowAdd) out.push('auto_now_add');
  if (a.autoNow) out.push('auto_now');
  if (a.defaultValue !== undefined && a.defaultValue.length < 30)
    out.push(`default=${a.defaultValue}`);
  return out;
}

/**
 * Tokens used to decide whether a field CHANGED, as opposed to what to show.
 *
 * `default` is display-only. Django's migration serializer rewrites defaults
 * into fully-qualified callables (`django.utils.timezone.now` for what models.py
 * spells `timezone.now`), so comparing them across the two producers reports a
 * change on fields nobody touched.
 */
export function comparableTokens(a: FieldAttrs): string[] {
  return stripDisplayOnly(attrTokens(a));
}

/** Same rule, applied to tokens that were already produced. */
export function stripDisplayOnly(tokens: readonly string[]): string[] {
  return tokens.filter(t => !t.startsWith('default='));
}

/** The key half of a token — `max_length=200` → `max_length`, `null` → `null`. */
export function attrKey(token: string): string {
  const eq = token.indexOf('=');
  return eq < 0 ? token : token.slice(0, eq);
}

/** Keys whose presence or value differs between the two sides. */
export function changedAttrKeys(before: readonly string[], after: readonly string[]): Set<string> {
  const byKey = (ts: readonly string[]): Map<string, string> =>
    new Map(ts.map(t => [attrKey(t), t]));
  const b = byKey(before);
  const a = byKey(after);
  const changed = new Set<string>();
  for (const [k, v] of a) if (b.get(k) !== v) changed.add(k);
  for (const k of b.keys()) if (!a.has(k)) changed.add(k);
  return changed;
}
