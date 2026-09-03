/**
 * parseTemplateVariables — pure function: extracts {{ var }} and {{ var.attr.chain }}
 * references from a Django template source.
 *
 * Drops isLocal / isBuiltin — scope analysis is Fase 3 scanner job.
 * No vscode / fs / path imports.
 */
import type { ParseResult, ParserOpts } from '$domain/contracts/parser';
import type { TemplateVar } from '$domain/types';
import { liveTokens } from './_shared/dtl-lexer';
import { offsetMapper } from './_shared/offsets';

// ── Constants ─────────────────────────────────────────────────────────────────

const KEYWORD_LITERALS = new Set([
  'True',
  'False',
  'None',
  'and',
  'or',
  'not',
  'in',
  'is',
  'as',
  'by',
  'with',
  'from',
  'empty',
]);

// ── Strip + scan patterns (module-level to avoid re-allocation) ───────────────

// Delimiters, whitespace-control markers, comment and verbatim blocks, script
// bodies: all of that is the lexer's job now. This file only reads what is
// INSIDE a token.

// ── Helpers ───────────────────────────────────────────────────────────────────

interface RawVar {
  name: string; // root identifier
  chain: string[]; // dotted segments after root
}

function parseVarExpression(expr: string): RawVar | null {
  // Strip filters: "user.name|default:'N/A'" → "user.name"
  const varPart = (expr.split('|')[0] ?? '').trim();

  if (!varPart) return null;

  // Skip degenerate dot patterns
  if (varPart.endsWith('.') || varPart.startsWith('.') || varPart.includes('..')) {
    return null;
  }

  // Skip string literals
  if (/^["']/.test(varPart)) return null;

  // Skip numeric literals
  if (/^\d+(\.\d+)?$/.test(varPart)) return null;

  // Skip keyword literals
  if (KEYWORD_LITERALS.has(varPart)) return null;

  const parts = varPart.split('.');
  // Every segment must be a plain identifier or an index. Without this,
  // `{{ _("Hi") }}` parses as a variable literally named `_("Hi")` and gets
  // reported as undefined — and the adapter then cannot even locate it in
  // the line to draw a range.
  if (!parts.every(p => /^\w+$/.test(p))) return null;

  const name = parts[0] ?? '';
  if (!name || KEYWORD_LITERALS.has(name)) return null;

  return { name, chain: parts.slice(1) };
}

function tokenizeExpression(expr: string): string[] {
  const DTL_OPERATORS = new Set(['==', '!=', '<', '>', '<=', '>=', 'and', 'or', 'not', 'in', 'is']);
  return expr
    .split(/\s+/)
    .filter(t => t && !DTL_OPERATORS.has(t) && !/^["']/.test(t) && !/^\d/.test(t));
}

function parseTagExpression(inner: string): RawVar[] {
  const results: RawVar[] = [];

  // {% for var in iterable %} → iterable is a context variable
  const forMatch = inner.match(/^for\s+[\s\S]+?\s+in\s+([\s\S]+)$/);
  if (forMatch) {
    // `{% for p in products reversed %}` — the iterable is what precedes the
    // modifier, not the whole tail.
    const iterable = (forMatch[1] ?? '').replace(/\s+reversed\s*$/, '').trim();
    const parsed = parseVarExpression(iterable);
    if (parsed) results.push(parsed);
    return results;
  }

  // {% if expr %} / {% elif expr %}
  const ifMatch = inner.match(/^(?:if|elif)\s+([\s\S]+)$/);
  if (ifMatch) {
    for (const token of tokenizeExpression(ifMatch[1] ?? '')) {
      const parsed = parseVarExpression(token);
      if (parsed) results.push(parsed);
    }
    return results;
  }

  // {% with key=value ... %} → values on the right side of = are context vars
  const withMatch = inner.match(/^with\s+([\s\S]+)$/);
  if (withMatch) {
    const assignRe = /\w+\s*=\s*([^\s]+)/g;
    let m: RegExpExecArray | null;
    while ((m = assignRe.exec(withMatch[1] ?? '')) !== null) {
      const parsed = parseVarExpression(m[1] ?? '');
      if (parsed) results.push(parsed);
    }
    return results;
  }

  return results;
}

// ── Parser ────────────────────────────────────────────────────────────────────

export function parseTemplateVariables(
  source: string,
  _opts?: ParserOpts,
): ParseResult<TemplateVar[]> {
  if (!source.trim()) {
    return { ok: true, value: [] };
  }

  const at = offsetMapper(source);
  const vars: TemplateVar[] = [];

  // Script bodies are skipped HERE and nowhere else. Django does evaluate
  // them, so a `{% url %}` in a script is a real reference and the readers
  // that collect uses count it. This reader REPORTS UNDEFINED NAMES, and
  // JSX's `style={{ … }}` or a Handlebars block would each become a wall of
  // them. Reporting nothing there is the cheaper mistake.
  for (const token of liveTokens(source)) {
    if (token.inScript) continue;
    if (token.kind === 'var') {
      const raw = parseVarExpression(token.inner);
      // Point at the VARIABLE, not at the opening delimiter: consumers
      // draw a squiggle from here, and aiming at the tag made two
      // references on one line indistinguishable.
      if (raw)
        vars.push({
          kind: 'template-var',
          name: raw.name,
          chain: raw.chain,
          ...at(token.innerStart),
        });
      continue;
    }

    for (const tv of parseTagExpression(token.inner)) {
      // Bounded to THIS token, so the same name in two tags still gets
      // two distinct positions.
      const text = tv.chain.length > 0 ? `${tv.name}.${tv.chain.join('.')}` : tv.name;
      const within = token.inner.indexOf(text);
      vars.push({
        kind: 'template-var',
        name: tv.name,
        chain: tv.chain,
        ...at(token.innerStart + (within >= 0 ? within : 0)),
      });
    }
  }

  return { ok: true, value: vars };
}
