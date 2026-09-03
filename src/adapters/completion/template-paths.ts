/**
 * PRV-011, INS-001, INS-002 — Template path completion.
 *
 * Provides autocomplete for template paths inside:
 * - HTML: `{% include "..." %}` and `{% extends "..." %}`
 * - Python: `render()`, `template_name`, `get_template()`, etc.
 *
 * Paths are discovered via `vscode.workspace.findFiles` and cached.
 * Both relative-to-templates and full paths are suggested.
 */
import * as vscode from 'vscode';
import type { AdapterServices } from '$adapters/types';
import { logError } from '$shared/logger';
import { DTL_AND_PYTHON_SELECTOR } from '$adapters/_shared/languages';

/** Detects cursor inside an {% include %} or {% extends %} string. */
export const HTML_TEMPLATE_TRIGGER = /\{%[-+]?\s*(?:include|extends)\s+(['"])(?:(?!\1).)*$/;

/** Python patterns that indicate a Django template context. */
const PYTHON_CONTEXT_PATTERNS: readonly RegExp[] = [
  /template_name/,
  /render\s*\(/,
  /render_to_string\s*\(/,
  /render_to_response\s*\(/,
  /get_template\s*\(/,
  /select_template\s*\(/,
  /loader\./,
  /TemplateResponse\s*\(/,
  /SimpleTemplateResponse\s*\(/,
  /\.html['"]/,
  /\.txt['"]/,
];

interface TemplateCache {
  items: string[];
  expiresAt: number;
}

const TTL_MS = 30_000;

class DjangoTemplatePathCompletionProvider implements vscode.CompletionItemProvider {
  private cache: TemplateCache = { items: [], expiresAt: 0 };

  /**
   * Drop the list so the next request rebuilds it.
   *
   * The TTL alone means a template created a moment ago is not offered for up
   * to thirty seconds — and creating one is exactly what makes a user go and
   * type its name. `dtl-block-name.ts` already pairs the two and says why:
   * the scan is the sharper signal.
   */
  clear(): void {
    this.cache = { items: [], expiresAt: 0 };
  }

  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.CompletionList | undefined> {
    try {
      const fullLine = document.lineAt(position).text;
      const linePrefix = fullLine.substring(0, position.character);
      const isHtml = ['html', 'django-html', 'django-txt'].includes(document.languageId);
      const isPython = document.languageId === 'python';

      if (isHtml && !HTML_TEMPLATE_TRIGGER.test(linePrefix)) return undefined;
      if (isPython) {
        if (!isInsideOpenString(linePrefix)) return undefined;
        if (!PYTHON_CONTEXT_PATTERNS.some(p => p.test(fullLine))) return undefined;
      }
      if (!isHtml && !isPython) return undefined;

      if (Date.now() > this.cache.expiresAt) {
        const files = await vscode.workspace.findFiles(
          '**/templates/**/*.{html,txt,xml,json,csv}',
          '{**/node_modules/**,**/venv/**,**/.venv/**}',
        );

        const paths = new Set<string>();
        for (const f of files) {
          const rel = vscode.workspace.asRelativePath(f);
          const idx = rel.indexOf('templates/');
          if (idx >= 0) paths.add(rel.substring(idx + 'templates/'.length));
          paths.add(rel);
        }

        this.cache = { items: [...paths].sort(), expiresAt: Date.now() + TTL_MS };
      }

      const partial = extractPartialPath(linePrefix);
      if (partial === null) return undefined;

      const replaceStart = position.character - partial.length;
      const replaceRange = new vscode.Range(
        new vscode.Position(position.line, replaceStart),
        position,
      );

      const items = this.cache.items
        .filter(p => !partial || p.includes(partial))
        .map(p => {
          const item = new vscode.CompletionItem(p, vscode.CompletionItemKind.File);
          item.detail = p.includes('templates/') ? 'Full path' : 'Django template';
          item.range = replaceRange;
          item.filterText = p;
          item.sortText = p.includes('templates/') ? '1' + p : '0' + p;
          return item;
        });

      // isIncomplete: true — deliberately, and it is NOT a missed optimisation.
      // Every item carries an explicit `range` ending at the cursor. If VS Code
      // were allowed to filter this list locally instead of re-asking, that
      // range would go stale the moment the user typed another character, and
      // accepting an item would replace up to the OLD cursor and strand the
      // characters typed since. The rebuild is what keeps the range honest.
      // The list is only large while the prefix is empty; one typed character
      // narrows it immediately.
      return new vscode.CompletionList(items, true);
    } catch (err) {
      logError('Template path completion failed', err);
      return undefined;
    }
  }
}

function isInsideOpenString(linePrefix: string): boolean {
  let openQuote = '';
  for (let i = 0; i < linePrefix.length; i++) {
    const ch = linePrefix[i] ?? '';
    if (ch === '\\') {
      i++;
      continue;
    }
    if (openQuote) {
      if (ch === openQuote) openQuote = '';
    } else {
      if (ch === '"' || ch === "'") openQuote = ch;
    }
  }
  return openQuote !== '';
}

export function extractPartialPath(linePrefix: string): string | null {
  // Anchored on the quote that OPENED the string, not on the last quote seen.
  // `{% include "user's` used to answer `s`, because the apostrophe looked
  // like a fresh opening quote — so the dropdown filtered on the wrong prefix
  // the moment a path contained one.
  const m = linePrefix.match(/(['"])((?:(?!\1).)*)$/);
  return m ? (m[2] ?? null) : null;
}

export function register(
  _ctx: vscode.ExtensionContext,
  services: AdapterServices,
): vscode.Disposable {
  const provider = new DjangoTemplatePathCompletionProvider();
  const scanned = services.onProjectChange?.(() => {
    provider.clear();
  });

  return vscode.Disposable.from(
    vscode.languages.registerCompletionItemProvider(DTL_AND_PYTHON_SELECTOR, provider, '"', "'"),
    ...(scanned ? [scanned] : []),
  );
}
