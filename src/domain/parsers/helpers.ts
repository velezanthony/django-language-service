/**
 * parseHelpers — NEW pure function: scans a Django templatetags Python source
 * for @register.simple_tag / @register.tag / @register.filter / @register.inclusion_tag
 * decorators and emits a Helper[] for each registered tag or filter.
 *
 * NOT a port of the old helper-parser.ts (which extracts dict keys for view
 * context inference — that's Fase 3 scope). This parser is about templatetag
 * REGISTRATION only.
 *
 * No vscode / fs / path imports.
 */
import type { ParseResult, ParserOpts } from '$domain/contracts/parser';
import type { Helper } from '$domain/types';
import { DECORATOR_RE, stringLiteralLength, PY_IDENT } from './_shared/python-tokens';

// ── Patterns ──────────────────────────────────────────────────────────────────

/** Detect the template.Library() assignment: `register = template.Library()` */
const LIBRARY_RE = /\bregister\s*=\s*template\s*\.\s*Library\s*\(\s*\)/;

/** Extract function name from `def NAME(...)` line. */
/**
 * Built with `new RegExp` and the `u` flag rather than written as literals,
 * because a Python 3 identifier is Unicode — `índice`, `日本語`, `Artículo` are
 * ordinary names — and `\w` is `[A-Za-z0-9_]`. A reader written with `\w` does
 * not misread those; it does not see them at all, so the whole construct is
 * dropped in silence. `parseViews` was fixed for this and `PY_IDENT` exported
 * for the purpose; these were the readers still carrying the old shape.
 */
const DEF_NAME_RE = new RegExp(String.raw`^\s*def\s+(${PY_IDENT})\s*\(`, 'u');

/**
 * Extract explicit `name='...'` kwarg from decorator args.
 * E.g. `@register.filter(name='truncate_middle')` → 'truncate_middle'
 */
const EXPLICIT_NAME_RE = /name\s*=\s*['"]([^'"]+)['"]/;

// ── Helpers ───────────────────────────────────────────────────────────────────

function deriveLibrary(filePath: string): string {
  // basename without extension, e.g. 'shop/templatetags/shop_tags.py' → 'shop_tags'
  const base = filePath.split('/').pop() ?? filePath;
  return base.replace(/\.py$/, '');
}

function helperKindFromDeco(decoKind: string): 'tag' | 'filter' {
  return decoKind === 'filter' ? 'filter' : 'tag';
}

/**
 * The line with string literals and any trailing comment blanked out.
 *
 * Length is preserved, so an index into the mask is an index into the line and
 * the caller can still slice the RAW text — which it must, because `name='…'`
 * is read out of it.
 *
 * A parenthesis that is not code opens nothing. Counting them raw left the
 * reader convinced a decorator's argument list was still open, so it swallowed
 * the `def` below and the library lost that helper and every helper after it.
 * `stringLiteralLength` is the same reader that fixed this class of bug for
 * bracket matching in `_shared/python-tokens`.
 */
function codeOnly(line: string): string {
  // split('') and not [...line]: the spread iterates CODE POINTS, so a single
  // astral character would shorten the array and slide every index after it.
  const out = line.split('');
  for (let i = 0; i < line.length; i++) {
    const literal = stringLiteralLength(line, i);
    if (literal > 0) {
      for (let j = i; j < i + literal && j < out.length; j++) out[j] = ' ';
      i += literal - 1;
      continue;
    }
    if (line[i] === '#') {
      for (let j = i; j < out.length; j++) out[j] = ' ';
      break;
    }
  }
  return out.join('');
}

/** Net paren balance of a line: +1 per '(', -1 per ')'. */
function parenBalance(line: string): number {
  let depth = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
  }
  return depth;
}

/** Lines allowed between a decorator and its def without dropping the decorator. */
const IGNORABLE_LINE_RE = /^\s*(#.*)?$/;

// ── Parser ────────────────────────────────────────────────────────────────────

export function parseHelpers(source: string, opts?: ParserOpts): ParseResult<Helper[]> {
  if (!source.trim()) {
    return { ok: true, value: [] };
  }

  // Only process files that define a template.Library() instance.
  if (!LIBRARY_RE.test(source)) {
    return { ok: true, value: [] };
  }

  const filePath = opts?.filePath ?? '';
  const library = deriveLibrary(filePath);
  const lines = source.split('\n');
  const results: Helper[] = [];

  let pendingDeco: { kind: string; explicitName?: string } | null = null;
  // > 0 while still inside the (possibly multi-line) argument list of pendingDeco
  let decoParenDepth = 0;
  // Accumulated decorator argument text (across lines) for explicit name= extraction
  let decoArgs = '';

  const finishDecoArgs = (): void => {
    if (!pendingDeco) return;
    const nameMatch = decoArgs.match(EXPLICIT_NAME_RE);
    if (nameMatch) pendingDeco.explicitName = nameMatch[1]!;
  };

  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i] ?? '';
    const lineNum = i + 1; // 1-based

    // Still inside a multi-line decorator argument list — accumulate until balanced
    if (pendingDeco && decoParenDepth > 0) {
      decoParenDepth += parenBalance(codeOnly(lineText));
      decoArgs += `\n${lineText}`;
      if (decoParenDepth <= 0) {
        decoParenDepth = 0;
        finishDecoArgs();
      }
      continue;
    }

    // Check for decorator
    const decoMatch = lineText.match(DECORATOR_RE);
    if (decoMatch) {
      const decoKind = decoMatch[1]!; // simple_tag | tag | filter | inclusion_tag
      pendingDeco = { kind: decoKind };
      decoArgs = '';
      decoParenDepth = 0;

      // Located on the masked line so a '(' in a trailing comment is not
      // mistaken for the argument list; sliced from the RAW line so the
      // `name='…'` kwarg is still readable.
      const masked = codeOnly(lineText);
      const parenIdx = masked.indexOf('(', masked.indexOf(decoKind));
      if (parenIdx !== -1) {
        const rest = lineText.substring(parenIdx);
        const balance = parenBalance(masked.substring(parenIdx));
        decoArgs = rest;
        if (balance > 0) {
          // Argument list continues on the following line(s)
          decoParenDepth = balance;
        } else {
          finishDecoArgs();
        }
      }
      continue;
    }

    // Check for def NAME(...) after a pending decorator
    if (pendingDeco) {
      const defMatch = lineText.match(DEF_NAME_RE);
      if (defMatch) {
        const funcName = defMatch[1]!;
        const name = pendingDeco.explicitName ?? funcName;
        const helperKind = helperKindFromDeco(pendingDeco.kind);
        results.push({
          kind: 'helper',
          name,
          library,
          helperKind,
          filePath,
          line: lineNum,
        });
        pendingDeco = null;
        continue;
      }
      // Blank lines and comments may sit between a decorator and its def —
      // keep waiting. Any other code invalidates the pending decorator.
      if (!IGNORABLE_LINE_RE.test(lineText)) {
        pendingDeco = null;
      }
    }
  }

  return { ok: true, value: results };
}
