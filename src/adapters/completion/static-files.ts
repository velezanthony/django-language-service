/**
 * PRV-010, INS-009 — Static file path completion.
 *
 * Provides autocomplete for static file paths inside:
 * - HTML: `{% static "..." %}`
 * - Python: `static(...)` or `STATIC_URL + "..."`
 * - CSS: `url("...")`
 *
 * Paths are stripped of whichever static root they were found under (`static/`
 * or `staticfiles/`) — see ./static-paths.ts.
 * Honours `djangoLanguageService.excludePaths`. Files are cached with a 30s TTL.
 */
import * as vscode from 'vscode';
import type { AdapterServices } from '$adapters/types';
import { logError } from '$shared/logger';
import { buildExcludeGlobs, excludesForStaticSearch } from '$infra/exclude-paths';
import { joinExcludes } from '$infra/glob-translate';
import { buildStaticSearchGlob, stripStaticPrefix } from './static-paths';

const HTML_STATIC_TRIGGER = /\{%[-+]?\s*static\s+['"]$/;
const PYTHON_STATIC_TRIGGER = /(?:static|STATIC_URL)\s*\+?\s*['"]$/;
const CSS_URL_TRIGGER = /url\s*\(\s*['"]?$/;

const STATIC_SELECTOR: vscode.DocumentSelector = [
  { language: 'django-html' },
  { language: 'html' },
  { language: 'django-txt' },
  { language: 'python', scheme: 'file' },
  { language: 'css' },
  { language: 'scss' },
  { language: 'less' },
];

interface StaticCache {
  items: string[];
  expiresAt: number;
}

const TTL_MS = 30_000;

class DjangoStaticFileCompletionProvider implements vscode.CompletionItemProvider {
  private cache: StaticCache = { items: [], expiresAt: 0 };

  /** Same reason as the template-path completion: the scan is the sharper signal. */
  clear(): void {
    this.cache = { items: [], expiresAt: 0 };
  }

  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.CompletionItem[] | undefined> {
    try {
      const linePrefix = document.lineAt(position).text.substring(0, position.character);
      const lang = document.languageId;

      // django-txt covers Django email templates, which also use {% static %}.
      const isHtml = lang === 'html' || lang === 'django-html' || lang === 'django-txt';
      const isPython = lang === 'python';
      const isCss = lang === 'css' || lang === 'scss' || lang === 'less';

      if (isHtml && !HTML_STATIC_TRIGGER.test(linePrefix)) return undefined;
      if (isPython && !PYTHON_STATIC_TRIGGER.test(linePrefix)) return undefined;
      if (isCss && !CSS_URL_TRIGGER.test(linePrefix)) return undefined;
      if (!isHtml && !isPython && !isCss) return undefined;

      if (Date.now() > this.cache.expiresAt) {
        // Honour `djangoLanguageService.excludePaths` — the setting promises
        // directories are "skipped entirely when indexing the workspace", and
        // this is indexing. Read per refresh so a settings change lands on the
        // next cache miss instead of waiting for a reload. The static roots
        // themselves are stripped out, or the search would exclude its own tree.
        const configured = vscode.workspace
          .getConfiguration('djangoLanguageService')
          .get<string[]>('excludePaths');
        const exclude = joinExcludes(buildExcludeGlobs(excludesForStaticSearch(configured)));

        const files = await vscode.workspace.findFiles(buildStaticSearchGlob(), exclude ?? null);

        // No `__` substring filter here: it silently dropped legitimate names
        // like `my__theme.css`. `__pycache__` is a directory, and directories
        // are the exclude list's job.
        const paths = files.map(f => stripStaticPrefix(vscode.workspace.asRelativePath(f)));

        this.cache = { items: paths, expiresAt: Date.now() + TTL_MS };
      }

      return this.cache.items.map(staticPath => {
        const ext = staticPath.split('.').pop()?.toLowerCase();
        let kind = vscode.CompletionItemKind.File;

        if (ext === 'css' || ext === 'scss') kind = vscode.CompletionItemKind.Color;
        else if (ext === 'js' || ext === 'ts') kind = vscode.CompletionItemKind.Module;
        else if (['png', 'jpg', 'jpeg', 'svg', 'gif', 'webp', 'ico'].includes(ext ?? '')) {
          kind = vscode.CompletionItemKind.Constant;
        }

        const item = new vscode.CompletionItem(staticPath, kind);
        item.detail = 'Static file';
        item.insertText = staticPath;
        return item;
      });
    } catch (err) {
      logError('Static file completion failed', err);
      return undefined;
    }
  }
}

export function register(
  _ctx: vscode.ExtensionContext,
  services: AdapterServices,
): vscode.Disposable {
  const provider = new DjangoStaticFileCompletionProvider();
  const scanned = services.onProjectChange?.(() => {
    provider.clear();
  });

  return vscode.Disposable.from(
    vscode.languages.registerCompletionItemProvider(STATIC_SELECTOR, provider, '"', "'"),
    ...(scanned ? [scanned] : []),
  );
}
