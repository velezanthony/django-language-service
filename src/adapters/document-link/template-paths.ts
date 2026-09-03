/**
 * PRV-013, INS-004 — Template path document links.
 *
 * Makes template paths clickable (underlined) in:
 * - DTL: `{% include "path" %}` and `{% extends "path" %}`
 * - Python: `render(request, "path")` and `template_name = "path"`
 * - Relative paths: `"../path/to/file"` or `"./path"`
 *
 * Each detected path is resolved to a workspace URI and turned into a
 * clickable DocumentLink.
 */
import * as vscode from 'vscode';
import { resolveTemplatePath } from '$adapters/_shared/template-resolve';
import { liveTokens } from '$domain/parsers/_shared/dtl-lexer';
import type { AdapterServices } from '$adapters/types';
import { isInsideAnyRoot } from '$adapters/_shared/workspace-containment';
import { logError } from '$shared/logger';
import { DTL_AND_PYTHON_SELECTOR } from '$adapters/_shared/languages';

class DjangoDocumentLinkProvider implements vscode.DocumentLinkProvider {
  async provideDocumentLinks(document: vscode.TextDocument): Promise<vscode.DocumentLink[]> {
    const links: vscode.DocumentLink[] = [];
    const text = document.getText();
    const isHtml = ['html', 'django-html', 'django-txt'].includes(document.languageId);
    const isPython = document.languageId === 'python';

    if (!isHtml && !isPython) return links;

    try {
      // Pattern 1: {% include/extends "path" %}. From live tokens, so a path
      // written inside {% comment %} is not offered as a link to follow.
      let m: RegExpExecArray | null;
      for (const token of liveTokens(text)) {
        if (token.kind !== 'tag' || (token.name !== 'include' && token.name !== 'extends'))
          continue;
        const quoted = /["']([^"']+)["']/.exec(token.inner);
        if (!quoted) continue;
        const link = await this.resolveTemplateLinkAt(
          document,
          quoted[1]!,
          token.innerStart + token.inner.indexOf(quoted[1]!),
        );
        if (link) links.push(link);
      }

      // Pattern 2: render(request, "path") or template_name = "path"
      if (isPython) {
        const pyRe = /(?:render\s*\(\s*\w+\s*,\s*|template_name\s*[:=]\s*)["']([^"']+)["']/g;
        while ((m = pyRe.exec(text)) !== null) {
          const link = await this.resolveTemplateLink(document, m[1] ?? '', m);
          if (link) links.push(link);
        }
      }

      // Pattern 3: relative paths ("../path" or "./path")
      const relRe = /["'](\.\.?\/[^"'\s]+)["']/g;
      while ((m = relRe.exec(text)) !== null) {
        const link = await this.resolveRelativeLink(document, m[1] ?? '', m);
        if (link) links.push(link);
      }
    } catch (err) {
      logError('Document link resolution failed', err);
    }

    return links;
  }

  private async resolveTemplateLink(
    document: vscode.TextDocument,
    templatePath: string,
    match: RegExpExecArray,
  ): Promise<vscode.DocumentLink | undefined> {
    if (!templatePath) return undefined;

    return this.resolveTemplateLinkAt(
      document,
      templatePath,
      match.index + match[0].indexOf(templatePath),
    );
  }

  private async resolveTemplateLinkAt(
    document: vscode.TextDocument,
    templatePath: string,
    pathOffset: number,
  ): Promise<vscode.DocumentLink | undefined> {
    if (!templatePath) return undefined;

    const range = new vscode.Range(
      document.positionAt(pathOffset),
      document.positionAt(pathOffset + templatePath.length),
    );

    const uri = await resolveTemplatePath(templatePath);
    if (!uri) return undefined;

    return new vscode.DocumentLink(range, uri);
  }

  private async resolveRelativeLink(
    document: vscode.TextDocument,
    relativePath: string,
    match: RegExpExecArray,
  ): Promise<vscode.DocumentLink | undefined> {
    if (!relativePath) return undefined;

    const pathOffset = match.index + match[0].indexOf(relativePath);
    const range = new vscode.Range(
      document.positionAt(pathOffset),
      document.positionAt(pathOffset + relativePath.length),
    );

    const docDir = vscode.Uri.joinPath(document.uri, '..');
    const targetUri = vscode.Uri.joinPath(docDir, relativePath);

    // A relative reference is workspace-supplied text, and joinPath will walk
    // out of the tree for it: `"../../../../etc/shadow"` became a clickable
    // link, and the stat() below answered whether an arbitrary path exists on
    // this machine — an oracle driven by a repository the user may only have
    // opened to read.
    const roots = (vscode.workspace.workspaceFolders ?? []).map(f => f.uri.fsPath);
    if (!isInsideAnyRoot(targetUri.fsPath, roots)) return undefined;

    try {
      await vscode.workspace.fs.stat(targetUri);
      return new vscode.DocumentLink(range, targetUri);
    } catch {
      return undefined;
    }
  }
}

export function register(
  _ctx: vscode.ExtensionContext,
  _services: AdapterServices,
): vscode.Disposable {
  return vscode.languages.registerDocumentLinkProvider(
    DTL_AND_PYTHON_SELECTOR,
    new DjangoDocumentLinkProvider(),
  );
}
