/**
 * parseUrls — pure function: extracts URL route entries from a Django urls.py source.
 * No vscode / fs / path imports. Pure string processing only.
 */
import type { ParseResult, ParserOpts } from '$domain/contracts/parser';
import { offsetMapper } from './_shared/offsets';
import { extractBracketed, splitTopLevelTuples, extractDictKeys } from './_shared/python-tokens';
import type { Url, InlineTemplate } from '$domain/types';
import { freshRegex } from '$domain/contracts/fresh-regex';

// ── Patterns ──────────────────────────────────────────────────────────────────

const APP_NAME_RE = /app_name\s*=\s*['"](\w+)['"]/;

/**
 * `path(…)` and `re_path(…)`, read by counting brackets rather than by regex.
 *
 * A regex cannot do this, and the one that tried got two things wrong that a
 * reader of the pattern would never notice:
 *
 *  - `[\w.]+(?:\.as_view\(\))?` only allowed EMPTY parens, so every
 *    `RedirectView.as_view(url='/')` and `LoginView.as_view(template_name=…)`
 *    dropped its whole entry — and `{% url %}` then called the name unknown.
 *  - `name\s*=` also matches the tail of `template_name=`, so
 *    `TemplateView.as_view(template_name='p/c.html')` registered the URL under
 *    `p/c.html`.
 */
const PATH_CALL_RE = /\b(?:path|re_path)\s*\(/g;

/** A quoted string, for reading one argument. */
const STRING_ARG_RE = /^r?(['"])([\s\S]*?)\1\s*$/;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * A generic view that renders a template straight from the URL conf:
 *
 *     path('about/', TemplateView.as_view(template_name='pages/about.html'), …)
 *
 * There is no function in views.py to find, so nothing linked that template to
 * anything: the sidebar called it an orphan and Live Mode had no view to bind
 * it to. Its context is `view` plus whatever `extra_context` carries.
 */
function inlineTemplate(viewExpr: string): InlineTemplate | null {
  const open = viewExpr.indexOf('(');
  if (open === -1) return null;
  const args = extractBracketed(viewExpr, open, '(', ')');
  if (args === null) return null;

  const parts = splitTopLevelTuples(args).map(a => a.trim());
  const name = parts
    .map(a => /^template_name\s*=\s*['"]([^'"]+)['"]$/.exec(a)?.[1])
    .find((x): x is string => x !== undefined);
  if (name === undefined) return null;

  const extra = parts.find(a => /^extra_context\s*=\s*\{/.test(a));
  const dict = extra ? extractBracketed(extra, extra.indexOf('{'), '{', '}') : null;
  const contextKeys = dict !== null ? extractDictKeys(dict) : [];

  return { templateName: name, contextKeys };
}

// ── Parser ────────────────────────────────────────────────────────────────────

export function parseUrls(source: string, opts?: ParserOpts): ParseResult<Url[]> {
  if (!source.trim()) {
    return { ok: true, value: [] };
  }

  const filePath = opts?.filePath ?? '';

  // Detect app namespace
  const appNameMatch = source.match(APP_NAME_RE);
  const appName = appNameMatch?.[1] ?? '';

  // Built once. Counting newlines from the start of the file per match made
  // this parser quadratic: a urls.py four times longer took 15.7 times as
  // long, and a big project's root urls.py is exactly where that lands.
  const at = offsetMapper(source);

  const urls: Url[] = [];

  const calls = freshRegex(PATH_CALL_RE);
  let m: RegExpExecArray | null;
  while ((m = calls.exec(source)) !== null) {
    const open = source.indexOf('(', m.index);
    const args = extractBracketed(source, open, '(', ')');
    if (args === null) continue;

    const parts = splitTopLevelTuples(args).map(a => a.trim());
    const urlPattern = STRING_ARG_RE.exec(parts[0] ?? '')?.[2];
    const viewExpr = parts[1];
    if (urlPattern === undefined || !viewExpr) continue;

    // `name=` only as its own keyword: `template_name=` ends in the same
    // five characters and used to win.
    const named = parts
      .slice(2)
      .map(a => /^name\s*=\s*['"]([^'"]+)['"]$/.exec(a)?.[1])
      .find((x): x is string => x !== undefined);
    if (named === undefined) continue;

    const inline = inlineTemplate(viewExpr);
    urls.push({
      kind: 'url',
      name: appName ? `${appName}:${named}` : named,
      pattern: urlPattern,
      viewName: viewExpr.replace(/\s+/g, ' '),
      filePath,
      line: at(m.index).line - 1, // callers expect 0-based
      ...(inline !== null ? { inlineTemplate: inline } : {}),
    });
  }

  return { ok: true, value: urls };
}
