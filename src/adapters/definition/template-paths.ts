/**
 * PRV-012, INS-003 — Template path go-to-definition.
 *
 * Ctrl+Click on a quoted template path inside:
 * - HTML: `{% include "path" %}` / `{% extends "path" %}`
 * - Python: `render(request, "path")` / `template_name = "path"`
 *
 * Uses the same multi-strategy resolver as the hover adapter.
 */
import * as vscode from 'vscode';
import { resolveTemplatePath } from '$adapters/_shared/template-resolve';
import type { AdapterServices } from '$adapters/types';
import { logError } from '$shared/logger';
import { DTL_AND_PYTHON_SELECTOR } from '$adapters/_shared/languages';
import { firstStringArgAt } from '$adapters/_shared/tag-string-arg';
import { freshRegex } from '$domain/contracts/fresh-regex';

/** The two tags whose first quoted argument names a template. */
const TEMPLATE_REF_TAGS: ReadonlySet<string> = new Set(['include', 'extends']);

/**
 * The Python calls that take a template name, and where the name sits in each.
 *
 * `render(request, "x")` puts it second; `get_template("x")` first. The
 * optional leading argument covers both, and `[\w.]` lets it be `self.request`.
 *
 * Narrow on purpose. This used to be "any quoted string on the line holding a
 * `/` or a `.`", which answered for `open("fixtures/seed.csv")`, for a URL, for
 * a log format — anything path-shaped, in any Python file in the workspace.
 */
const PY_TEMPLATE_REF = new RegExp(
  String.raw`(?:(?:render|render_to_string|get_template|select_template|TemplateResponse)\s*\(\s*(?:[A-Za-z_][\w.]*\s*,\s*)?|template_names?\s*=\s*)(['"])((?:(?!\1)[^\\]|\\.)*)\1`,
  'gu',
);

/** The template name under `offset` in a Python file, or null. */
function pythonTemplateRefAt(text: string, offset: number): string | null {
  const re = freshRegex(PY_TEMPLATE_REF);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const value = m[2] ?? '';
    // The whole match ends at the closing quote, so the value ends one before.
    const end = m.index + m[0].length - 1;
    const start = end - value.length;
    if (offset >= start && offset <= end) return value === '' ? null : value;
  }
  return null;
}

class DjangoTemplateDefinitionProvider implements vscode.DefinitionProvider {
  async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.Definition | undefined> {
    try {
      // By cursor offset against the TOKENS, the way the hover and the
      // document-link providers for this same reference already do it. The
      // scan this replaced never asked what tag it was in: it walked out to
      // the nearest quotes and called anything holding a `/` or a `.` a
      // template — an `href`, an `<img src>`, a `{% static %}` path, a `with`
      // keyword value, and one inside `{# … #}` that Django never runs.
      const offset = document.offsetAt(position);
      const templatePath =
        document.languageId === 'python'
          ? pythonTemplateRefAt(document.getText(), offset)
          : (firstStringArgAt(document.getText(), offset, TEMPLATE_REF_TAGS)?.value ?? null);
      if (!templatePath) return undefined;

      const uri = await resolveTemplatePath(templatePath);
      if (!uri) return undefined;

      return new vscode.Location(uri, new vscode.Position(0, 0));
    } catch (err) {
      logError('Template definition resolution failed', err);
      return undefined;
    }
  }
}

export function register(
  _ctx: vscode.ExtensionContext,
  _services: AdapterServices,
): vscode.Disposable {
  return vscode.languages.registerDefinitionProvider(
    DTL_AND_PYTHON_SELECTOR,
    new DjangoTemplateDefinitionProvider(),
  );
}
