/**
 * PRV-009, INS-012..016 — Python snippet completion.
 *
 * Context-aware snippets for Django Python files:
 * - models.py → dm* snippets (Django Model)
 * - forms.py  → dfo* snippets (Django Form)
 * - views.py  → dv* snippets (Django View)
 * - admin.py  → da* snippets (Django Admin)
 * - urls.py   → du* snippets (Django URL)
 * - general   → dimpor* snippets (available everywhere)
 *
 * Snippets are loaded from JSON files in the extension's `resources/snippets/` dir.
 * Respects `djangoLanguageService.snippets.enabled` configuration.
 */
import * as vscode from 'vscode';
import * as path from 'path';
import type { AdapterServices } from '$adapters/types';
import { logError } from '$shared/logger';

interface SnippetDef {
  readonly label: string;
  readonly insertText: string;
  readonly detail: string;
}

interface FileContextRule {
  readonly filePatterns: readonly RegExp[];
  readonly categoryPrefix: string;
  readonly detail: string;
}

const FILE_CONTEXT_RULES: readonly FileContextRule[] = [
  { filePatterns: [/models?[/\\]/, /models?\.py$/], categoryPrefix: 'dm', detail: 'Django Model' },
  { filePatterns: [/forms?[/\\]/, /forms?\.py$/], categoryPrefix: 'dfo', detail: 'Django Form' },
  { filePatterns: [/views?[/\\]/, /views?\.py$/], categoryPrefix: 'dv', detail: 'Django View' },
  { filePatterns: [/admin[/\\]/, /admin\.py$/], categoryPrefix: 'da', detail: 'Django Admin' },
  { filePatterns: [/urls?[/\\]/, /urls?\.py$/], categoryPrefix: 'du', detail: 'Django URL' },
  { filePatterns: [/migrations?[/\\]/], categoryPrefix: 'dm', detail: 'Django Migration' },
  {
    filePatterns: [/managers?[/\\]/, /querysets?[/\\]/],
    categoryPrefix: 'dm',
    detail: 'Django Manager',
  },
  { filePatterns: [/templatetags?[/\\]/], categoryPrefix: 'dm', detail: 'Django Template Tag' },
];

const GENERAL_PREFIXES: readonly string[] = ['dimpor'];

const SNIPPET_FILES = [
  'python-models.json',
  'python-forms.json',
  'python-views.json',
  'python-admin.json',
  'python-urls.json',
];

function extractCategoryPrefix(label: string): string {
  if (label.startsWith('dfo')) return 'dfo';
  if (label.startsWith('dm')) return 'dm';
  if (label.startsWith('dv')) return 'dv';
  if (label.startsWith('da')) return 'da';
  if (label.startsWith('du')) return 'du';
  return '';
}

class DjangoPythonSnippetProvider implements vscode.CompletionItemProvider {
  private snippets: SnippetDef[] = [];
  /**
   * The in-flight load, memoised.
   *
   * A `loaded` boolean only flips AFTER the read finishes, so two completions
   * racing the first keystroke both saw false and both read and parsed every
   * snippet file, appending each definition twice.
   */
  private loading: Promise<void> | undefined;

  constructor(private readonly extensionPath: string) {}

  async provideCompletionItems(
    document: vscode.TextDocument,
    _position: vscode.Position,
  ): Promise<vscode.CompletionItem[] | undefined> {
    if (document.languageId !== 'python') return undefined;

    try {
      const config = vscode.workspace.getConfiguration('djangoLanguageService');
      if (!config.get<boolean>('snippets.enabled', true)) return undefined;

      this.loading ??= this.loadSnippets();
      await this.loading;

      const filePath = document.uri.fsPath;
      const matchingPrefixes = new Set<string>();

      for (const rule of FILE_CONTEXT_RULES) {
        if (rule.filePatterns.some(p => p.test(filePath))) {
          matchingPrefixes.add(rule.categoryPrefix);
        }
      }

      if (matchingPrefixes.size === 0) {
        return this.snippets
          .filter(s => GENERAL_PREFIXES.some(p => s.label.startsWith(p)))
          .map(s => this.toItem(s));
      }

      return this.snippets
        .filter(
          s =>
            matchingPrefixes.has(extractCategoryPrefix(s.label)) ||
            GENERAL_PREFIXES.some(p => s.label.startsWith(p)),
        )
        .map(s => this.toItem(s));
    } catch (err) {
      logError('Python snippet completion failed', err);
      return undefined;
    }
  }

  private toItem(s: SnippetDef): vscode.CompletionItem {
    const item = new vscode.CompletionItem(s.label, vscode.CompletionItemKind.Snippet);
    item.insertText = new vscode.SnippetString(s.insertText);
    item.detail = s.detail;
    return item;
  }

  private async loadSnippets(): Promise<void> {
    for (const fileName of SNIPPET_FILES) {
      try {
        const uri = vscode.Uri.file(
          path.join(this.extensionPath, 'resources', 'snippets', fileName),
        );
        const bytes = await vscode.workspace.fs.readFile(uri);
        const parsed = JSON.parse(Buffer.from(bytes).toString()) as Record<
          string,
          {
            prefix: string;
            body: string | string[];
            description?: string;
          }
        >;

        for (const [snippetName, data] of Object.entries(parsed)) {
          const body = Array.isArray(data.body) ? data.body.join('\n') : data.body;
          this.snippets.push({
            label: data.prefix,
            insertText: body,
            detail: data.description ?? snippetName,
          });
        }
      } catch (err) {
        // One bad file costs its own snippets, not the rest. Logged rather
        // than swallowed: a snippet catalogue that quietly shipped broken
        // reads as "the feature does nothing" from the outside.
        logError(`Could not load snippet file ${fileName}`, err);
      }
    }
  }
}

export function register(
  ctx: vscode.ExtensionContext,
  _services: AdapterServices,
): vscode.Disposable {
  const pythonSelector: vscode.DocumentSelector = { language: 'python', scheme: 'file' };
  return vscode.languages.registerCompletionItemProvider(
    pythonSelector,
    new DjangoPythonSnippetProvider(ctx.extensionPath),
  );
}
