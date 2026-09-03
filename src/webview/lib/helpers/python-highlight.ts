/**
 * A very small Python tokenizer, just enough to colour a property body.
 *
 * Not a parser and not trying to be: it exists so a five-line snippet in a
 * popup reads like code instead of a wall of one colour. VS Code does not
 * expose editor syntax token colours to webviews (only theme colours like
 * `debugTokenExpression.*`), so an exact match with the user's theme is not
 * available at any price — see PropertyPopup for what the kinds map to.
 *
 * The one invariant that matters: concatenating the tokens returns the input
 * unchanged. Wrong colour is a blemish; a lost character is a lie about the
 * source.
 */

export type TokenKind =
  'plain' | 'comment' | 'string' | 'keyword' | 'literal' | 'number' | 'decorator' | 'function';

export interface Token {
  readonly kind: TokenKind;
  readonly text: string;
}

const KEYWORDS = new Set([
  'and',
  'as',
  'assert',
  'async',
  'await',
  'break',
  'class',
  'continue',
  'def',
  'del',
  'elif',
  'else',
  'except',
  'finally',
  'for',
  'from',
  'global',
  'if',
  'import',
  'in',
  'is',
  'lambda',
  'nonlocal',
  'not',
  'or',
  'pass',
  'raise',
  'return',
  'self',
  'try',
  'while',
  'with',
  'yield',
  'cls',
]);
const LITERALS = new Set(['None', 'True', 'False']);

const isIdentStart = (c: string): boolean => /[A-Za-z_]/.test(c);
const isIdent = (c: string): boolean => /[A-Za-z0-9_]/.test(c);

export function highlightPython(source: string): Token[] {
  if (!source) return [];

  const out: Token[] = [];
  let plain = '';
  const flush = (): void => {
    if (plain) {
      out.push({ kind: 'plain', text: plain });
      plain = '';
    }
  };
  const push = (kind: TokenKind, text: string): void => {
    flush();
    out.push({ kind, text });
  };

  let i = 0;
  let afterDef = false;

  while (i < source.length) {
    const c = source[i]!;

    // Comment — to end of line.
    if (c === '#') {
      const end = source.indexOf('\n', i);
      const stop = end === -1 ? source.length : end;
      push('comment', source.slice(i, stop));
      i = stop;
      continue;
    }

    // String. Triple-quoted first, so a docstring stays one token.
    if (c === '"' || c === "'") {
      const triple = source.startsWith(c.repeat(3), i);
      const quote = triple ? c.repeat(3) : c;
      let j = i + quote.length;
      while (j < source.length) {
        if (source[j] === '\\') {
          j += 2;
          continue;
        }
        if (source.startsWith(quote, j)) {
          j += quote.length;
          break;
        }
        j++;
      }
      push('string', source.slice(i, Math.min(j, source.length)));
      i = Math.min(j, source.length);
      continue;
    }

    // Decorator.
    if (c === '@' && isIdentStart(source[i + 1] ?? '')) {
      let j = i + 1;
      while (j < source.length && (isIdent(source[j]!) || source[j] === '.')) j++;
      push('decorator', source.slice(i, j));
      i = j;
      continue;
    }

    // Number.
    if (/[0-9]/.test(c) && !isIdent(source[i - 1] ?? ' ')) {
      let j = i;
      while (j < source.length && /[0-9._]/.test(source[j]!)) j++;
      push('number', source.slice(i, j));
      i = j;
      continue;
    }

    // Word — keyword, literal, the name after `def`, or plain.
    if (isIdentStart(c)) {
      let j = i;
      while (j < source.length && isIdent(source[j]!)) j++;
      const word = source.slice(i, j);

      if (afterDef) {
        push('function', word);
        afterDef = false;
      } else if (KEYWORDS.has(word)) {
        push('keyword', word);
        afterDef = word === 'def';
      } else if (LITERALS.has(word)) push('literal', word);
      else plain += word;

      i = j;
      continue;
    }

    plain += c;
    i++;
  }

  flush();
  return out;
}
