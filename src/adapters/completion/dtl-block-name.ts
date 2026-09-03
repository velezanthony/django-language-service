/**
 * PRV-003, INS-020, DTL-009 — DTL block name completion.
 *
 * Inside `{% block <cursor> %}`, resolves the parent template's available
 * block names and suggests them. Follows the `{% extends %}` chain up to
 * 5 levels deep, excluding blocks already defined in the current file.
 */
import * as vscode from 'vscode';
import { resolveTemplatePath } from '$adapters/_shared/template-resolve';
import { liveTokens } from '$domain/parsers/_shared/dtl-lexer';
import type { AdapterServices } from '$adapters/types';
import { logError } from '$shared/logger';
import { DTL_SELECTOR } from '$adapters/_shared/languages';
import { PY_IDENT } from '$domain/parsers/_shared/python-tokens';

const BLOCK_TRIGGER_RE = /\{%[-+]?\s*block\s+\w*$/;
// Tag INTERIORS only — the lexer owns the delimiters, and owning them here is
// what let a `{% block %}` written inside `{% comment %}` be offered as a real
// block, and a commented-out `{% extends %}` decide the parent template.
// Group 1 is the delimiter, group 2 the path. `['"]([^'"]+)['"]` accepted
// EITHER quote as the close, so `{% extends "user's-base.html" %}` read as
// `user`, the parent was never found, and the block completions this provider
// exists for simply stopped appearing.
const EXTENDS_BODY_RE = /^extends\s+(['"])((?:(?!\1)[^\\]|\\.)*)\1/;
const BLOCK_BODY_RE = new RegExp(String.raw`^block\s+(${PY_IDENT})`, 'u');

const APP_NAME = 'Django Language Service';

/** Same window the sibling completion providers use. */
const BLOCK_CACHE_TTL_MS = 30_000;

/** `{% block <name> %}` names the template actually declares. */
function extractBlockNames(source: string): string[] {
  const names: string[] = [];
  for (const token of liveTokens(source)) {
    const m = token.kind === 'tag' ? BLOCK_BODY_RE.exec(token.inner) : null;
    if (m) names.push(m[1]!);
  }
  return names;
}

/** The parent template, from the `{% extends %}` Django would actually run. */
export function extendsTarget(source: string): string | undefined {
  for (const token of liveTokens(source)) {
    const m = token.kind === 'tag' ? EXTENDS_BODY_RE.exec(token.inner) : null;
    if (m) return m[2]!;
  }
  return undefined;
}

class DtlBlockNameCompletionProvider implements vscode.CompletionItemProvider {
  /**
   * Parent block names, keyed by template path.
   *
   * It had no expiry and no invalidation at all, so the first lookup of a
   * parent template was the ONLY one: add `{% block sidebar %}` to base.html
   * and it never appeared in a child's completions, delete one and it was
   * offered for the rest of the session. The sibling providers already use a
   * 30s TTL; `clear()` on the next scan is the sharper signal, and the scanner
   * watches `templates/**` already, so both are wired.
   */
  private readonly cache = new Map<string, string[]>();
  private expiresAt = 0;

  /** Drop everything — a scan has reported new template contents. */
  clear(): void {
    this.cache.clear();
    this.expiresAt = 0;
  }

  private freshCache(): Map<string, string[]> {
    if (Date.now() > this.expiresAt) {
      this.cache.clear();
      this.expiresAt = Date.now() + BLOCK_CACHE_TTL_MS;
    }
    return this.cache;
  }

  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.CompletionItem[] | undefined> {
    try {
      const textBefore = document.lineAt(position).text.substring(0, position.character);
      if (!BLOCK_TRIGGER_RE.test(textBefore)) return undefined;

      const source = document.getText();
      const parentPath = extendsTarget(source);
      if (!parentPath) return undefined;

      const blockNames = await this.resolveParentBlocks(parentPath, 0);
      if (blockNames.length === 0) return undefined;

      const currentBlocks = new Set(extractBlockNames(source));

      return blockNames
        .filter(name => !currentBlocks.has(name))
        .map(name => {
          const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Snippet);
          item.detail = `${APP_NAME} — parent block`;
          item.insertText = new vscode.SnippetString(`${name} %}\n  $0\n{% endblock ${name}`);
          item.documentation = new vscode.MarkdownString(
            `Override block \`${name}\` from parent template.`,
          );
          item.sortText = `0_${name}`;
          return item;
        });
    } catch (err) {
      logError('Block name completion failed', err);
      return undefined;
    }
  }

  private async resolveParentBlocks(templatePath: string, depth: number): Promise<string[]> {
    if (depth > 5) return [];

    const cache = this.freshCache();
    const cached = cache.get(templatePath);
    if (cached) return cached;

    try {
      const uri = await resolveTemplatePath(templatePath);
      if (!uri) return [];

      const bytes = await vscode.workspace.fs.readFile(uri);
      const source = new TextDecoder().decode(bytes);
      const blocks = extractBlockNames(source);

      // Follow parent chain
      const parentPath = extendsTarget(source);
      if (parentPath) {
        const grandparentBlocks = await this.resolveParentBlocks(parentPath, depth + 1);
        for (const b of grandparentBlocks) {
          if (!blocks.includes(b)) blocks.push(b);
        }
      }

      cache.set(templatePath, blocks);
      return blocks;
    } catch {
      return [];
    }
  }
}

export function register(
  _ctx: vscode.ExtensionContext,
  services: AdapterServices,
): vscode.Disposable {
  const provider = new DtlBlockNameCompletionProvider();
  const scanned = services.onProjectChange?.(() => {
    provider.clear();
  });

  return vscode.Disposable.from(
    vscode.languages.registerCompletionItemProvider(DTL_SELECTOR, provider, ' '),
    ...(scanned ? [scanned] : []),
  );
}
